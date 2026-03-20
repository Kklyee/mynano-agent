import type {
  ConversationDetail,
  PersistedBackgroundStatus,
  PersistedConversation,
  PersistedConversationBackgroundTask,
  PersistedConversationMessage,
  PersistedConversationStatus,
  PersistedConversationTask,
  PersistedMessageStatus,
  PersistedTaskStatus,
  PreparedConversationRun,
} from "./conversation-types";
import type { ConversationStore } from "./conversation-store";

type CreateConversationInput = {
  userId: string;
  title?: string;
};

type GetConversationInput = {
  userId: string;
  conversationId: string;
};

type RecordMessageInput = {
  conversationId: string;
  content: string;
};

type RecordAssistantMessageInput = RecordMessageInput & {
  status: PersistedMessageStatus;
};

type RecordToolCallStartedInput = {
  conversationId: string;
  messageId: string;
  name: string;
  args: unknown;
};

type RecordToolCallCompletedInput = {
  conversationId: string;
  name: string;
  result: string;
};

type UpsertTaskInput = {
  conversationId: string;
  taskId: number;
  subject?: string;
  description?: string;
  status: PersistedTaskStatus;
  owner?: string;
  blockedBy?: number[];
};

type RecordTaskEventInput = {
  conversationId: string;
  taskId: number;
  subject?: string;
  status: string;
};

type UpsertBackgroundTaskInput = {
  conversationId: string;
  taskId: string;
  command?: string;
  summary?: string;
  status: PersistedBackgroundStatus;
  completedAt?: string | null;
  exitCode?: number | null;
};

type RecordBackgroundEventInput = {
  conversationId: string;
  taskId: string;
  command?: string;
  summary?: string;
  status: PersistedBackgroundStatus;
};

type PrepareRunInput = GetConversationInput & {
  prompt: string;
};

export class ConversationService {
  constructor(private readonly store: ConversationStore) {}

  close() {
    this.store.close();
  }

  updateConversationStatus(
    conversationId: string,
    status: PersistedConversationStatus,
  ) {
    this.store.updateConversationStatus(conversationId, status);
  }

  createConversation(input: CreateConversationInput): PersistedConversation {
    return this.store.createConversation({
      userId: input.userId,
      title: input.title?.trim() || "New Conversation",
    });
  }

  listConversations(userId: string): PersistedConversation[] {
    return this.store.listConversations(userId);
  }

  deleteConversation(input: GetConversationInput): void {
    this.requireOwnedConversation(input);
    this.store.deleteConversation(input.conversationId);
  }

  getConversationDetail(input: GetConversationInput): ConversationDetail {
    const conversation = this.requireOwnedConversation(input);

    return {
      conversation,
      messages: this.store.listMessages(conversation.id),
      tools: this.store.listToolCalls(conversation.id),
      tasks: this.store.listTasks(conversation.id),
      taskEvents: this.store.listTaskEvents(conversation.id),
      backgroundTasks: this.store.listBackgroundTasks(conversation.id),
      backgroundEvents: this.store.listBackgroundEvents(conversation.id),
    };
  }

  prepareRun(input: PrepareRunInput): PreparedConversationRun {
    const conversation = this.requireOwnedConversation(input);
    const messages = this.store.listMessages(conversation.id);

    return {
      conversation,
      history: messages
        .filter((message) => message.role !== "tool")
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      nextSequence: this.store.getNextSequence(conversation.id),
    };
  }

  getNextTaskId(conversationId: string): number {
    return this.store.getNextTaskId(conversationId);
  }

  getTask(conversationId: string, taskId: number): PersistedConversationTask | null {
    return this.store.getTask(conversationId, taskId);
  }

  listTasks(conversationId: string): PersistedConversationTask[] {
    return this.store.listTasks(conversationId);
  }

  getBackgroundTask(
    conversationId: string,
    taskId: string,
  ): PersistedConversationBackgroundTask | null {
    return this.store.getBackgroundTask(conversationId, taskId);
  }

