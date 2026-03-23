import type { SessionContext } from "../context/context-manager";
import { buildSystemPrompt } from "../context/prompt-builder";
import type { AgentEvent } from "../core/events";
import type { AgentRuntime } from "../core/runtime";
import type { AgentRunResult } from "../core/types";
import type { AgentModelClient } from "../model/model-client";
import type { MessageStore } from "../session/message-store";
import type { SessionRuntimeStateStore } from "../session/runtime-state";
import type { AgentToolExecutor } from "../tools/tool-executor";

export class AgentRunner {
	constructor(
		private readonly runtime: AgentRuntime,
		private readonly sessionId: string,
		private readonly messages: MessageStore,
		private readonly runtimeState: SessionRuntimeStateStore,
		private readonly contextManager: SessionContext,
		private readonly modelClient: AgentModelClient,
		private readonly toolExecutor: AgentToolExecutor,
		private readonly emit: (event: AgentEvent) => void
	) {}

	async run(input: string): Promise<AgentRunResult> {
		if (this.runtimeState.getStatus() === "running") {
			throw new Error("Session is already running");
		}

		if (!this.messages.hasSystemMessage()) {
			const systemPrompt = await buildSystemPrompt(
				this.runtime.skillLoader,
				this.runtime.options.behavior?.systemPrompt
			);
			this.messages.push({ role: "system", content: systemPrompt });
		}

		this.runtimeState.start();
		this.emit({ type: "session.started", sessionId: this.sessionId });
		this.appendUserMessage(input);

		try {
			while (this.runtimeState.canContinue(this.runtime.getMaxSteps())) {
				if (this.finishIfCancelled()) {
					return this.runtimeState.cancel();
				}

				this.runtimeState.advanceStep();
				await this.contextManager.prepare(this.messages.all());

				const assistantMessage = await this.modelClient.generate(this.messages.all());
				this.messages.push(assistantMessage);
				this.emitAssistantMessage(assistantMessage);

				if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
					return this.complete(assistantMessage.content ?? "");
				}

				await this.toolExecutor.executeToolCalls(assistantMessage.tool_calls, this.messages.all());
			}

			return this.complete("Reached max steps without final response.");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
			this.emit({
				type: "session.failed",
				sessionId: this.sessionId,
				error: message
			});
			this.runtimeState.fail(error);
		}
	}

	private appendUserMessage(input: string): void {
		this.messages.push({ role: "user", content: input });
		this.emit({
			type: "message.appended",
			sessionId: this.sessionId,
			role: "user",
			content: input
		});
	}

	private emitAssistantMessage(message: { role: string; content?: string | null }): void {
		this.emit({
			type: "message.appended",
			sessionId: this.sessionId,
			role: message.role,
			content: message.content ?? ""
		});
	}

	private finishIfCancelled(): boolean {
		if (!this.runtimeState.isCancellationRequested()) {
			return false;
		}

		this.emit({
			type: "session.cancelled",
			sessionId: this.sessionId,
			reason: this.runtimeState.getCancellationReason()
		});
		return true;
	}

	private complete(output: string): AgentRunResult {
		const result = this.runtimeState.complete(output);
		this.emit({ type: "session.completed", sessionId: this.sessionId, result: output });
		return result;
	}
}
