"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  applyAgentEvent,
  beginAgentRun,
  cancelAgentRun,
  consumeAgentSse,
  createEmptyAgentStudioState,
  failAgentRun,
  getAgentApiBaseUrl,
  hydrateConversationState,
  normalizeBackendEvent,
  type ConversationDetailPayload,
  type ConversationListItem,
} from "../agent-native-client";

type HealthResponse = {
  status: string;
  message: string;
};

export function useChat() {
  const [state, setState] = useState(createEmptyAgentStudioState);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [isConversationListLoading, setIsConversationListLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const apiBaseUrl = getAgentApiBaseUrl();

  const loadConversationList = async () => {
    setIsConversationListLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/conversations`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Conversation list failed with status ${response.status}`);
      }

      const payload = (await response.json()) as {
        conversations: ConversationListItem[];
      };
      setConversations(payload.conversations);

      if (!state.session.threadId && payload.conversations[0]?.id) {
        const detail = await fetchConversationDetail(payload.conversations[0].id);
        setState(hydrateConversationState(detail));
      }
    } finally {
      setIsConversationListLoading(false);
    }
  };

  const fetchConversationDetail = async (conversationId: string) => {
    const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Conversation detail failed with status ${response.status}`);
    }

    return (await response.json()) as ConversationDetailPayload;
  };

  const createConversation = async () => {
    const response = await fetch(`${apiBaseUrl}/api/conversations`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      throw new Error(`Create conversation failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      conversation: ConversationListItem;
    };
    setConversations((current) => [payload.conversation, ...current]);
    setState((current) => ({
      ...createEmptyAgentStudioState(),
      session: {
        ...createEmptyAgentStudioState().session,
        threadId: payload.conversation.id,
      },
    }));
    return payload.conversation;
  };

  const selectConversation = async (conversationId: string) => {
    const detail = await fetchConversationDetail(conversationId);
    setState(hydrateConversationState(detail));
  };

  useEffect(() => {
    void loadConversationList();
  }, [apiBaseUrl]);

  const healthQuery = useQuery({
    queryKey: ["agent-health", apiBaseUrl],
    queryFn: async () => {
      const response = await fetch(`${apiBaseUrl}/`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }

      return (await response.json()) as HealthResponse;
    },
    refetchInterval: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: async ({
      conversationId,
      prompt,
    }: {
      conversationId: string;
      prompt: string;
    }) => {
      const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
        signal: abortRef.current?.signal,
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

      await consumeAgentSse(response.body, async (message) => {
        const event = normalizeBackendEvent(message.event, message.data);
        // 立即更新状态，不使用 startTransition，确保工具调用状态实时显示
        setState((current) => applyAgentEvent(current, event));
      });
    },
    onError: (error) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        // 立即更新状态，不使用 startTransition
        setState((current) => cancelAgentRun(current));
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      // 立即更新状态，不使用 startTransition
      setState((current) => failAgentRun(current, message));
    },
    onSettled: () => {
      abortRef.current = null;
      void loadConversationList();
    },
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
    // 立即更新状态，不使用 startTransition
    setState((current) => ({
      ...beginAgentRun(
        {
          ...current,
          session: {
            ...current.session,
            threadId: conversationId,
          },
        },
        cleanPrompt,
      ),
    }));
    runMutation.mutate({ conversationId, prompt: cleanPrompt });
  };

  const cancelRun = () => {
    abortRef.current?.abort();
  };

  const resetWorkspace = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    void createConversation();
  };

  const isRunning =
    state.session.status === "connecting" || state.session.status === "running";

  return {
    apiBaseUrl,
    cancelRun,
    healthQuery,
    conversations,
    createConversation,
    isRunning,
    isConversationListLoading,
    resetWorkspace,
    sendPrompt,
    selectConversation,
    state,
  };
}
