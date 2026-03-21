import { randomUUID } from "node:crypto"
import type { ConversationRepository } from "../repositories/conversation-repository.js"
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
} from "../types/conversation.js"

type CreateConversationInput = {
  userId: string
  title?: string
}

type GetConversationInput = {
  userId: string
  conversationId: string
}

type RecordMessageInput = {
  conversationId: string
  content: string
}

type RecordAssistantMessageInput = RecordMessageInput & {
  status: PersistedMessageStatus
}

type RecordToolCallStartedInput = {
  conversationId: string
  messageId: string
  name: string
  args: unknown
}

type RecordToolCallCompletedInput = {
  conversationId: string
  name: string
  result: string
}

type UpsertTaskInput = {
  conversationId: string
  taskId: number
  subject?: string
  description?: string
  status: PersistedTaskStatus
  owner?: string
  blockedBy?: number[]
}

type RecordTaskEventInput = {
  conversationId: string
  taskId: number
  subject?: string
  status: string
}

type UpsertBackgroundTaskInput = {
  conversationId: string
  taskId: string
  command?: string
  summary?: string
  status: PersistedBackgroundStatus
  completedAt?: string | null
  exitCode?: number | null
}

type RecordBackgroundEventInput = {
  conversationId: string
  taskId: string
  command?: string
  summary?: string
  status: PersistedBackgroundStatus
}

type PrepareRunInput = GetConversationInput & {
  prompt: string
}

export class ConversationService {
  constructor(private readonly repo: ConversationRepository) {}

  async updateConversationStatus(
    conversationId: string,
    status: PersistedConversationStatus,
  ): Promise<void> {
    await this.repo.updateConversationStatus(conversationId, status)
  }

  async createConversation(input: CreateConversationInput): Promise<PersistedConversation> {
    const now = new Date().toISOString()
    const id = randomUUID()
    await this.repo.createConversation({
      id,
      userId: input.userId,
      title: input.title?.trim() || "New Conversation",
      status: "idle",
      createdAt: now,
      updatedAt: now,
    })
    const created = await this.repo.getConversation(id)
    if (!created) throw new Error("Failed to create conversation")
    return created
  }

  async listConversations(userId: string): Promise<PersistedConversation[]> {
    return this.repo.listConversations(userId)
  }

  async deleteConversation(input: GetConversationInput): Promise<void> {
    await this.requireOwnedConversation(input)
    await this.repo.deleteConversation(input.conversationId)
  }

  async getConversationDetail(input: GetConversationInput): Promise<ConversationDetail> {
    const conversation = await this.requireOwnedConversation(input)
    const [messages, tools, tasks, taskEvents, backgroundTasks, backgroundEvents] =
      await Promise.all([
        this.repo.listMessages(conversation.id),
        this.repo.listToolCalls(conversation.id),
        this.repo.listTasks(conversation.id),
        this.repo.listTaskEvents(conversation.id),
        this.repo.listBackgroundTasks(conversation.id),
        this.repo.listBackgroundEvents(conversation.id),
      ])
    return { conversation, messages, tools, tasks, taskEvents, backgroundTasks, backgroundEvents }
  }

