import type { ConversationService } from "../services/conversation-service.js"
import type { PersistedConversationTask } from "../types/conversation.js"
import type { Task, TaskManagerContract, TaskStatus } from "../types/index.js"

export class ConversationTaskManager implements TaskManagerContract {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly conversationId: string,
  ) {}

  async create(subject: string, description = "", blockedBy: number[] = []): Promise<Task> {
    for (const dependencyId of blockedBy) {
      const dependency = await this.get(dependencyId)
      if (!dependency) {
        throw new Error(`Dependency task ${dependencyId} not found`)
      }
    }

    const id = await this.conversationService.getNextTaskId(this.conversationId)
    await this.conversationService.upsertTask({
      conversationId: this.conversationId,
      taskId: id,
      subject,
      description,
      status: blockedBy.length > 0 ? "blocked" : "pending",
      blockedBy,
    })

    const persistedTask = await this.conversationService.getTask(this.conversationId, id)
    const allTasks = await this.conversationService.listTasks(this.conversationId)
    return this.toTask(persistedTask!, allTasks)
  }

  async update(
    taskId: number,
    updates: Partial<Pick<Task, "status" | "owner" | "blockedBy" | "description">>,
  ): Promise<Task> {
    const existing = await this.conversationService.getTask(this.conversationId, taskId)
    if (!existing) {
      throw new Error(`Task ${taskId} not found`)
    }

    const blockedBy = updates.blockedBy ?? existing.blockedBy
    const nextStatus = this.resolveNextStatus(existing.status, updates.status, blockedBy)
    await this.conversationService.upsertTask({
      conversationId: this.conversationId,
      taskId,
      subject: existing.subject ?? undefined,
      description: updates.description ?? existing.description ?? undefined,
      status: nextStatus,
      owner: updates.owner ?? existing.owner ?? undefined,
      blockedBy,
    })

    if (nextStatus === "completed") {
      await this.unblockDependents(taskId)
    }

    const persistedTask = await this.conversationService.getTask(this.conversationId, taskId)
    const allTasks = await this.conversationService.listTasks(this.conversationId)
    return this.toTask(persistedTask!, allTasks)
  }

  async get(taskId: number): Promise<Task | null> {
    const persistedTask = await this.conversationService.getTask(this.conversationId, taskId)
    if (!persistedTask) {
      return null
    }

    const allTasks = await this.conversationService.listTasks(this.conversationId)
    return this.toTask(persistedTask, allTasks)
  }

  async listAll(): Promise<Task[]> {
    const persistedTasks = await this.conversationService.listTasks(this.conversationId)
    return persistedTasks.map((task) => this.toTask(task, persistedTasks))
  }

  async getReadyTasks(): Promise<Task[]> {
    const tasks = await this.listAll()
    return tasks.filter((task) => task.status === "pending" && task.blockedBy.length === 0)
  }

  async getBlockedTasks(): Promise<Task[]> {
    const tasks = await this.listAll()
    return tasks.filter((task) => task.status === "blocked")
  }

  async getInProgressTasks(): Promise<Task[]> {
    const tasks = await this.listAll()
    return tasks.filter((task) => task.status === "in_progress")
  }

  renderTasks(tasks: Task[]): string {
    if (tasks.length === 0) {
      return "No tasks available."
    }

    return tasks
      .map((task) => {
        const statusEmoji = {
          pending: "⏳",
          in_progress: "🔨",
          completed: "✅",
          blocked: "🚫",
        }[task.status]
        const deps =
          task.blockedBy.length > 0 ? ` (blocked by ${task.blockedBy.join(", ")})` : ""
        const owner = task.owner ? ` (@${task.owner})` : ""
        return `[${statusEmoji}] #${task.id}: ${task.subject}${deps}${owner}`
      })
      .join("\n")
  }

  private async unblockDependents(completedTaskId: number): Promise<void> {
    const persistedTasks = await this.conversationService.listTasks(this.conversationId)

    for (const dependent of persistedTasks.filter((task) =>
      task.blockedBy.includes(completedTaskId),
    )) {
      const nextBlockedBy = dependent.blockedBy.filter((id) => id !== completedTaskId)
      await this.conversationService.upsertTask({
        conversationId: this.conversationId,
        taskId: dependent.taskId,
        subject: dependent.subject ?? undefined,
        description: dependent.description ?? undefined,
        status:
          nextBlockedBy.length === 0 && dependent.status === "blocked"
            ? "pending"
            : dependent.status,
        owner: dependent.owner ?? undefined,
        blockedBy: nextBlockedBy,
      })
    }
  }

  private resolveNextStatus(
    currentStatus: TaskStatus,
    explicitStatus: TaskStatus | undefined,
    blockedBy: number[],
  ): TaskStatus {
    if (blockedBy.length > 0) {
      return "blocked"
    }

    if (explicitStatus && explicitStatus !== "blocked") {
      return explicitStatus
    }

    return currentStatus === "blocked" ? "pending" : currentStatus
  }

  private toTask(task: PersistedConversationTask, allTasks: PersistedConversationTask[]): Task {
    return {
      id: task.taskId,
      subject: task.subject ?? `Task #${task.taskId}`,
      description: task.description ?? "",
      status: task.status,
      owner: task.owner ?? undefined,
      blockedBy: [...task.blockedBy],
      blocks: allTasks
        .filter((candidate) => candidate.blockedBy.includes(task.taskId))
        .map((candidate) => candidate.taskId),
      createdAt: new Date(task.createdAt).getTime(),
      updatedAt: new Date(task.updatedAt).getTime(),
    }
  }
}
