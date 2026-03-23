"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { cancelConversationRun, sendConversationPrompt } from "@/api/conversations/api";
import { consumeConversationStream, normalizeBackendEvent } from "@/api/agent/stream";
import { applyRunEvent, beginRun, cancelRun, failRun } from "@/state/agent/run-state";
import { createEmptyAgentViewState, type AgentViewState } from "@/state/agent/view-state";

type Options = {
	apiBaseUrl: string;
	state: AgentViewState;
	setState: React.Dispatch<React.SetStateAction<AgentViewState>>;
	reloadList: () => Promise<void>;
	createConversation: () => Promise<{ id: string }>;
};

export function useAgentRun({ apiBaseUrl, state, setState, reloadList, createConversation }: Options) {
	const abortRef = useRef<AbortController | null>(null);

	const runMutation = useMutation({
		mutationFn: async ({ conversationId, prompt }: { conversationId: string; prompt: string }) => {
			const stream = await sendConversationPrompt(apiBaseUrl, conversationId, prompt, abortRef.current?.signal);

			await consumeConversationStream(stream, async (message) => {
				const event = normalizeBackendEvent(message.event, message.data);
				setState((current) => applyRunEvent(current, event));
			});
		},
		onError: (error) => {
			if (error instanceof DOMException && error.name === "AbortError") {
				setState((current) => cancelRun(current));
				return;
			}

			const message = error instanceof Error ? error.message : "Unknown error";
			setState((current) => failRun(current, message));
		},
		onSettled: () => {
			abortRef.current = null;
			void reloadList();
		}
	});

	const sendPrompt = async (prompt: string) => {
		const cleanPrompt = prompt.trim();
		if (!cleanPrompt || runMutation.isPending) return;

		let conversationId = state.session.threadId;
		if (!conversationId) {
			const conversation = await createConversation();
			conversationId = conversation.id;
		}

		abortRef.current = new AbortController();
		setState((current) => ({
			...beginRun(
				{
					...current,
					session: {
						...current.session,
						threadId: conversationId
					}
				},
				cleanPrompt
			)
		}));

		runMutation.mutate({ conversationId, prompt: cleanPrompt });
	};

	const stopRun = async () => {
		const conversationId = state.session.threadId;
		if (!conversationId) {
			abortRef.current?.abort();
			return;
		}

		try {
			await cancelConversationRun(apiBaseUrl, conversationId);
		} finally {
			abortRef.current?.abort();
		}
	};

	const resetView = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		setState(createEmptyAgentViewState());
	};

	return {
		isRunning: state.session.status === "connecting" || state.session.status === "running",
		resetView,
		sendPrompt,
		stopRun
	};
}
