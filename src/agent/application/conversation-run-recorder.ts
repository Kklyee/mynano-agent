import type { ConversationService } from "../../services/conversation-service";
import type { PersistedConversationStatus } from "../../types/conversation";
import type { AgentEvent } from "../core/events";
import type { AgentState } from "../core/types";

export class ConversationRunRecorder {
	private latestAssistantMessageId: string | null = null;
	private terminalStatus: PersistedConversationStatus | null = null;
	private terminalError?: string;

	constructor(
		private readonly conversationService: ConversationService,
		private readonly conversationId: string,
		private readonly getSessionState: () => AgentState
	) {}

	async apply(event: AgentEvent): Promise<void> {
		const state = this.getSessionState();
		if (state.status === "cancelled") {
			console.log(`[${this.conversationId}] Skipping recording assistant message for cancelled conversation`);
			return;
		}
		if (event.type === "message.appended" && event.role === "assistant") {
			const msg = await this.conversationService.recordAssistantMessage({
				conversationId: this.conversationId,
				content: event.content,
				status: "complete"
			});
			this.latestAssistantMessageId = msg.id;
			return;
		}

		if (event.type === "tool.called" && this.latestAssistantMessageId) {
			await this.conversationService.recordToolCallStarted({
				conversationId: this.conversationId,
				messageId: this.latestAssistantMessageId,
				name: event.name,
				args: event.args
			});
			return;
		}

		if (event.type === "tool.completed") {
			await this.conversationService.recordToolCallCompleted({
				conversationId: this.conversationId,
				name: event.name,
				result: event.result
			});
			return;
		}

		if (event.type === "task.created") {
			await this.conversationService.upsertTask({
				conversationId: this.conversationId,
				taskId: event.taskId,
				subject: event.subject,
				status: "pending",
				blockedBy: []
			});
			await this.conversationService.recordTaskEvent({
				conversationId: this.conversationId,
				taskId: event.taskId,
				subject: event.subject,
				status: "pending"
			});
			return;
		}

		if (event.type === "task.updated") {
			await this.conversationService.upsertTask({
				conversationId: this.conversationId,
				taskId: event.taskId,
				status: event.status as "pending" | "in_progress" | "completed" | "blocked"
			});
			await this.conversationService.recordTaskEvent({
				conversationId: this.conversationId,
				taskId: event.taskId,
				status: event.status
			});
			return;
		}

		if (event.type === "background.started" || event.type === "background.updated") {
			const backgroundTask = this.getSessionState().backgroundTasks.find((task) => task.id === event.taskId);
			const summary = summarizeCommand(backgroundTask?.command);

			await this.conversationService.upsertBackgroundTask({
				conversationId: this.conversationId,
				taskId: event.taskId,
				command: backgroundTask?.command,
				summary,
				status: event.status as "running" | "completed" | "failed",
				completedAt: backgroundTask?.completedAt ? new Date(backgroundTask.completedAt).toISOString() : null,
				exitCode: backgroundTask?.exitCode ?? null
			});
			await this.conversationService.recordBackgroundEvent({
				conversationId: this.conversationId,
				taskId: event.taskId,
				command: backgroundTask?.command,
				summary,
				status: event.status as "running" | "completed" | "failed"
			});
			return;
		}

		if (event.type === "session.completed") {
			this.terminalStatus = "completed";
			return;
		}

		if (event.type === "session.cancelled") {
			this.terminalStatus = "cancelled";
			return;
		}

		if (event.type === "session.failed") {
			this.terminalStatus = "failed";
			this.terminalError = event.error;
		}
	}

	getTerminalStatus(): PersistedConversationStatus | null {
		return this.terminalStatus;
	}

	getTerminalError(): string | undefined {
		return this.terminalError;
	}
}

function summarizeCommand(command?: string): string | undefined {
	return command?.trim().split(/\s+/).slice(0, 4).join(" ");
}
