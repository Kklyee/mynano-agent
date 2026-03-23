import type OpenAI from "openai";
import type { ToolsType } from "../../tools/types";
import type { SessionContext } from "../context/context-manager";
import type { AgentEvent } from "../core/events";
import type { AgentSessionServices } from "../core/types";
import { buildBackgroundEvents, buildTaskEvents } from "../session/session-sync";
import type { SessionRuntimeStateStore } from "../session/runtime-state";

type FunctionToolCall = Extract<OpenAI.Chat.Completions.ChatCompletionMessageToolCall, { type: "function" }>;

export class AgentToolExecutor {
	constructor(
		private readonly sessionServices: AgentSessionServices,
		private readonly sessionId: string,
		private readonly runtimeState: SessionRuntimeStateStore,
		private readonly emit: (event: AgentEvent) => void,
		private readonly contextManager: SessionContext
	) {}

	async executeToolCalls(
		toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
		messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
	): Promise<void> {
		for (const call of toolCalls) {
			if (call.type !== "function") {
				continue;
			}

			if (this.runtimeState.isCancellationRequested()) {
				return;
			}

			await this.executeSingleToolCall(call, messages);
		}
	}

	private async executeSingleToolCall(
		call: FunctionToolCall,
		messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
	): Promise<void> {
		const toolName = call.function.name || "unknown";
		const args = parseArguments(call.function.arguments);

		this.emit({ type: "tool.called", sessionId: this.sessionId, name: toolName as ToolsType, args });

		const log = this.runtimeState.beginTool(toolName as ToolsType, args);
		const result = await this.dispatchToolExecution(toolName, args, messages);
		this.runtimeState.finishTool(log, result);

		messages.push({
			role: "tool",
			tool_call_id: call.id,
			content: result
		});

		this.emit({ type: "tool.completed", sessionId: this.sessionId, name: toolName as ToolsType, result });
		await this.refreshTaskState();
		this.refreshBackgroundState();
	}

	private async dispatchToolExecution(
		toolName: string,
		args: unknown,
		messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
	): Promise<string> {
		if (!toolName || toolName === "unknown") {
			return "Error: Unknown tool";
		}

		if (toolName === "compact") {
			await this.contextManager.compact(messages);
			return "Context has been compacted successfully";
		}

		try {
			return await this.sessionServices.toolRegistry.execute(toolName as ToolsType, args);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[${this.sessionId}] Tool execution failed: ${toolName}`, message);
			return `Error: ${message}`;
		}
	}

	private async refreshTaskState(): Promise<void> {
		const previousTasks = this.runtimeState.getTasks();
		const nextTasks = await this.sessionServices.taskManager.listAll();
		const events = buildTaskEvents(this.sessionId, previousTasks, nextTasks);
		for (const event of events) {
			this.emit(event);
		}

		this.runtimeState.replaceTasks(nextTasks);
	}

	private refreshBackgroundState(): void {
		const previousTasks = this.runtimeState.getBackgroundTasks();
		const nextTasks = this.sessionServices.backgroundManager.list();
		const events = buildBackgroundEvents(this.sessionId, previousTasks, nextTasks);
		for (const event of events) {
			this.emit(event);
		}

		this.runtimeState.replaceBackgroundTasks(nextTasks);
	}
}

function parseArguments(rawArguments: string): unknown {
	try {
		return JSON.parse(rawArguments || "{}");
	} catch {
		return { _raw: rawArguments };
	}
}
