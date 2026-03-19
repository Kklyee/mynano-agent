import { execaCommand } from "execa";
import type {
  BackgroundNotification,
  BackgroundTask,
} from "./types";

function cloneTask(task: BackgroundTask): BackgroundTask {
  return { ...task };
}

type BackgroundExecutionResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type BackgroundExecutor = (
  command: string,
  cwd: string,
) => Promise<BackgroundExecutionResult>;

const defaultBackgroundExecutor: BackgroundExecutor = async (command, cwd) => {
  const result = await execaCommand(command, {
    cwd,
    shell: true,
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

export class BackgroundManager {
  private readonly tasks = new Map<string, BackgroundTask>();
  private notificationQueue: BackgroundNotification[] = [];
  private nextId = 1;

  constructor(private readonly executor: BackgroundExecutor = defaultBackgroundExecutor) {}

  async run(command: string, cwd: string): Promise<BackgroundTask> {
    const taskId = `bg_${this.nextId++}`;
    const task: BackgroundTask = {
      id: taskId,
      command,
      cwd,
      status: "running",
      startedAt: Date.now(),
    };
    this.tasks.set(taskId, task);
    void this.execute(taskId, command, cwd);
    return cloneTask(task);
  }

  check(taskId: string): BackgroundTask | null {
    const task = this.tasks.get(taskId);
    return task ? cloneTask(task) : null;
  }

  list(): BackgroundTask[] {
    return [...this.tasks.values()].map(cloneTask);
  }

  drainNotifications(): BackgroundNotification[] {
    const notifications = [...this.notificationQueue];
    this.notificationQueue = [];
    return notifications;
  }

  private async execute(
    taskId: string,
    command: string,
    cwd: string,
  ): Promise<void> {
    try {
      const result = await this.executor(command, cwd);
      const task = this.tasks.get(taskId);
      if (!task) {
        return;
      }
      task.completedAt = Date.now();
      task.exitCode = result.exitCode;
      task.stdout = result.stdout;
      task.stderr = result.stderr;
      task.status = result.exitCode === 0 ? "completed" : "failed";
      this.notificationQueue.push({
        taskId,
        status: task.status,
        command,
        message: this.renderCompletionMessage(task),
      });
    } catch (error: any) {
      const task = this.tasks.get(taskId);
      if (!task) {
        return;
      }
      task.completedAt = Date.now();
      task.status = "failed";
      task.error = error?.message ?? String(error);
      task.stderr = error?.stderr ?? task.stderr;
      this.notificationQueue.push({
        taskId,
        status: "failed",
        command,
        message: this.renderCompletionMessage(task),
      });
    }
  }

  private renderCompletionMessage(task: BackgroundTask): string {
    const stdoutPreview = task.stdout?.trim().slice(0, 300);
    const stderrPreview = task.stderr?.trim().slice(0, 300);
    const parts: string[] = [
      `Background task ${task.id} ${task.status}`,
      `Command: ${task.command}`,
    ];

    if (task.exitCode !== undefined) {
      parts.push(`Exit code: ${task.exitCode}`);
    }
    if (task.error) {
      parts.push(`Error: ${task.error}`);
    }
    if (stdoutPreview) {
      parts.push(`Stdout:\n${stdoutPreview}`);
    }
    if (stderrPreview) {
      parts.push(`Stderr:\n${stderrPreview}`);
    }

    return parts.join("\n");
  }
}
