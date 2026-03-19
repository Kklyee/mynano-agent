import {
  createEmptyAgentTransportState,
  type AgentBackendEvent,
  type AgentBackgroundTask,
  type AgentMessage,
  type AgentState,
  type AgentTask,
  type AgentTool,
} from "@/types/agent-state";

export type AgentEventLog = {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
};

export type AgentStudioState = AgentState & {
  eventLog: AgentEventLog[];
  nextSequence: number;
};

export type ConversationListItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
};

export type ConversationDetailPayload = {
  conversation: ConversationListItem;
  messages: Array<{
    id: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    sequence: number;
    status: "streaming" | "complete" | "failed" | "partial";
    createdAt: string;
  }>;
  tools: Array<{
    id: string;
    name: string;
    argsJson: string | null;
    resultText: string | null;
    status: "running" | "completed";
    sequence: number;
    startedAt: string;
    completedAt: string | null;
  }>;
  tasks: Array<{
    taskId: number;
    subject: string | null;
    description: string | null;
    owner: string | null;
    blockedBy: number[];
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  taskEvents: Array<{
    id: string;
    taskId: number;
    subject: string | null;
    status: string;
    sequence: number;
    updatedAt: string;
  }>;
  backgroundTasks: Array<{
    taskId: string;
    command: string | null;
    summary: string | null;
    status: string;
    startedAt: string;
    completedAt: string | null;
    exitCode: number | null;
  }>;
  backgroundEvents: Array<{
    id: string;
    taskId: string;
    command: string | null;
    summary: string | null;
    status: string;
    sequence: number;
    updatedAt: string;
  }>;
};

const HIDDEN_TOOL_NAMES = new Set([
  "task_create",
  "task_update",
  "task_list",
  "task_get",
]);

const MAX_EVENT_LOGS = 20;

export const getAgentApiBaseUrl = () =>
  process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ||
  "http://localhost:3001";

export const createEmptyAgentStudioState = (): AgentStudioState => ({
  ...createEmptyAgentTransportState(),
  eventLog: [],
  nextSequence: 0,
});

export const hydrateConversationState = (
  detail: ConversationDetailPayload,
): AgentStudioState => {
  const messagesPayload = detail.messages ?? [];
  const toolsPayload = detail.tools ?? [];
  const tasksPayload = detail.tasks ?? [];
  const taskEventsPayload = detail.taskEvents ?? [];
  const backgroundTasksPayload = detail.backgroundTasks ?? [];
  const backgroundEventsPayload = detail.backgroundEvents ?? [];
  const messages = messagesPayload
    .filter(
      (
        message,
      ): message is ConversationDetailPayload["messages"][number] & {
        role: "user" | "assistant";
      } => message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.content,
      createdAt: message.createdAt,
      status: (
        message.status === "complete"
          ? "complete"
          : message.status === "streaming"
            ? "running"
            : "incomplete"
      ) as "complete" | "running" | "incomplete",
      sequence: message.sequence,
    }));
  const tools = toolsPayload
    .filter((tool) => shouldDisplayTool(tool.name))
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      status: tool.status,
      args: tool.argsJson ? JSON.parse(tool.argsJson) : undefined,
      result: tool.resultText ?? undefined,
      startedAt: tool.startedAt,
      completedAt: tool.completedAt ?? undefined,
      sequence: tool.sequence,
    }));
  const taskSequenceMap = new Map<number, number>();
  for (const event of taskEventsPayload) {
    taskSequenceMap.set(event.taskId, event.sequence);
  }
  const backgroundSequenceMap = new Map<string, number>();
  for (const event of backgroundEventsPayload) {
    backgroundSequenceMap.set(event.taskId, event.sequence);
  }
  const tasks = tasksPayload.map((task) => ({
    taskId: task.taskId,
    subject: task.subject ?? undefined,
    description: task.description ?? undefined,
    owner: task.owner ?? undefined,
    blockedBy: task.blockedBy,
    status: task.status,
    updatedAt: task.updatedAt,
    sequence: taskSequenceMap.get(task.taskId),
  }));
  const backgroundTasks = backgroundTasksPayload.map((task) => ({
    taskId: task.taskId,
    command: task.command ?? undefined,
    summary: task.summary ?? undefined,
    status: task.status,
    startedAt: task.startedAt,
    completedAt: task.completedAt ?? undefined,
    exitCode: task.exitCode,
    updatedAt: task.completedAt ?? task.startedAt,
    sequence: backgroundSequenceMap.get(task.taskId),
  }));
  const nextSequence = Math.max(
    -1,
    ...messages.map((message) => message.sequence ?? -1),
    ...tools.map((tool) => tool.sequence ?? -1),
    ...taskEventsPayload.map((event) => event.sequence ?? -1),
    ...backgroundEventsPayload.map((event) => event.sequence ?? -1),
  ) + 1;

  return {
    ...createEmptyAgentStudioState(),
    messages,
    tools,
    tasks,
    backgroundTasks,
    session: {
      ...createEmptyAgentTransportState().session,
      threadId: detail.conversation.id,
      status: "idle",
    },
    nextSequence,
  };
};

