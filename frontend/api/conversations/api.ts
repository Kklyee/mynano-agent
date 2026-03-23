export type HealthResponse = {
	status: string;
	message: string;
};

export type ConversationListItem = {
	id: string;
	title: string;
	status: string;
	updatedAt: string;
	lastMessageAt: string | null;
	messageCount: number;
};

export type ConversationDetailPayload = {
	conversation: ConversationListItem;
	messages: Array<{
		id: string;
		role: "system" | "user" | "assistant" | "tool";
		content: string;
		sequence: number;
		status: "streaming" | "complete" | "failed" | "partial";
		createdAt: string;
	}>;
	tools: Array<{
		id: string;
		name: string;
		argsJson: string | null;
		resultText: string | null;
		status: "running" | "completed";
		sequence: number;
		startedAt: string;
		completedAt: string | null;
	}>;
	tasks: Array<{
		taskId: number;
		subject: string | null;
		description: string | null;
		owner: string | null;
		blockedBy: number[];
		status: string;
		createdAt: string;
		updatedAt: string;
	}>;
	taskEvents: Array<{
		id: string;
		taskId: number;
		subject: string | null;
		status: string;
		sequence: number;
		updatedAt: string;
	}>;
	backgroundTasks: Array<{
		taskId: string;
		command: string | null;
		summary: string | null;
		status: string;
		startedAt: string;
		completedAt: string | null;
		exitCode: number | null;
	}>;
	backgroundEvents: Array<{
		id: string;
		taskId: string;
		command: string | null;
		summary: string | null;
		status: string;
		sequence: number;
		updatedAt: string;
	}>;
};

export const getAgentApiBaseUrl = () => process.env.NEXT_PUBLIC_AGENT_API_BASE_URL || "http://localhost:3001";

export async function fetchConversationList(apiBaseUrl: string): Promise<ConversationListItem[]> {
	const payload = await fetchJson<{ conversations: ConversationListItem[] }>(`${apiBaseUrl}/api/conversations`);
	return payload.conversations;
}

export async function fetchConversationDetail(
	apiBaseUrl: string,
	conversationId: string
): Promise<ConversationDetailPayload> {
	return fetchJson<ConversationDetailPayload>(`${apiBaseUrl}/api/conversations/${conversationId}`);
}

export async function createConversation(apiBaseUrl: string): Promise<ConversationListItem> {
	const payload = await fetchJson<{ conversation: ConversationListItem }>(`${apiBaseUrl}/api/conversations`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({})
	});
	return payload.conversation;
}

export async function deleteConversation(apiBaseUrl: string, conversationId: string): Promise<void> {
	await fetchJson(`${apiBaseUrl}/api/conversations/${conversationId}`, {
		method: "DELETE"
	});
}

export async function cancelConversationRun(apiBaseUrl: string, conversationId: string): Promise<boolean> {
	const payload = await fetchJson<{ cancelled: boolean }>(`${apiBaseUrl}/api/conversations/${conversationId}/cancel`, {
		method: "POST"
	});

	return payload.cancelled;
}

export async function sendConversationPrompt(
	apiBaseUrl: string,
	conversationId: string,
	prompt: string,
	signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
	const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}/messages`, {
		method: "POST",
		credentials: "include",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ prompt }),
		signal
	});

	if (!response.ok || !response.body) {
		let errorMessage = `Upstream agent request failed with status ${response.status}`;

		try {
			const payload = (await response.json()) as { error?: string };
			errorMessage = payload.error ?? errorMessage;
		} catch {
			errorMessage = `Upstream agent request failed with status ${response.status}`;
		}

		throw new Error(errorMessage);
	}

	return response.body;
}

export async function fetchHealth(apiBaseUrl: string): Promise<HealthResponse> {
	return fetchJson<HealthResponse>(`${apiBaseUrl}/`);
}

async function fetchJson<T = void>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		credentials: "include",
		...init
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}
