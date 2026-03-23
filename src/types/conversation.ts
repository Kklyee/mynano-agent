export type PersistedConversationStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export type PersistedMessageRole = "system" | "user" | "assistant" | "tool";
export type PersistedMessageStatus = "streaming" | "complete" | "failed" | "partial";
export type PersistedToolStatus = "running" | "completed";
export type PersistedTaskStatus = "pending" | "in_progress" | "completed" | "blocked";
export type PersistedBackgroundStatus = "running" | "completed" | "failed";

export type PersistedConversation = {
	id: string;
	userId: string;
	title: string;
	status: PersistedConversationStatus;
	summary: string | null;
	messageCount: number;
	createdAt: string;
	updatedAt: string;
	lastMessageAt: string | null;
};

export type PersistedConversationMessage = {
	id: string;
	conversationId: string;
	role: PersistedMessageRole;
	content: string;
	sequence: number;
	status: PersistedMessageStatus;
	createdAt: string;
};

export type PersistedConversationToolCall = {
	id: string;
	conversationId: string;
	messageId: string;
	name: string;
	argsJson: string | null;
	resultText: string | null;
	status: PersistedToolStatus;
	sequence: number;
	startedAt: string;
	completedAt: string | null;
};

export type PersistedConversationTask = {
	conversationId: string;
	taskId: number;
	subject: string | null;
	description: string | null;
	status: PersistedTaskStatus;
	owner: string | null;
	blockedBy: number[];
	createdAt: string;
	updatedAt: string;
};

export type PersistedConversationTaskEvent = {
	id: string;
	conversationId: string;
	taskId: number;
	subject: string | null;
	status: string;
	sequence: number;
	updatedAt: string;
};

export type PersistedConversationBackgroundTask = {
	conversationId: string;
	taskId: string;
	command: string | null;
	summary: string | null;
	status: PersistedBackgroundStatus;
	startedAt: string;
	completedAt: string | null;
	exitCode: number | null;
};

export type PersistedConversationBackgroundEvent = {
	id: string;
	conversationId: string;
	taskId: string;
	command: string | null;
	summary: string | null;
	status: PersistedBackgroundStatus;
	sequence: number;
	updatedAt: string;
};

export type ConversationDetail = {
	conversation: PersistedConversation;
	messages: PersistedConversationMessage[];
	tools: PersistedConversationToolCall[];
	tasks: PersistedConversationTask[];
	taskEvents: PersistedConversationTaskEvent[];
	backgroundTasks: PersistedConversationBackgroundTask[];
	backgroundEvents: PersistedConversationBackgroundEvent[];
};

export type ConversationListItem = PersistedConversation;

export type RuntimeConversationHistoryMessage = Pick<PersistedConversationMessage, "role" | "content">;

export type PreparedConversationRun = {
	conversation: PersistedConversation;
	history: RuntimeConversationHistoryMessage[];
	nextSequence: number;
};
