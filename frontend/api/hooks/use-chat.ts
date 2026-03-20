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
  const stateRef = useRef(state);
  const apiBaseUrl = getAgentApiBaseUrl();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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

      if (!stateRef.current.session.threadId && payload.conversations[0]?.id) {
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
    return payload.conversation;
  };

  const selectConversation = async (conversationId: string) => {
    const detail = await fetchConversationDetail(conversationId);
    setState(hydrateConversationState(detail));
  };

  const deleteConversation = async (conversationId: string) => {
    const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Delete conversation failed with status ${response.status}`);
    }

    const remainingConversations = conversations.filter((c) => c.id !== conversationId);
    setConversations(remainingConversations);

    if (stateRef.current.session.threadId === conversationId) {
      const nextConversationId = remainingConversations[0]?.id;
      if (nextConversationId) {
        const detail = await fetchConversationDetail(nextConversationId);
        setState(hydrateConversationState(detail));
      } else {
        setState(createEmptyAgentStudioState());
      }
    }
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
    setState(createEmptyAgentStudioState());
  };

  const isRunning =
    state.session.status === "connecting" || state.session.status === "running";

  return {
    apiBaseUrl,
    cancelRun,
    healthQuery,
    conversations,
    createConversation,
    deleteConversation,
    isRunning,
    isConversationListLoading,
    resetWorkspace,
    sendPrompt,
    selectConversation,
    state,
  };
}
