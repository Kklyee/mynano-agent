import type OpenAI from "openai";
import type { AgentEvent } from "../core/events";
import type { AgentRuntime } from "../core/runtime";
import type { AgentSessionServices } from "../core/types";

export class AgentModelClient {
	constructor(
		private readonly runtime: AgentRuntime,
		private readonly sessionServices: AgentSessionServices,
		private readonly sessionId: string,
		private readonly emit: (event: AgentEvent) => void
	) {}

	async generate(
		messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
	): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
		const stream = this.runtime.openai.createChatCompletionStream({
			messages,
			tools: this.sessionServices.toolRegistry.getDefinitions(),
			temperature: this.runtime.openai.temperature,
			tool_choice: "auto"
		});

		this.emit({ type: "assistant.stream.started", sessionId: this.sessionId });

		let content = "";
		const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta;
			if (!delta) {
				continue;
			}

			if (delta.content) {
				content += delta.content;
				this.emit({
					type: "assistant.stream.delta",
					sessionId: this.sessionId,
					delta: delta.content
				});
			}

			if (delta.tool_calls) {
				mergeToolCalls(toolCalls, delta.tool_calls);
			}
		}

		this.emit({ type: "assistant.stream.completed", sessionId: this.sessionId, content });

		return {
			role: "assistant",
			content,
			tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
			refusal: null
		} as OpenAI.Chat.Completions.ChatCompletionMessage;
	}
}

function mergeToolCalls(
	target: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
	deltas: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[]
): void {
	for (const toolCall of deltas) {
		const index = toolCall.index ?? 0;
		if (!target[index]) {
			target[index] = {
				id: toolCall.id ?? "",
				type: "function",
				function: { name: "", arguments: "" }
			} as OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
		}

		const nextCall = target[index] as OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
			function: { name: string; arguments: string };
		};
		const fn = toolCall.function;

		if (fn?.name) {
			nextCall.function.name += fn.name;
		}

		if (fn?.arguments) {
			nextCall.function.arguments += fn.arguments;
		}

		if (toolCall.id) {
			nextCall.id = toolCall.id;
		}
	}
}