const createUserMessage = (text: string, sequence: number): AgentMessage => ({
  id: `user-${crypto.randomUUID()}`,
  role: "user",
  text,
  createdAt: new Date().toISOString(),
  sequence,
});

const createAssistantMessage = (sequence: number): AgentMessage => ({
  id: `assistant-${crypto.randomUUID()}`,
  role: "assistant",
  text: "",
  createdAt: new Date().toISOString(),
  status: "running",
  sequence,
});

const getTailAssistantIndex = (messages: AgentMessage[]) => {
  const lastMessage = messages.at(-1);
  return lastMessage?.role === "assistant" ? messages.length - 1 : -1;
};

const getLastToolSequence = (tools: AgentTool[]) => tools.at(-1)?.sequence ?? -1;

const getWritableAssistantIndex = (state: AgentStudioState) => {
  const tailIndex = getTailAssistantIndex(state.messages);
  if (tailIndex === -1) return -1;

  const tailAssistant = state.messages[tailIndex];
  const tailSequence = tailAssistant.sequence ?? -1;
  if (tailAssistant.status === "running") return tailIndex;
  if (getLastToolSequence(state.tools) > tailSequence) return -1;
  return tailIndex;
};

const ensureStreamingAssistantIndex = (state: AgentStudioState) => {
  const tailIndex = getWritableAssistantIndex(state);
  if (tailIndex !== -1 && state.messages[tailIndex]?.status === "running") {
    return tailIndex;
  }

  state.messages.push(createAssistantMessage(state.nextSequence));
  state.nextSequence += 1;
  return state.messages.length - 1;
};

const upsertTask = (
  tasks: AgentTask[],
  nextTask: AgentTask,
): AgentTask[] => {
  const index = tasks.findIndex((task) => task.taskId === nextTask.taskId);
  if (index === -1) return [...tasks, nextTask];

  const updated = [...tasks];
  updated[index] = {
    ...updated[index],
    ...nextTask,
    sequence: nextTask.sequence ?? updated[index]?.sequence,
  };
  return updated;
};

const upsertBackgroundTask = (
  tasks: AgentBackgroundTask[],
  nextTask: AgentBackgroundTask,
): AgentBackgroundTask[] => {
  const index = tasks.findIndex((task) => task.taskId === nextTask.taskId);
  if (index === -1) return [...tasks, nextTask];

  const updated = [...tasks];
  updated[index] = {
    ...updated[index],
    ...nextTask,
    sequence: nextTask.sequence ?? updated[index]?.sequence,
  };
  return updated;
};

const startTool = (
  tools: AgentTool[],
  name: string,
  args: unknown,
  sequence: number,
): AgentTool[] => [
    ...tools,
    {
      id: `${name}-${tools.length + 1}`,
      name,
      args,
      status: "running",
      startedAt: new Date().toISOString(),
      sequence,
    },
  ];

