import type { ToolsType } from "../tools/types";

export type AgentEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "message.appended"; sessionId: string; role: string; content: string }
  | { type: "assistant.stream.started"; sessionId: string }
  | { type: "assistant.stream.delta"; sessionId: string; delta: string }
  | { type: "assistant.stream.completed"; sessionId: string; content: string }
  | { type: "tool.called"; sessionId: string; name: ToolsType; args: unknown }
  | { type: "tool.completed"; sessionId: string; name: ToolsType; result: string }
  | { type: "task.created"; sessionId: string; taskId: number; subject: string }
  | { type: "task.updated"; sessionId: string; taskId: number; status: string }
  | { type: "background.started"; sessionId: string; taskId: string; status: string }
  | { type: "background.updated"; sessionId: string; taskId: string; status: string }
  | { type: "session.completed"; sessionId: string; result: string }
  | { type: "session.failed"; sessionId: string; error: string };