  listBackgroundTasks(conversationId: string): PersistedConversationBackgroundTask[] {
    return this.store.listBackgroundTasks(conversationId);
  }

  recordUserMessage(input: RecordMessageInput): PersistedConversationMessage {
    return this.store.appendMessage({
      conversationId: input.conversationId,
      role: "user",
      content: input.content,
      sequence: this.store.getNextSequence(input.conversationId),
      status: "complete",
    });
  }

  recordAssistantMessage(
    input: RecordAssistantMessageInput,
  ): PersistedConversationMessage {
    return this.store.appendMessage({
      conversationId: input.conversationId,
      role: "assistant",
      content: input.content,
      sequence: this.store.getNextSequence(input.conversationId),
      status: input.status,
    });
  }

  recordToolCallStarted(input: RecordToolCallStartedInput) {
    const sequence = this.store.getNextSequence(input.conversationId);
    return this.store.appendToolCall({
      conversationId: input.conversationId,
      messageId: input.messageId,
      name: input.name,
      argsJson: JSON.stringify(input.args),
      resultText: null,
      status: "running",
      sequence,
      startedAt: new Date().toISOString(),
    });
  }

  recordToolCallCompleted(input: RecordToolCallCompletedInput) {
    return this.store.completeLatestToolCall(
      input.conversationId,
      input.name,
      input.result,
    );
  }

  upsertTask(input: UpsertTaskInput) {
    return this.store.upsertTask({
      conversationId: input.conversationId,
      taskId: input.taskId,
      subject: input.subject ?? null,
      description: input.description ?? null,
      status: input.status,
      owner: input.owner ?? null,
      blockedBy: input.blockedBy ?? [],
      updatedAt: new Date().toISOString(),
    });
  }

  recordTaskEvent(input: RecordTaskEventInput) {
    const updatedAt = new Date().toISOString();
    const sequence = this.store.getNextSequence(input.conversationId);
    const existing = this.store.getTask(input.conversationId, input.taskId);
    if (!existing) {
      this.store.upsertTask({
        conversationId: input.conversationId,
        taskId: input.taskId,
        subject: input.subject ?? null,
        description: null,
        status: normalizeTaskStatus(input.status),
        owner: null,
        blockedBy: [],
        updatedAt,
      });
    }

    return this.store.appendTaskEvent({
      conversationId: input.conversationId,
      taskId: input.taskId,
      subject: input.subject ?? null,
      status: input.status,
      sequence,
      updatedAt,
    });
  }

  upsertBackgroundTask(input: UpsertBackgroundTaskInput): PersistedConversationBackgroundTask {
    return this.store.upsertBackgroundTask({
      conversationId: input.conversationId,
      taskId: input.taskId,
      command: input.command ?? null,
      summary: input.summary ?? null,
      status: input.status,
      completedAt: input.completedAt ?? null,
      exitCode: input.exitCode ?? null,
    });
  }

  recordBackgroundEvent(input: RecordBackgroundEventInput) {
    const updatedAt = new Date().toISOString();
    const sequence = this.store.getNextSequence(input.conversationId);
    const existing = this.store.getBackgroundTask(input.conversationId, input.taskId);
    if (!existing) {
      this.store.upsertBackgroundTask({
        conversationId: input.conversationId,
        taskId: input.taskId,
        command: input.command ?? null,
        summary: input.summary ?? null,
        status: input.status,
      });
    }

    return this.store.appendBackgroundEvent({
      conversationId: input.conversationId,
      taskId: input.taskId,
      command: input.command ?? null,
      summary: input.summary ?? null,
      status: input.status,
      sequence,
      updatedAt,
    });
  }

  private requireOwnedConversation(input: GetConversationInput): PersistedConversation {
    const conversation = this.store.getConversation(input.conversationId);
    if (!conversation || conversation.userId !== input.userId) {
      throw new Error("Conversation not found");
    }

    return conversation;
  }
}

function normalizeTaskStatus(status: string): PersistedTaskStatus {
  switch (status) {
    case "in_progress":
    case "completed":
    case "blocked":
      return status;
    default:
      return "pending";
  }
}
