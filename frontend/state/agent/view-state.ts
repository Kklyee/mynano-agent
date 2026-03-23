import type { AgentState } from "@/types/agent-state";
import { createEmptyAgentTransportState } from "@/types/agent-state";

export type AgentEventLog = {
	id: string;
	type: string;
	summary: string;
	createdAt: string;
};

export type AgentViewState = AgentState & {
	eventLog: AgentEventLog[];
	nextSequence: number;
};

export const createEmptyAgentViewState = (): AgentViewState => ({
	...createEmptyAgentTransportState(),
	eventLog: [],
	nextSequence: 0
});
