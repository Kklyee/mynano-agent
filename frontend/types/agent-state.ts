export type AgentBackendEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "message.appended"; sessionId: string; role: string; content: string }
  | { type: "assistant.stream.started"; sessionId: string }
  | { type: "assistant.stream.delta"; sessionId: string; delta: string }
  | { type: "assistant.stream.completed"; sessionId: string; content: string }
  | { type: "tool.called"; sessionId: string; name: string; args: unknown }
  | { type: "tool.completed"; sessionId: string; name: string; result: string }
  | { type: "task.created"; sessionId: string; taskId: number; subject: string }
  | { type: "task.updated"; sessionId: string; taskId: number; status: string }
  | { type: "background.updated"; sessionId: string; taskId: string; status: string }
  | { type: "session.completed"; sessionId?: string; result?: string; output?: string; steps?: number }
  | { type: "session.failed"; sessionId?: string; error: string };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  status?: "running" | "complete" | "incomplete";
  sequence?: number;
};

export type AgentTool = {
  id: string;
  name: string;
  status: "running" | "completed";
  args?: unknown;
  result?: string;
  startedAt: string;
  completedAt?: string;
  sequence?: number;
};

export type AgentTask = {
  taskId: number;
  subject?: string;
  status: string;
  updatedAt: string;
  sequence?: number;
};

export type AgentBackgroundTask = {
  taskId: string;
  status: string;
  updatedAt: string;
  sequence?: number;
};

export type AgentSession = {
  threadId: string | null;
  sessionId: string | null;
  status: "idle" | "connecting" | "running" | "completed" | "failed";
  steps: number;
  lastEventType: string | null;
  error: string | null;
};

export type AgentState = {
  messages: AgentMessage[];
  tools: AgentTool[];
  tasks: AgentTask[];
  backgroundTasks: AgentBackgroundTask[];
  session: AgentSession;
};

export type AgentTransportMessage = AgentMessage;
export type AgentTransportTool = AgentTool;
export type AgentTransportTask = AgentTask;
export type AgentTransportBackgroundTask = AgentBackgroundTask;
export type AgentTransportState = AgentState;

export const createEmptyAgentTransportState = (): AgentState => ({
  messages: [],
  tools: [],
  tasks: [],
  backgroundTasks: [],
  session: {
    threadId: null,
    sessionId: null,
    status: "idle",
    steps: 0,
    lastEventType: null,
    error: null,
  },
});
