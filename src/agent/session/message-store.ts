import type OpenAI from "openai";
import type { AgentSeedMessage } from "../core/types";

export class MessageStore {
	private readonly messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

	constructor(seedMessages: AgentSeedMessage[] = []) {
		this.messages.push(...seedMessages.map((message) => toChatMessage(message)));
	}

	all(): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
		return [...this.messages];
	}

	hasSystemMessage(): boolean {
		return this.messages.some((message) => message.role === "system");
	}

	push(message: OpenAI.Chat.Completions.ChatCompletionMessageParam): void {
		this.messages.push(message);
	}

	replace(nextMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): void {
		this.messages.length = 0;
		this.messages.push(...nextMessages);
	}

	toSimpleMessages(): Array<{ role: string; content: string }> {
		return this.messages.map((message) => ({
			role: message.role,
			content: typeof message.content === "string" ? message.content : ""
		}));
	}
}

function toChatMessage(message: AgentSeedMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
	if (message.role === "system") {
		return {
			role: "system",
			content: message.content
		};
	}

	if (message.role === "assistant") {
		return {
			role: "assistant",
			content: message.content
		};
	}

	return {
		role: "user",
		content: message.content
	};
}
