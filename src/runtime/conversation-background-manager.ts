import { execaCommand } from "execa"
import type { ConversationService } from "../services/conversation-service.js"
import type {
  BackgroundManagerContract,
  BackgroundNotification,
  BackgroundTask,
  BackgroundTaskStatus,
} from "../types/index.js"

type BackgroundExecutionResult = {
  exitCode: number
  stdout: string
  stderr: string
}

export type BackgroundExecutor = (
  command: string,
  cwd: string,
) => Promise<BackgroundExecutionResult>

const defaultBackgroundExecutor: BackgroundExecutor = async (command, cwd) => {
  const result = await execaCommand(command, {
    cwd,
    shell: true,
    reject: false,
  })

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

export class ConversationBackgroundManager implements BackgroundManagerContract {
  private readonly tasks = new Map<string, BackgroundTask>()
  private notificationQueue: BackgroundNotification[] = []
  private nextId = 1

  constructor(
    private readonly conversationService: ConversationService,
    private readonly conversationId: string,
    private readonly executor: BackgroundExecutor = defaultBackgroundExecutor,
  ) {}

  async run(command: string, cwd: string): Promise<BackgroundTask> {
    const taskId = `bg_${this.nextId++}`
    const task: BackgroundTask = {
      id: taskId,
      command,
      cwd,
      status: "running",
      startedAt: Date.now(),
    }
    await this.conversationService.upsertBackgroundTask({
      conversationId: this.conversationId,
      taskId,
      command,
      status: "running",
    })
    await this.conversationService.recordBackgroundEvent({
      conversationId: this.conversationId,
      taskId,
      command,
      status: "running",
    })
    this.tasks.set(taskId, task)
    void this.execute(taskId, command, cwd)
    return { ...task }
  }

  check(taskId: string): BackgroundTask | null {
    const task = this.tasks.get(taskId)
    return task ? { ...task } : null
  }

  list(): BackgroundTask[] {
    return [...this.tasks.values()].map((task) => ({ ...task }))
  }

  drainNotifications(): BackgroundNotification[] {
    const notifications = [...this.notificationQueue]
    this.notificationQueue = []
    return notifications
  }

  private async execute(taskId: string, command: string, cwd: string): Promise<void> {
    try {
      const result = await this.executor(command, cwd)
      await this.finishTask(taskId, {
        status: result.exitCode === 0 ? "completed" : "failed",
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      })
    } catch (error: any) {
      await this.finishTask(taskId, {
        status: "failed",
        error: error?.message ?? String(error),
        stderr: error?.stderr ?? "",
      })
    }
  }

  private async finishTask(
    taskId: string,
    updates: {
      status: Exclude<BackgroundTaskStatus, "running">
      exitCode?: number
      stdout?: string
      stderr?: string
      error?: string
    },
  ): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    task.status = updates.status
    task.completedAt = Date.now()
    task.exitCode = updates.exitCode
    task.stdout = updates.stdout
    task.stderr = updates.stderr
    task.error = updates.error
    await this.conversationService.upsertBackgroundTask({
      conversationId: this.conversationId,
      taskId,
      status: updates.status,
      completedAt: new Date().toISOString(),
      exitCode: updates.exitCode ?? null,
    })
    await this.conversationService.recordBackgroundEvent({
      conversationId: this.conversationId,
      taskId,
      command: task.command,
      status: updates.status,
    })
    this.notificationQueue.push({
      taskId,
      status: updates.status,
      command: task.command,
      message: renderCompletionMessage(task),
    })
  }
}

function renderCompletionMessage(task: BackgroundTask): string {
  const stdoutPreview = task.stdout?.trim().slice(0, 300)
  const stderrPreview = task.stderr?.trim().slice(0, 300)
  const parts: string[] = [
    `Background task ${task.id} ${task.status}`,
    `Command: ${task.command}`,
  ]

  if (task.exitCode !== undefined) {
    parts.push(`Exit code: ${task.exitCode}`)
  }
  if (task.error) {
    parts.push(`Error: ${task.error}`)
  }
  if (stdoutPreview) {
    parts.push(`Stdout:\n${stdoutPreview}`)
  }
  if (stderrPreview) {
    parts.push(`Stderr:\n${stderrPreview}`)
  }

  return parts.join("\n")
}
