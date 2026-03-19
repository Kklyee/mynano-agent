import {
  AssistantTransportEncoder,
  createAssistantStream,
  type AssistantStreamChunk,
} from "assistant-stream";
import type { ReadonlyJSONValue } from "assistant-stream/utils";
import {
  type AgentBackendEvent,
  type AgentTransportBackgroundTask,
  type AgentTransportMessage,
  type AgentTransportState,
  type AgentTransportTask,
  type AgentTransportTool,
  createEmptyAgentTransportState,
} from "@/types/agent-state";

export const runtime = "nodejs";

type AddMessageCommand = {
  type: "add-message";
  message: {
    role: "user" | "assistant";
    parts: Array<{ type: string; text?: string }>;
  };
};

type SendCommandsBody = {
  state?: AgentTransportState;
  commands?: AddMessageCommand[];
  threadId?: string | null;
};

const HIDDEN_TOOL_NAMES = new Set([
  "task_create",
  "task_update",
  "task_list",
  "task_get",
  "todo_write",
]);

const setRootState = (state: AgentTransportState): AssistantStreamChunk => ({
  type: "update-state",
  path: [],
  operations: [{ type: "set", path: [], value: state as unknown as ReadonlyJSONValue }],
});

const getBackendBaseUrl = () =>
  process.env.NEXT_PUBLIC_AGENT_API_BASE_URL?.replace(/\/$/, "") ||
  process.env.AGENT_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3001";

const normalizeState = (state: SendCommandsBody["state"]) => {
  if (!state) return createEmptyAgentTransportState();
  return {
    ...createEmptyAgentTransportState(),
    ...state,
    session: {
      ...createEmptyAgentTransportState().session,
      ...state.session,
    },
  };
};

const getPromptFromCommand = (command?: AddMessageCommand) => {
  if (!command || command.message.role !== "user") return "";
  return command.message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
};

const createUserMessage = (text: string): AgentTransportMessage => ({
  id: `user-${crypto.randomUUID()}`,
  role: "user",
  text,
  createdAt: new Date().toISOString(),
});

const createAssistantMessage = (): AgentTransportMessage => ({
  id: `assistant-${crypto.randomUUID()}`,
  role: "assistant",
  text: "",
  createdAt: new Date().toISOString(),
  status: "running",
});

const getTailAssistantIndex = (messages: AgentTransportMessage[]) => {
  const lastMessage = messages.at(-1);
  return lastMessage?.role === "assistant" ? messages.length - 1 : -1;
};

const ensureStreamingAssistantIndex = (messages: AgentTransportMessage[]) => {
  const tailIndex = getTailAssistantIndex(messages);
  if (tailIndex !== -1 && messages[tailIndex]?.status === "running") {
    return tailIndex;
  }

  messages.push(createAssistantMessage());
  return messages.length - 1;
};

const upsertTask = (
  tasks: AgentTransportTask[],
  nextTask: AgentTransportTask,
): AgentTransportTask[] => {
  const index = tasks.findIndex((task) => task.taskId === nextTask.taskId);
  if (index === -1) return [...tasks, nextTask];

  const updated = [...tasks];
  updated[index] = { ...updated[index], ...nextTask };
  return updated;
};

const upsertBackgroundTask = (
  tasks: AgentTransportBackgroundTask[],
  nextTask: AgentTransportBackgroundTask,
): AgentTransportBackgroundTask[] => {
  const index = tasks.findIndex((task) => task.taskId === nextTask.taskId);
  if (index === -1) return [...tasks, nextTask];

  const updated = [...tasks];
  updated[index] = { ...updated[index], ...nextTask };
  return updated;
};

const normalizeTaskStatus = (status: string) => {
  switch (status) {
    case "created":
      return "pending";
    default:
      return status;
  }
};

const shouldDisplayTool = (name: string) => !HIDDEN_TOOL_NAMES.has(name);

const startTool = (
  tools: AgentTransportTool[],
  name: string,
  args: unknown,
): AgentTransportTool[] => {
  return [
    ...tools,
    {
      id: `${name}-${tools.length + 1}`,
      name,
      args,
      status: "running",
      startedAt: new Date().toISOString(),
    },
  ];
};

const completeTool = (
  tools: AgentTransportTool[],
  name: string,
  result: string,
): AgentTransportTool[] => {
  const reverseIndex = [...tools]
    .reverse()
    .findIndex((tool) => tool.name === name && tool.status === "running");
  if (reverseIndex === -1) return tools;

  const index = tools.length - 1 - reverseIndex;
  const updated = [...tools];
  updated[index] = {
    ...updated[index],
    status: "completed",
    result,
    completedAt: new Date().toISOString(),
  };
  return updated;
};

const normalizeBackendEvent = (
  eventName: string,
  rawData: string,
): AgentBackendEvent => {
  const parsed = JSON.parse(rawData) as Record<string, unknown>;
  const type = typeof parsed.type === "string" ? parsed.type : eventName;
  return {
    ...(parsed as object),
    type,
  } as AgentBackendEvent;
};

