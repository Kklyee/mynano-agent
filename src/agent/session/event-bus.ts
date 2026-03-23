import type { AgentEvent } from "../core/events";

export class AgentEventBus {
	private readonly listeners = new Set<(event: AgentEvent) => void>();

	subscribe(listener: (event: AgentEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(event: AgentEvent): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}
}
