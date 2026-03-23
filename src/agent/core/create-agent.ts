import { AgentSession } from "../session/session";
import { AgentRuntime } from "./runtime";
import type {
	Agent,
	AgentRunResult,
	AgentSession as AgentSessionContract,
	CreateAgentOptions,
	CreateAgentSessionOptions
} from "./types";

export async function createAgent(options: CreateAgentOptions): Promise<Agent> {
	const runtime = new AgentRuntime(options, options.conversationService);
	return {
		async run(input: string): Promise<AgentRunResult> {
			const sessionServices = runtime.createSessionServices();
			const session = new AgentSession(runtime, createSessionId(), sessionServices, []);
			return session.run(input);
		},
		async createSession(sessionOptions?: string | CreateAgentSessionOptions): Promise<AgentSessionContract> {
			const normalized = typeof sessionOptions === "string" ? { sessionId: sessionOptions } : (sessionOptions ?? {});
			const sessionServices = runtime.createSessionServices(normalized.conversationId);
			return new AgentSession(
				runtime,
				normalized.sessionId ?? createSessionId(),
				sessionServices,
				normalized.messages ?? []
			);
		}
	};
}

function createSessionId(): string {
	return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
