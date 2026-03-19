import fs from "node:fs/promises";
import path from "node:path";
import type OpenAI from "openai";

export class CompactManager {
  private readonly keepRecent = 3;
  private readonly threshold = 50000;
  private readonly transcriptDir: string;

  constructor(transcriptDir: string) {
    this.transcriptDir = transcriptDir;
    void this.ensureDir();
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.transcriptDir, { recursive: true });
  }

  estimateTokens(messages: unknown[]): number {
    const text = JSON.stringify(messages);
    return Math.ceil(text.length * 0.5);
  }

  microCompact(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const toolIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i]?.role === "tool") {
        toolIndices.push(i);
      }
    }

    if (toolIndices.length <= this.keepRecent) {
      return messages;
    }

    const toCompact = toolIndices.slice(0, -this.keepRecent);
    const result = [...messages];

    for (const index of toCompact) {
      const message = result[index] as {
        role: "tool";
        content: string;
      };
      message.content = `[Previous ${this.inferToolName(message.content)} result omitted]`;
    }

    return result;
  }

  shouldAutoCompact(messages: unknown[]): boolean {
    return this.estimateTokens(messages) > this.threshold;
  }

  async compact(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    client: OpenAI,
    model: string,
    systemPrompt?: string,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    const transcriptPath = path.join(
      this.transcriptDir,
      `transcript_${Date.now()}.jsonl`,
    );
    await fs.writeFile(
      transcriptPath,
      messages.map((message) => JSON.stringify(message)).join("\n"),
      "utf-8",
    );

    const summary = await this.generateSummary(messages, client, model);
    const compressedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [];

    const systemContent = systemPrompt
      ? `${systemPrompt}\n\n[Context Compressed] Previous conversation summary:\n${summary}`
      : `[Context Compressed] Previous conversation summary:\n${summary}\n\nContinue assisting the user.`;

    compressedMessages.push({
      role: "system",
      content: systemContent,
    });

    for (const message of messages.slice(-this.keepRecent)) {
      if (message.role === "user" || message.role === "tool") {
        compressedMessages.push(message);
      }
    }

    return compressedMessages;
  }

  private inferToolName(content: string): string {
    if (content.includes("已经写入")) return "write_file";
    if (content.includes("已经编辑")) return "edit_file";
    if (content.includes("任务列表")) return "todo_write";
    if (content.includes("子智能体")) return "delegate_to_subagent";
    if (content.includes("total ")) return "bash";
    return "tool";
  }

  private async generateSummary(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    client: OpenAI,
    model: string,
  ): Promise<string> {
    const summaryPrompt = `Please summarize the following conversation concisely.

Focus on:
1. What tasks were completed
2. What files were modified
3. What decisions were made
4. What is the current state

Conversation:
${JSON.stringify(messages.slice(-20))}`;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: summaryPrompt }],
        max_tokens: 1000,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content || "No summary available";
    } catch {
      return "Conversation summary unavailable due to error.";
    }
  }
}
