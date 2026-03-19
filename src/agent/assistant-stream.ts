export function extractAssistantTextDelta(delta: Record<string, unknown>): string {
  if (typeof delta.content === "string" && delta.content.length > 0) {
    return delta.content;
  }

  if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
    return delta.reasoning_content;
  }

  if (typeof delta.reasoning === "string" && delta.reasoning.length > 0) {
    return delta.reasoning;
  }

  if (
    delta.reasoning &&
    typeof delta.reasoning === "object" &&
    "content" in delta.reasoning &&
    typeof (delta.reasoning as { content?: unknown }).content === "string"
  ) {
    return (delta.reasoning as { content: string }).content;
  }

  return "";
}

export function ensureAssistantMessageHasVisibleOutput(
  content: string,
  toolCallCount: number,
): void {
  if (content.trim().length > 0 || toolCallCount > 0) {
    return;
  }

  throw new Error("Model returned an empty assistant response");
}
