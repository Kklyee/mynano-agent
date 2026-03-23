"use client";

import { useState } from "react";
import { getAgentApiBaseUrl } from "@/api/conversations/api";
import { createEmptyAgentViewState } from "@/state/agent/view-state";
import { useAgentRun } from "./use-agent-run";
import { useConversations } from "@/hooks/conversations/use-conversations";

export function useAgentView() {
	const [state, setState] = useState(createEmptyAgentViewState);
	const apiBaseUrl = getAgentApiBaseUrl();

	const conversations = useConversations({
		apiBaseUrl,
		state,
		setState
	});

	const agentRun = useAgentRun({
		apiBaseUrl,
		state,
		setState,
		reloadList: conversations.loadList,
		createConversation: conversations.createConversation
	});

	return {
		apiBaseUrl,
		cancelRun: agentRun.stopRun,
		conversations: conversations.conversations,
		createConversation: conversations.createConversation,
		deleteConversation: conversations.deleteConversation,
		healthQuery: conversations.healthQuery,
		isConversationListLoading: conversations.isListLoading,
		isRunning: agentRun.isRunning,
		resetWorkspace: agentRun.resetView,
		selectConversation: conversations.selectConversation,
		sendPrompt: agentRun.sendPrompt,
		state
	};
}
