import type { ToolsType } from "../../tools/types";
import type { BackgroundTask, Task } from "../../types";
import type { AgentRunResult, AgentState, AgentStatus, SessionRuntimeState, ToolLog } from "../core/types";

export class SessionRuntimeStateStore {
	private readonly state: SessionRuntimeState;
	private cancellationReason?: string;

	constructor(sessionId: string, model: string) {
		this.state = {
			sessionId,
			status: "idle",
			step: 0,
			model,
			tasks: [],
			toolLogs: [],
			backgroundTasks: []
		};
	}

	getStatus(): AgentStatus {
		return this.state.status;
	}

	getStep(): number {
		return this.state.step;
	}

	getTasks(): Task[] {
		return [...this.state.tasks];
	}

	getBackgroundTasks(): BackgroundTask[] {
		return [...this.state.backgroundTasks];
	}

	getSnapshot(messages: Array<{ role: string; content: string }>): AgentState {
		return {
			...this.state,
			messages,
			tasks: [...this.state.tasks],
			toolLogs: [...this.state.toolLogs],
			backgroundTasks: [...this.state.backgroundTasks]
		};
	}

	start(): void {
		this.state.status = "running";
		this.state.startedAt = Date.now();
		this.state.completedAt = undefined;
	}

	advanceStep(): void {
		this.state.step += 1;
	}

	canContinue(maxSteps: number): boolean {
		return this.state.step < maxSteps;
	}

	beginTool(name: ToolsType, args: unknown): ToolLog {
		const log: ToolLog = { name, args, startedAt: Date.now() };
		this.state.currentTool = name;
		this.state.toolLogs.push(log);
		return log;
	}

	finishTool(log: ToolLog, result: string): void {
		log.result = result;
		log.completedAt = Date.now();
		this.state.currentTool = undefined;
	}

	replaceTasks(tasks: Task[]): void {
		this.state.tasks = tasks;
	}

	replaceBackgroundTasks(tasks: BackgroundTask[]): void {
		this.state.backgroundTasks = tasks;
	}

	requestCancellation(reason = "Cancelled by user"): boolean {
		if (this.state.status !== "running" && this.state.status !== "idle") {
			return false;
		}

		this.cancellationReason = reason;
		return true;
	}

	isCancellationRequested(): boolean {
		return Boolean(this.cancellationReason);
	}

	getCancellationReason(): string {
		return this.cancellationReason ?? "Cancelled by user";
	}

	complete(output: string): AgentRunResult {
		this.state.status = "completed";
		this.state.completedAt = Date.now();
		return {
			sessionId: this.state.sessionId,
			output,
			steps: this.state.step,
			status: this.state.status
		};
	}

	cancel(): AgentRunResult {
		this.state.status = "cancelled";
		this.state.completedAt = Date.now();
		return {
			sessionId: this.state.sessionId,
			output: "",
			steps: this.state.step,
			status: this.state.status
		};
	}

	fail(error: unknown): never {
		const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
		this.state.status = "failed";
		this.state.completedAt = Date.now();
		throw new Error(message);
	}
}
