import { AgentSession } from "./session";
import type {
  Agent,
  AgentRunResult,
  CreateAgentSessionOptions,
  CreateAgentOptions,
} from "./types";
import { AgentRuntime } from "./runtime";

function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createAgent(
  options: CreateAgentOptions,
): Promise<Agent> {
  const runtime = new AgentRuntime(options, options.conversationService);
  return {
    async run(input: string): Promise<AgentRunResult> {
      const scope = runtime.createSessionScope();
      const session = new AgentSession(runtime, createSessionId(), scope, []);
      return session.run(input);
    },
    async createSession(
      sessionOptions?: string | CreateAgentSessionOptions,
    ): Promise<AgentSession> {
      const normalized =
        typeof sessionOptions === "string"
          ? { sessionId: sessionOptions }
          : sessionOptions ?? {};
      const scope = runtime.createSessionScope(normalized.conversationId);

      return new AgentSession(
        runtime,
        normalized.sessionId ?? createSessionId(),
        scope,
        normalized.messages ?? [],
      );
    },
  };
}
