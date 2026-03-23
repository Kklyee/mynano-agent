import type OpenAI from "openai";
import type { AgentEvent } from "../core/events";
import type { AgentRuntime } from "../core/runtime";
import type { AgentSessionServices } from "../core/types";
import { buildSystemPrompt } from "./prompt-builder";

export class SessionContext {
	constructor(
		private readonly runtime: AgentRuntime,
		private readonly sessionServices: AgentSessionServices,
		private readonly sessionId: string,
		private readonly emit: (event: AgentEvent) => void
	) {}

	async prepare(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<void> {
		await this.applyContextCompaction(messages);
		this.injectBackgroundNotifications(messages);
	}

	async compact(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<void> {
		const systemPrompt = await buildSystemPrompt(this.runtime.skillLoader, this.runtime.options.behavior?.systemPrompt);
		const compressed = await this.runtime.compactManager.compact(
			messages,
			this.runtime.openai.openaiClient,
			this.runtime.openai.model,
			systemPrompt
		);
		replaceMessages(messages, compressed);
	}

	private async applyContextCompaction(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<void> {
		if (!this.runtime.shouldUseCompact()) {
			return;
		}

		const microCompacted = this.runtime.compactManager.microCompact(messages);
		if (microCompacted !== messages) {
			replaceMessages(messages, microCompacted);
		}

		if (!this.runtime.compactManager.shouldAutoCompact(messages)) {
			return;
		}

		await this.compact(messages);
	}

	private injectBackgroundNotifications(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): void {
		if (!this.runtime.shouldUseBackground()) {
			return;
		}

		const notifications = this.sessionServices.backgroundManager.drainNotifications();
		if (notifications.length === 0) {
			return;
		}

		const content = ["Background task notifications:", ...notifications.map((item) => item.message)].join("\n\n");
		messages.push({ role: "system", content });

		for (const notification of notifications) {
			this.emit({
				type: "background.updated",
				sessionId: this.sessionId,
				taskId: notification.taskId,
				status: notification.status
			});
		}
	}
}

function replaceMessages(
	currentMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
	nextMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): void {
	currentMessages.length = 0;
	currentMessages.push(...nextMessages);
}