const completeTool = (
  tools: AgentTool[],
  name: string,
  result: string,
): AgentTool[] => {
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

const normalizeTaskStatus = (status: string) => {
  switch (status) {
    case "created":
      return "pending";
    default:
      return status;
  }
};

const shouldDisplayTool = (name: string) => !HIDDEN_TOOL_NAMES.has(name);

const summarizeEvent = (event: AgentBackendEvent) => {
  switch (event.type) {
    case "session.started":
      return `Session ${event.sessionId.slice(0, 8)} started`;
    case "message.appended":
      return `${event.role} message appended`;
    case "assistant.stream.started":
      return "Assistant started streaming";
    case "assistant.stream.delta":
      return `Delta +${event.delta.length}`;
    case "assistant.stream.completed":
      return "Assistant stream completed";
    case "tool.called":
      return `Tool called: ${event.name}`;
    case "tool.completed":
      return `Tool completed: ${event.name}`;
    case "task.created":
      return `Task #${event.taskId} created`;
    case "task.updated":
      return `Task #${event.taskId} -> ${event.status}`;
    case "background.updated":
      return `Background ${event.taskId} -> ${event.status}`;
    case "session.completed":
      return "Session completed";
    case "session.failed":
      return `Session failed: ${event.error}`;
    default:
      return "Unknown event";
  }
};

const appendEventLog = (
  logs: AgentEventLog[],
  event: AgentBackendEvent,
): AgentEventLog[] =>
  [
    ...logs,
    {
      id: `${event.type}-${crypto.randomUUID()}`,
      type: event.type,
      summary: summarizeEvent(event),
      createdAt: new Date().toISOString(),
    },
  ].slice(-MAX_EVENT_LOGS);

export const beginAgentRun = (
  state: AgentStudioState,
  prompt: string,
): AgentStudioState => {
  const userMessage = createUserMessage(prompt, state.nextSequence);

  return {
    ...state,
    messages: [...state.messages, userMessage],
    session: {
      ...state.session,
      threadId: state.session.threadId ?? crypto.randomUUID(),
      status: "connecting",
      lastEventType: "command.accepted",
      error: null,
      steps: 0,
    },
    eventLog: [
      ...state.eventLog,
      {
        id: `command-${crypto.randomUUID()}`,
        type: "command.accepted",
        summary: "Prompt accepted and SSE connection requested",
        createdAt: new Date().toISOString(),
      },
    ].slice(-MAX_EVENT_LOGS),
    nextSequence: state.nextSequence + 1,
  };
};

export const failAgentRun = (
  state: AgentStudioState,
  message: string,
): AgentStudioState => ({
  ...state,
  session: {
    ...state.session,
    status: "failed",
    error: message,
  },
  eventLog: [
    ...state.eventLog,
    {
      id: `failure-${crypto.randomUUID()}`,
      type: "session.failed",
      summary: message,
      createdAt: new Date().toISOString(),
    },
  ].slice(-MAX_EVENT_LOGS),
});

export const cancelAgentRun = (state: AgentStudioState): AgentStudioState =>
  failAgentRun(state, "The run was cancelled by the client.");

export const normalizeBackendEvent = (
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

export const applyAgentEvent = (
  prevState: AgentStudioState,
  event: AgentBackendEvent,
): AgentStudioState => {
  const state: AgentStudioState = {
    ...prevState,
    messages: [...prevState.messages],
    tools: [...prevState.tools],
    tasks: [...prevState.tasks],
    backgroundTasks: [...prevState.backgroundTasks],
    session: { ...prevState.session },
    eventLog: appendEventLog(prevState.eventLog, event),
    nextSequence: prevState.nextSequence,
  };

  state.session.lastEventType = event.type;

  switch (event.type) {
    case "session.started":
      state.session.sessionId = event.sessionId;
      state.session.status = "running";
      return state;
    case "message.appended":
      if (event.role !== "assistant") return state;

      {
        const tailIndex = getWritableAssistantIndex(state);
        if (tailIndex === -1) {
          state.messages.push({
            id: `assistant-${crypto.randomUUID()}`,
            role: "assistant",
            text: event.content,
            createdAt: new Date().toISOString(),
            status: "complete",
            sequence: state.nextSequence,
          });
          state.nextSequence += 1;
          return state;
        }

        state.messages[tailIndex] = {
          ...state.messages[tailIndex],
          text: event.content,
          status: "complete",
        };
        return state;
      }
    case "assistant.stream.started":
      state.session.status = "running";
      ensureStreamingAssistantIndex(state);
      return state;
    case "assistant.stream.delta": {
      state.session.status = "running";
      const index = ensureStreamingAssistantIndex(state);
      const current = state.messages[index];
      state.messages[index] = {
        ...current,
        text: current.text + event.delta,
        status: "running",
      };
      return state;
    }
    case "assistant.stream.completed": {
      const tailIndex = getWritableAssistantIndex(state);
      if (tailIndex === -1) {
        state.messages.push({
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant",
          text: event.content,
          createdAt: new Date().toISOString(),
          status: "complete",
          sequence: state.nextSequence,
        });
        state.nextSequence += 1;
        return state;
      }

      state.messages[tailIndex] = {
        ...state.messages[tailIndex],
        text: event.content,
        status: "complete",
      };
      return state;
    }
    case "tool.called":
      if (!shouldDisplayTool(event.name)) return state;
      state.tools = startTool(state.tools, event.name, event.args, state.nextSequence);
      state.nextSequence += 1;
      return state;
    case "tool.completed":
      if (!shouldDisplayTool(event.name)) return state;
      state.tools = completeTool(state.tools, event.name, event.result);
      return state;
    case "task.created":
      state.tasks = upsertTask(state.tasks, {
        taskId: event.taskId,
        subject: event.subject,
        status: "pending",
        updatedAt: new Date().toISOString(),
        sequence: state.nextSequence,
      });
      state.nextSequence += 1;
      return state;
    case "task.updated":
      state.tasks = upsertTask(state.tasks, {
        taskId: event.taskId,
        status: normalizeTaskStatus(event.status),
        updatedAt: new Date().toISOString(),
      });
      return state;
    case "background.updated":
      state.backgroundTasks = upsertBackgroundTask(state.backgroundTasks, {
        taskId: event.taskId,
        status: normalizeTaskStatus(event.status),
        updatedAt: new Date().toISOString(),
        sequence:
          state.backgroundTasks.find((task) => task.taskId === event.taskId)?.sequence ??
          state.nextSequence,
      });
      if (!state.backgroundTasks.find((task) => task.taskId === event.taskId)) {
        state.nextSequence += 1;
      }
      return state;
    case "session.completed":
      state.session.status = "completed";
      state.session.steps = event.steps ?? state.session.steps;
      return state;
    case "session.failed":
      state.session.status = "failed";
      state.session.error = event.error;
      return state;
    default:
      return state;
  }
};

export const parseSseMessage = (block: string) => {
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

export const consumeAgentSse = async (
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

