import type { AgentBackendEvent } from "@/types/agent-state";

export const normalizeBackendEvent = (eventName: string, rawData: string): AgentBackendEvent => {
	const parsed = JSON.parse(rawData) as Record<string, unknown>;
	const type = typeof parsed.type === "string" ? parsed.type : eventName;

	return {
		...(parsed as object),
		type
	} as AgentBackendEvent;
};

export const parseSseMessage = (block: string) => {
	const lines = block.split(/\r?\n/);
	let event = "message";
	const dataLines: string[] = [];

	for (const line of lines) {
		if (!line) continue;
		if (line.startsWith("event:")) {
			event = line.slice("event:".length).trim();
			continue;
		}
		if (line.startsWith("data:")) {
			dataLines.push(line.slice("data:".length).trim());
		}
	}

	if (dataLines.length === 0) return null;

	return {
		event,
		data: dataLines.join("\n")
	};
};

export async function consumeConversationStream(
	stream: ReadableStream<Uint8Array>,
	onMessage: (message: { event: string; data: string }) => void | Promise<void>
) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

		let boundary = buffer.indexOf("\n\n");
		while (boundary !== -1) {
			const chunk = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			const message = parseSseMessage(chunk);
			if (message) {
				await onMessage(message);
			}
			boundary = buffer.indexOf("\n\n");
		}

		if (done) break;
	}
}
