import type { AgentSession } from "../core/types";

export class ActiveSessionStore {
	private readonly sessions = new Map<string, AgentSession>();

	set(conversationId: string, session: AgentSession): void {
		this.sessions.set(conversationId, session);
	}

	get(conversationId: string): AgentSession | undefined {
		return this.sessions.get(conversationId);
	}

	delete(conversationId: string): void {
		this.sessions.delete(conversationId);
	}
}
