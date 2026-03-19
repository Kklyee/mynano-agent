import type { ConversationService } from "./conversation-service";
import type { PersistedConversationTask } from "./conversation-types";
import type { Task, TaskManagerContract, TaskStatus } from "./types";

export class ConversationTaskManager implements TaskManagerContract {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly conversationId: string,
  ) {}

  async create(subject: string, description = "", blockedBy: number[] = []): Promise<Task> {
    for (const dependencyId of blockedBy) {
      const dependency = await this.get(dependencyId);
      if (!dependency) {
        throw new Error(`Dependency task ${dependencyId} not found`);
      }
    }

    const id = this.conversationService.getNextTaskId(this.conversationId);
    const persistedTask = this.conversationService.upsertTask({
      conversationId: this.conversationId,
      taskId: id,
      subject,
      description,
      status: blockedBy.length > 0 ? "blocked" : "pending",
      blockedBy,
    });

    return this.toTask(persistedTask, this.conversationService.listTasks(this.conversationId));
  }

  async update(
    taskId: number,
    updates: Partial<Pick<Task, "status" | "owner" | "blockedBy" | "description">>,
  ): Promise<Task> {
    const existing = this.conversationService.getTask(this.conversationId, taskId);
    if (!existing) {
      throw new Error(`Task ${taskId} not found`);
    }

    const blockedBy = updates.blockedBy ?? existing.blockedBy;
    const nextStatus = this.resolveNextStatus(existing.status, updates.status, blockedBy);
    const persistedTask = this.conversationService.upsertTask({
      conversationId: this.conversationId,
      taskId,
      subject: existing.subject ?? undefined,
      description: updates.description ?? existing.description ?? undefined,
      status: nextStatus,
      owner: updates.owner ?? existing.owner ?? undefined,
      blockedBy,
    });

    if (nextStatus === "completed") {
      await this.unblockDependents(taskId);
    }

    return this.toTask(persistedTask, this.conversationService.listTasks(this.conversationId));
  }

  async get(taskId: number): Promise<Task | null> {
    const persistedTask = this.conversationService.getTask(this.conversationId, taskId);
    if (!persistedTask) {
      return null;
    }

    return this.toTask(persistedTask, this.conversationService.listTasks(this.conversationId));
  }

  async listAll(): Promise<Task[]> {
    const persistedTasks = this.conversationService.listTasks(this.conversationId);
    return persistedTasks.map((task) => this.toTask(task, persistedTasks));
  }

  async getReadyTasks(): Promise<Task[]> {
    const tasks = await this.listAll();
    return tasks.filter((task) => task.status === "pending" && task.blockedBy.length === 0);
  }

  async getBlockedTasks(): Promise<Task[]> {
    const tasks = await this.listAll();
    return tasks.filter((task) => task.status === "blocked");
  }

  async getInProgressTasks(): Promise<Task[]> {
    const tasks = await this.listAll();
    return tasks.filter((task) => task.status === "in_progress");
  }

  renderTasks(tasks: Task[]): string {
    if (tasks.length === 0) {
      return "No tasks available.";
    }

    return tasks
      .map((task) => {
        const statusEmoji = {
          pending: "⏳",
          in_progress: "🔨",
          completed: "✅",
          blocked: "🚫",
        }[task.status];
        const deps = task.blockedBy.length > 0 ? ` (blocked by ${task.blockedBy.join(", ")})` : "";
        const owner = task.owner ? ` (@${task.owner})` : "";
        return `[${statusEmoji}] #${task.id}: ${task.subject}${deps}${owner}`;
      })
      .join("\n");
  }

  private async unblockDependents(completedTaskId: number): Promise<void> {
    const persistedTasks = this.conversationService.listTasks(this.conversationId);

    for (const dependent of persistedTasks.filter((task) => task.blockedBy.includes(completedTaskId))) {
      const nextBlockedBy = dependent.blockedBy.filter((taskId) => taskId !== completedTaskId);
      this.conversationService.upsertTask({
        conversationId: this.conversationId,
        taskId: dependent.taskId,
        subject: dependent.subject ?? undefined,
        description: dependent.description ?? undefined,
        status: nextBlockedBy.length === 0 && dependent.status === "blocked" ? "pending" : dependent.status,
        owner: dependent.owner ?? undefined,
        blockedBy: nextBlockedBy,
      });
    }
  }

  private resolveNextStatus(
    currentStatus: TaskStatus,
    explicitStatus: TaskStatus | undefined,
    blockedBy: number[],
  ): TaskStatus {
    if (blockedBy.length > 0) {
      return "blocked";
    }

    if (explicitStatus && explicitStatus !== "blocked") {
      return explicitStatus;
    }

    return currentStatus === "blocked" ? "pending" : currentStatus;
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
    };
  }
}
