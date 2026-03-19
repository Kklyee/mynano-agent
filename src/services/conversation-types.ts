export type PersistedConversationStatus = "idle" | "running" | "completed" | "failed";

export type PersistedMessageRole = "system" | "user" | "assistant" | "tool";
export type PersistedMessageStatus = "streaming" | "complete" | "failed" | "partial";
export type PersistedToolStatus = "running" | "completed";

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

export type PersistedConversationTaskEvent = {
  id: string;
  conversationId: string;
  taskId: number;
  subject: string | null;
  status: string;
  sequence: number;
  updatedAt: string;
};

export type ConversationDetail = {
  conversation: PersistedConversation;
  messages: PersistedConversationMessage[];
  tools: PersistedConversationToolCall[];
  tasks: PersistedConversationTaskEvent[];
};

export type ConversationListItem = PersistedConversation;

export type RuntimeConversationHistoryMessage = Pick<
  PersistedConversationMessage,
  "role" | "content"
>;

export type PreparedConversationRun = {
  conversation: PersistedConversation;
  history: RuntimeConversationHistoryMessage[];
  nextSequence: number;
};
