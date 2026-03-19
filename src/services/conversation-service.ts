import type {
  ConversationDetail,
  PreparedConversationRun,
  PersistedConversation,
  PersistedConversationMessage,
  PersistedConversationStatus,
  PersistedMessageStatus,
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

type RecordTaskEventInput = {
  conversationId: string;
  taskId: number;
  subject?: string;
  status: string;
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

  getConversationDetail(input: GetConversationInput): ConversationDetail {
    const conversation = this.requireOwnedConversation(input);

    return {
      conversation,
      messages: this.store.listMessages(conversation.id),
      tools: this.store.listToolCalls(conversation.id),
      tasks: this.store.listTaskEvents(conversation.id),
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

  recordTaskEvent(input: RecordTaskEventInput) {
    const sequence = this.store.getNextSequence(input.conversationId);
    return this.store.appendTaskEvent({
      conversationId: input.conversationId,
      taskId: input.taskId,
      subject: input.subject ?? null,
      status: input.status,
      sequence,
      updatedAt: new Date().toISOString(),
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
