"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	type ConversationListItem,
	createConversation as createConversationRequest,
	deleteConversation as deleteConversationRequest,
	fetchConversationDetail,
	fetchConversationList,
	fetchHealth
} from "@/api/conversations/api";
import { createEmptyAgentViewState, type AgentViewState } from "@/state/agent/view-state";
import { hydrateDetail } from "@/state/conversations/detail-state";

type Options = {
	apiBaseUrl: string;
	state: AgentViewState;
	setState: React.Dispatch<React.SetStateAction<AgentViewState>>;
};

export function useConversations({ apiBaseUrl, state, setState }: Options) {
	const [conversations, setConversations] = useState<ConversationListItem[]>([]);
	const [isListLoading, setIsListLoading] = useState(true);
	const stateRef = useRef(state);

	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	const loadList = async () => {
		setIsListLoading(true);

		try {
			const nextConversations = await fetchConversationList(apiBaseUrl);
			setConversations(nextConversations);

			if (!stateRef.current.session.threadId && nextConversations[0]?.id) {
				const detail = await fetchConversationDetail(apiBaseUrl, nextConversations[0].id);
				setState(hydrateDetail(detail));
			}
		} finally {
			setIsListLoading(false);
		}
	};

	useEffect(() => {
		void loadList();
	}, [apiBaseUrl]);

	const selectConversation = async (conversationId: string) => {
		const detail = await fetchConversationDetail(apiBaseUrl, conversationId);
		setState(hydrateDetail(detail));
	};

	const createConversation = async () => {
		return createConversationRequest(apiBaseUrl);
	};

	const deleteConversation = async (conversationId: string) => {
		await deleteConversationRequest(apiBaseUrl, conversationId);
		const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
		setConversations(remaining);

		if (stateRef.current.session.threadId !== conversationId) {
			return;
		}

		const nextId = remaining[0]?.id;
		if (!nextId) {
			setState(createEmptyAgentViewState());
			return;
		}

		const detail = await fetchConversationDetail(apiBaseUrl, nextId);
		setState(hydrateDetail(detail));
	};

	const healthQuery = useQuery({
		queryKey: ["agent-health", apiBaseUrl],
		queryFn: async () => fetchHealth(apiBaseUrl),
		refetchInterval: 30_000
	});

	return {
		conversations,
		createConversation,
		deleteConversation,
		healthQuery,
		isListLoading,
		loadList,
		selectConversation
	};
}
