import type { Subprocess } from "execa";
import { execa } from "execa";
import type { BackgroundNotification, BackgroundTask, FinishTaskUpdates } from "../types";

type BackgroundExecutionResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type BackgroundExecutor = (
	command: string,
	cwd: string
) => {
	process: Subprocess;
	result: Promise<BackgroundExecutionResult>;
};

const defaultBackgroundExecutor: BackgroundExecutor = (command, cwd) => {
	const childProcess = execa(command, {
		cwd,
		shell: true,
		reject: false
	});

	const result = childProcess.then((r) => ({
		exitCode: r.exitCode ?? 0,
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? ""
	}));
	return {
		process: childProcess,
		result
	};
};

export class BackgroundManager {
	private readonly tasks = new Map<string, BackgroundTask>();
	private readonly processes = new Map<string, Subprocess>();
	private notificationQueue: BackgroundNotification[] = [];
	private nextId = 1;

	constructor(private readonly executor: BackgroundExecutor = defaultBackgroundExecutor) {}

	async run(command: string, cwd: string): Promise<BackgroundTask> {
		const taskId = `bg_${this.nextId++}`;
		const { process: ChildProcess, result } = this.executor(command, cwd);
		const task: BackgroundTask = {
			id: taskId,
			command,
			cwd,
			status: "running",
			startedAt: Date.now(),
			pid: ChildProcess.pid
		};
		this.tasks.set(taskId, task);
		this.processes.set(taskId, ChildProcess);
		void result
			.then((r) =>
				this.finishTask(taskId, {
					status: r.exitCode === 0 ? "completed" : "failed",
					exitCode: r.exitCode,
					stdout: r.stdout,
					stderr: r.stderr
				})
			)
			.catch((error: any) =>
				this.finishTask(taskId, {
					status: "failed",
					error: error?.message ?? String(error),
					stderr: error?.stderr ?? ""
				})
			)
			.finally(() => {
				this.processes.delete(taskId);
			});
		return { ...task };
	}

	async cancel(taskId: string): Promise<boolean> {
		const task = this.tasks.get(taskId);
		const childProcess = this.processes.get(taskId);
		if (!task || task.status !== "running") return false;
		childProcess?.kill("SIGTERM");
		this.processes.delete(taskId);

		task.status = "failed";
		task.completedAt = Date.now();
		task.error = "Cancelled by user";

		this.notificationQueue.push({
			taskId,
			status: "failed",
			command: task.command,
			message: `Background task ${taskId} cancelled`
		});
		return true;
	}
	check(taskId: string): BackgroundTask | null {
		const task = this.tasks.get(taskId);
		return task ? { ...task } : null;
	}

	list(): BackgroundTask[] {
		return [...this.tasks.values()].map((t) => ({ ...t }));
	}
	private finishTask(taskId: string, updates: FinishTaskUpdates): void {
		const task = this.tasks.get(taskId);
		if (!task || task.status !== "running") return;

		task.status = updates.status;
		task.completedAt = Date.now();
		task.exitCode = updates.exitCode;
		task.stdout = updates.stdout;
		task.stderr = updates.stderr;
		task.error = updates.error;

		this.notificationQueue.push({
			taskId,
			status: updates.status,
			command: task.command,
			message: this.renderCompletionMessage(task)
		});
	}
	drainNotifications(): BackgroundNotification[] {
		const notifications = [...this.notificationQueue];
		this.notificationQueue = [];
		return notifications;
	}

	private renderCompletionMessage(task: BackgroundTask): string {
		const stdoutPreview = task.stdout?.trim().slice(0, 300);
		const stderrPreview = task.stderr?.trim().slice(0, 300);
		const parts: string[] = [`Background task ${task.id} ${task.status}`, `Command: ${task.command}`];

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