  async prepareRun(input: PrepareRunInput): Promise<PreparedConversationRun> {
    const conversation = await this.requireOwnedConversation(input)
    const messages = await this.repo.listMessages(conversation.id)
    const nextSequence = await this.repo.getNextSequence(conversation.id)
    return {
      conversation,
      history: messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({ role: m.role, content: m.content })),
      nextSequence,
    }
  }

  async getNextTaskId(conversationId: string): Promise<number> {
    return this.repo.getNextTaskId(conversationId)
  }

  async getTask(
    conversationId: string,
    taskId: number,
  ): Promise<PersistedConversationTask | null> {
    return this.repo.getTask(conversationId, taskId)
  }

  async listTasks(conversationId: string): Promise<PersistedConversationTask[]> {
    return this.repo.listTasks(conversationId)
  }

  async getBackgroundTask(
    conversationId: string,
    taskId: string,
  ): Promise<PersistedConversationBackgroundTask | null> {
    return this.repo.getBackgroundTask(conversationId, taskId)
  }

  async listBackgroundTasks(
    conversationId: string,
  ): Promise<PersistedConversationBackgroundTask[]> {
    return this.repo.listBackgroundTasks(conversationId)
  }

  async recordUserMessage(
    input: RecordMessageInput,
  ): Promise<PersistedConversationMessage> {
    const now = new Date().toISOString()
    const sequence = await this.repo.getNextSequence(input.conversationId)
    const id = randomUUID()
    await this.repo.appendMessage({
      id,
      conversationId: input.conversationId,
      role: "user",
      content: input.content,
      sequence,
      status: "complete",
      createdAt: now,
    })
    await this.repo.touchConversation(input.conversationId, {
      updatedAt: now,
      lastMessageAt: now,
      messageCountDelta: 1,
      newTitle: input.content.trim().slice(0, 60),
    })
    const msg: PersistedConversationMessage = {
      id,
      conversationId: input.conversationId,
      role: "user",
      content: input.content,
      sequence,
      status: "complete",
      createdAt: now,
    }
    return msg
  }

  async recordAssistantMessage(
    input: RecordAssistantMessageInput,
  ): Promise<PersistedConversationMessage> {
    const now = new Date().toISOString()
    const sequence = await this.repo.getNextSequence(input.conversationId)
    const id = randomUUID()
    await this.repo.appendMessage({
      id,
      conversationId: input.conversationId,
      role: "assistant",
      content: input.content,
      sequence,
      status: input.status,
      createdAt: now,
    })
    const msg: PersistedConversationMessage = {
      id,
      conversationId: input.conversationId,
      role: "assistant",
      content: input.content,
      sequence,
      status: input.status,
      createdAt: now,
    }
    return msg
  }

  async recordToolCallStarted(input: RecordToolCallStartedInput): Promise<{ id: string }> {
    const sequence = await this.repo.getNextSequence(input.conversationId)
    const id = randomUUID()
    await this.repo.appendToolCall({
      id,
      conversationId: input.conversationId,
      messageId: input.messageId,
      name: input.name,
      argsJson: JSON.stringify(input.args),
      status: "running",
      sequence,
      startedAt: new Date().toISOString(),
    })
    return { id }
  }

  async recordToolCallCompleted(input: RecordToolCallCompletedInput): Promise<void> {
    await this.repo.completeLatestToolCall(
      input.conversationId,
      input.name,
      input.result,
      new Date().toISOString(),
    )
  }

  async upsertTask(input: UpsertTaskInput): Promise<void> {
    const now = new Date().toISOString()
    await this.repo.upsertTask({
      conversationId: input.conversationId,
      taskId: input.taskId,
      subject: input.subject,
      description: input.description,
      status: input.status,
      owner: input.owner,
      blockedByJson: JSON.stringify(input.blockedBy ?? []),
      createdAt: now,
      updatedAt: now,
    })
  }

  async recordTaskEvent(input: RecordTaskEventInput): Promise<void> {
    const updatedAt = new Date().toISOString()
    const sequence = await this.repo.getNextSequence(input.conversationId)
    const existing = await this.repo.getTask(input.conversationId, input.taskId)
    if (!existing) {
      await this.repo.upsertTask({
        conversationId: input.conversationId,
        taskId: input.taskId,
        subject: input.subject,
        status: normalizeTaskStatus(input.status),
        blockedByJson: "[]",
        createdAt: updatedAt,
        updatedAt,
      })
    }
    await this.repo.appendTaskEvent({
      id: randomUUID(),
      conversationId: input.conversationId,
      taskId: input.taskId,
      subject: input.subject,
      status: input.status,
      sequence,
      updatedAt,
    })
  }

  async upsertBackgroundTask(
    input: UpsertBackgroundTaskInput,
  ): Promise<PersistedConversationBackgroundTask> {
    await this.repo.upsertBackgroundTask({
      conversationId: input.conversationId,
      taskId: input.taskId,
      command: input.command,
      summary: input.summary,
      status: input.status,
      startedAt: new Date().toISOString(),
      completedAt: input.completedAt ?? undefined,
      exitCode: input.exitCode ?? undefined,
    })
    const task = await this.repo.getBackgroundTask(input.conversationId, input.taskId)
    if (!task) throw new Error("Failed to upsert background task")
    return task
  }

  async recordBackgroundEvent(input: RecordBackgroundEventInput): Promise<void> {
    const updatedAt = new Date().toISOString()
    const sequence = await this.repo.getNextSequence(input.conversationId)
    const existing = await this.repo.getBackgroundTask(input.conversationId, input.taskId)
    if (!existing) {
      await this.repo.upsertBackgroundTask({
        conversationId: input.conversationId,
        taskId: input.taskId,
        command: input.command,
        summary: input.summary,
        status: input.status,
        startedAt: updatedAt,
      })
    }
    await this.repo.appendBackgroundEvent({
      id: randomUUID(),
      conversationId: input.conversationId,
      taskId: input.taskId,
      command: input.command,
      summary: input.summary,
      status: input.status,
      sequence,
      updatedAt,
    })
  }

  private async requireOwnedConversation(
    input: GetConversationInput,
  ): Promise<PersistedConversation> {
    const conversation = await this.repo.getConversation(input.conversationId)
    if (!conversation || conversation.userId !== input.userId) {
      throw new Error("Conversation not found")
    }
    return conversation
  }
}

function normalizeTaskStatus(status: string): PersistedTaskStatus {
  switch (status) {
    case "in_progress":
    case "completed":
    case "blocked":
      return status
    default:
      return "pending"
  }
}
