import type { ConversationService } from "../../services/conversation-service";
import type { ToolRegistry } from "../../tools/tool-registry";
import type { ToolsType } from "../../tools/types";
import type { BackgroundManagerContract, BackgroundTask, Task, TaskManagerContract } from "../../types";
import type { AgentEvent } from "./events";

export type AgentStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export interface LlmConfig {
	provider: "openai-compatible";
	model: string;
	apiKey?: string;
	baseURL?: string;
	temperature?: number;
	maxTokens?: number;
	timeoutMs?: number;
}

export interface RuntimeConfig {
	workDir: string;
	skillsDir?: string;
	tasksDir?: string;
	transcriptDir?: string;
	maxSteps?: number;
	enableCompact?: boolean;
	enableBackground?: boolean;
	enableSubagent?: boolean;
	enabledSkills?: string[];
}

export interface BehaviorConfig {
	systemPrompt?: string;
	enabledTools?: ToolsType[];
	reportFormat?: string;
}

export interface CreateAgentOptions {
	llmConfig: LlmConfig;
	runtime: RuntimeConfig;
	behavior?: BehaviorConfig;
	conversationService?: ConversationService;
}

export interface AgentRunResult {
	sessionId: string;
	output: string;
	steps: number;
	status: AgentStatus;
}

export interface ToolLog {
	name: ToolsType;
	args: unknown;
	result?: string;
	startedAt: number;
	completedAt?: number;
}

export interface SessionRuntimeState {
	sessionId: string;
	status: AgentStatus;
	step: number;
	model: string;
	currentTool?: ToolsType;
	tasks: Task[];
	toolLogs: ToolLog[];
	backgroundTasks: BackgroundTask[];
	startedAt?: number;
	completedAt?: number;
}

export interface AgentState extends SessionRuntimeState {
	messages: Array<{ role: string; content: string }>;
}

export interface AgentSeedMessage {
	role: string;
	content: string;
}

export interface CreateAgentSessionOptions {
	sessionId?: string;
	messages?: AgentSeedMessage[];
	conversationId?: string;
}

export interface AgentSessionServices {
	taskManager: TaskManagerContract;
	backgroundManager: BackgroundManagerContract;
	toolRegistry: ToolRegistry;
}

export interface AgentSession {
	id: string;
	run(input: string): Promise<AgentRunResult>;
	runStream(input: string): AsyncIterable<AgentEvent>;
	getState(): AgentState;
	onEvent(listener: (event: AgentEvent) => void): () => void;
	cancel(reason?: string): Promise<boolean>;
}

export interface Agent {
	run(input: string): Promise<AgentRunResult>;
	createSession(options?: string | CreateAgentSessionOptions): Promise<AgentSession>;
}