const applyBackendEvent = (
  state: AgentTransportState,
  event: AgentBackendEvent,
) => {
  state.session.lastEventType = event.type;

  switch (event.type) {
    case "session.started":
      state.session.sessionId = event.sessionId;
      state.session.status = "running";
      return;
    case "message.appended":
      if (event.role !== "assistant") return;

      {
        const tailIndex = getTailAssistantIndex(state.messages);
        if (tailIndex === -1) {
          state.messages.push({
            id: `assistant-${crypto.randomUUID()}`,
            role: "assistant",
            text: event.content,
            createdAt: new Date().toISOString(),
            status: "complete",
          });
          return;
        }

        state.messages[tailIndex] = {
          ...state.messages[tailIndex],
          text: event.content,
          status: "complete",
        };
        return;
      }
    case "assistant.stream.started":
      state.session.status = "running";
      ensureStreamingAssistantIndex(state.messages);
      return;
    case "assistant.stream.delta": {
      state.session.status = "running";
      const index = ensureStreamingAssistantIndex(state.messages);
      const current = state.messages[index];
      state.messages[index] = {
        ...current,
        text: current.text + event.delta,
        status: "running",
      };
      return;
    }
    case "assistant.stream.completed": {
      const tailIndex = getTailAssistantIndex(state.messages);
      if (tailIndex === -1) {
        state.messages.push({
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant",
          text: event.content,
          createdAt: new Date().toISOString(),
          status: "complete",
        });
        return;
      }

      state.messages[tailIndex] = {
        ...state.messages[tailIndex],
        text: event.content,
        status: "complete",
      };
      return;
    }
    case "tool.called":
      if (!shouldDisplayTool(event.name)) return;
      state.tools = startTool(state.tools, event.name, event.args);
      return;
    case "tool.completed":
      if (!shouldDisplayTool(event.name)) return;
      state.tools = completeTool(state.tools, event.name, event.result);
      return;
    case "task.created":
      state.tasks = upsertTask(state.tasks, {
        taskId: event.taskId,
        subject: event.subject,
        status: "pending",
        updatedAt: new Date().toISOString(),
      });
      return;
    case "task.updated":
      state.tasks = upsertTask(state.tasks, {
        taskId: event.taskId,
        status: normalizeTaskStatus(event.status),
        updatedAt: new Date().toISOString(),
      });
      return;
    case "background.updated":
      state.backgroundTasks = upsertBackgroundTask(state.backgroundTasks, {
        taskId: event.taskId,
        status: normalizeTaskStatus(event.status),
        updatedAt: new Date().toISOString(),
      });
      return;
    case "session.completed":
      state.session.status = "completed";
      state.session.steps = event.steps ?? state.session.steps;
      return;
    case "session.failed":
      state.session.status = "failed";
      state.session.error = event.error;
      return;
    default:
      return;
  }
};

const parseSseMessage = (block: string) => {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) return null;
  return {
    event,
    data: dataLines.join("\n"),
  };
};

const consumeSse = async (
  stream: ReadableStream<Uint8Array>,
  onMessage: (message: { event: string; data: string }) => void | Promise<void>,
) => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const message = parseSseMessage(chunk);
      if (message) {
        await onMessage(message);
      }
      boundary = buffer.indexOf("\n\n");
    }

    if (done) break;
  }
};

export async function POST(request: Request) {
  const body = (await request.json()) as SendCommandsBody;
  const commands = body.commands ?? [];
  const state = normalizeState(body.state);
  const latestMessageCommand = [...commands]
    .reverse()
    .find((command) => command.type === "add-message");
  const prompt = getPromptFromCommand(latestMessageCommand);

  if (!prompt) {
    const encoder = new AssistantTransportEncoder();
    const emptyStream = createAssistantStream((controller) => {
      controller.enqueue(setRootState(state));
    });

    return new Response(emptyStream.pipeThrough(encoder), {
      headers: encoder.headers,
    });
  }

  state.session.threadId = body.threadId ?? state.session.threadId ?? crypto.randomUUID();
  state.session.status = "connecting";
  state.session.error = null;
  state.session.lastEventType = "command.accepted";
  state.session.steps = 0;
  state.tools = [];
  state.tasks = [];
  state.backgroundTasks = [];
  state.messages.push(createUserMessage(prompt));

  const stream = createAssistantStream(async (controller) => {
    controller.enqueue(setRootState(state));

    const response = await fetch(`${getBackendBaseUrl()}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      state.session.status = "failed";
      state.session.error = `Upstream agent request failed with status ${response.status}`;
      controller.enqueue(setRootState(state));
      return;
    }

    await consumeSse(response.body, async (message) => {
      const event = normalizeBackendEvent(message.event, message.data);
      applyBackendEvent(state, event);
      controller.enqueue(setRootState(state));
    });
  });

  const encoder = new AssistantTransportEncoder();
  return new Response(stream.pipeThrough(encoder), {
    headers: encoder.headers,
  });
}
