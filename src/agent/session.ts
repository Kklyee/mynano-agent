import type OpenAI from "openai";
import type { Task } from "../services/types";
import type { ToolsType } from "../tools/types";
import { AsyncEventQueue } from "../utils/async-event-queue";
import { ensureAssistantMessageHasVisibleOutput, extractAssistantTextDelta } from "./assistant-stream";
import type { AgentEvent } from "./events";
import { AgentRuntime } from "./runtime";
import type {
  AgentRunResult,
  AgentSeedMessage,
  AgentSession as AgentSessionContract,
  AgentSessionScope,
  AgentState,
  ToolLog,
} from "./types";

export class AgentSession implements AgentSessionContract {
  readonly id: string;
  private readonly runtime: AgentRuntime;
  private readonly scope: AgentSessionScope;
  private state: AgentState;
  private readonly listeners = new Set<(event: AgentEvent) => void>();
  private readonly messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  constructor(
    runtime: AgentRuntime,
    sessionId: string,
    scope: AgentSessionScope,
    seedMessages: AgentSeedMessage[] = [],
  ) {
    this.runtime = runtime;
    this.scope = scope;
    this.id = sessionId;
    this.messages.push(...seedMessages.map((message) => this.toChatMessage(message)));
    this.state = {
      sessionId,
      status: "idle",
      step: 0,
      model: runtime.openai.model,
      messages: this.toSimpleMessages(this.messages),
      tasks: [],
      toolLogs: [],
      backgroundTasks: [],
    };
  }

  onEvent(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): AgentState {
    return {
      ...this.state,
      messages: this.toSimpleMessages(this.messages),
      tasks: [...this.state.tasks],
      toolLogs: [...this.state.toolLogs],
      backgroundTasks: [...this.state.backgroundTasks],
    };
  }

  private toSimpleMessages(
    msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): Array<{ role: string; content: string }> {
    return msgs.map((message) => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content : "",
    }));
  }

  private toChatMessage(
    message: AgentSeedMessage,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    if (message.role === "system") {
      return {
        role: "system",
        content: message.content,
      };
    }

    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
      };
    }

    return {
      role: "user",
      content: message.content,
    };
  }

  async run(input: string): Promise<AgentRunResult> {
    return this.runAgentLoop(input);
  }

  runStream(input: string): AsyncIterable<AgentEvent> {
    const queue = new AsyncEventQueue<AgentEvent>();
    const unsubscribe = this.onEvent((event) => queue.push(event));

    void this.runAgentLoop(input)
      .catch(() => {})
      .finally(() => {
        unsubscribe();
        queue.close();
      });

    return queue;
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private async runAgentLoop(input: string): Promise<AgentRunResult> {
    if (this.state.status === "running") {
      throw new Error("Session is already running");
    }

    if (!this.hasSystemMessage()) {
      const systemPrompt = await this.buildSystemPrompt();
      this.pushMessage({ role: "system", content: systemPrompt });
    }
    this.markSessionStarted();
    this.pushMessage({ role: "user", content: input }, "message.appended");

    try {
      while (this.hasStepsRemaining()) {
        this.state.step += 1;
        await this.applyContextCompaction();
        await this.injectBackgroundNotifications();

        const assistantMessage = await this.callLLM();
        const shouldStop = await this.handleAssistantResponse(assistantMessage);
        if (shouldStop) {
          return this.completeSession(assistantMessage.content ?? "");
        }
      }

      return this.completeSession("Reached max steps without final response.");
    } catch (error: unknown) {
      return this.failSession(error);
    }
  }

  private async buildSystemPrompt(): Promise<string> {
    const skillList = await this.runtime.skillLoader.renderList();
    const basePrompt =
      this.runtime.options.behavior?.systemPrompt ?? this.getDefaultSystemPrompt();
    return `${basePrompt}\n${skillList}`;
  }

  private hasSystemMessage(): boolean {
    return this.messages.some((message) => message.role === "system");
  }

  private getDefaultSystemPrompt(): string {
    return `你是一个面向调研和分析场景的 Agent。

你应该：
1. 先理解目标
2. 对复杂工作拆分任务
3. 在需要时调用工具
4. 最终输出结构化结论`;
  }

  private pushMessage(
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam,
    eventType?: "message.appended",
  ): void {
    this.messages.push(message);
    if (eventType) {
      this.emit({
        type: eventType,
        sessionId: this.id,
        role: message.role,
        content: typeof message.content === "string" ? message.content : "",
      });
    }
  }

  private markSessionStarted(): void {
    this.state.status = "running";
    this.state.startedAt = Date.now();
    this.state.completedAt = undefined;
    this.emit({ type: "session.started", sessionId: this.id });
  }

  private hasStepsRemaining(): boolean {
    return this.state.step < this.runtime.getMaxSteps();
  }

  private async applyContextCompaction(): Promise<void> {
    if (!this.runtime.shouldUseCompact()) return;

    this.applyMicroCompaction();
    await this.applyAutoCompactionIfNeeded();
  }

  private applyMicroCompaction(): void {
    const compacted = this.runtime.compactManager.microCompact(this.messages);
    if (compacted !== this.messages) {
      this.replaceMessages(compacted);
    }
  }

  private async applyAutoCompactionIfNeeded(): Promise<void> {
    if (!this.runtime.compactManager.shouldAutoCompact(this.messages)) return;

    const systemPrompt = await this.buildSystemPrompt();
    const compressed = await this.runtime.compactManager.compact(
      this.messages,
      this.runtime.openai.openaiClient,
      this.runtime.openai.model,
      systemPrompt,
    );
    this.replaceMessages(compressed);
  }

  private replaceMessages(
    newMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): void {
    this.messages.length = 0;
    this.messages.push(...newMessages);
  }

  private async injectBackgroundNotifications(): Promise<void> {
    if (!this.runtime.shouldUseBackground()) return;

    const notifications = this.scope.backgroundManager.drainNotifications();
    if (notifications.length === 0) return;

    const content = ["Background task notifications:", ...notifications.map((item) => item.message)].join(
      "\n\n",
    );
    this.messages.push({ role: "system", content });

    for (const notification of notifications) {
      this.emit({
        type: "background.updated",
        sessionId: this.id,
        taskId: notification.taskId,
        status: notification.status,
      });
    }
  }

  private async callLLM(): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const stream = this.runtime.openai.createChatCompletionStream({
      messages: this.messages,
      tools: this.scope.toolRegistry.getDefinitions(),
      temperature: this.runtime.openai.temperature,
      tool_choice: "auto",
    });

    this.emit({ type: "assistant.stream.started", sessionId: this.id });

    let content = "";
    const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        this.emit({
          type: "assistant.stream.delta",
          sessionId: this.id,
          delta: delta.content,
        });
      }

      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index ?? 0;
          if (!toolCalls[index]) {
            toolCalls[index] = {
              id: toolCall.id ?? "",
              type: "function",
              function: { name: "", arguments: "" },
            } as OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
          }
          const fn = toolCall.function;
          if (fn?.name) {
            (toolCalls[index] as any).function.name += fn.name;
          }
          if (fn?.arguments) {
            (toolCalls[index] as any).function.arguments += fn.arguments;
          }
          if (toolCall.id) {
            toolCalls[index].id = toolCall.id;
          }
        }
      }
    }

    this.emit({ type: "assistant.stream.completed", sessionId: this.id, content });

    return {
      role: "assistant",
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      refusal: null,
    } as OpenAI.Chat.Completions.ChatCompletionMessage;
  }

  private async handleAssistantResponse(
    message: OpenAI.Chat.Completions.ChatCompletionMessage,
  ): Promise<boolean> {
    this.pushMessage(message, "message.appended");

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return true;
    }

    await this.executeToolCalls(toolCalls);
    return false;
  }

  private async executeToolCalls(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  ): Promise<void> {
    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      await this.executeSingleToolCall(call);
    }
  }

  private async executeSingleToolCall(
    call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  ): Promise<void> {
    console.log(`[${this.id}] Raw tool call:`, JSON.stringify(call, null, 2));

    const fnCall = (call as any).function;
    const toolName = fnCall?.name || "unknown";
    const args = JSON.parse(fnCall?.arguments || "{}");

    console.log(`[${this.id}] Tool called: ${toolName}`, args);

    this.emit({ type: "tool.called", sessionId: this.id, name: toolName, args });

    const log = this.createToolLog(toolName, args);
    const result = await this.dispatchToolExecution(toolName, args);
    this.finalizeToolLog(log, result);

    this.messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: result,
    });

    this.emit({ type: "tool.completed", sessionId: this.id, name: toolName, result });
    await this.refreshTaskState();
    this.refreshBackgroundState();
  }

  private createToolLog(name: ToolsType, args: unknown): ToolLog {
    const log: ToolLog = { name, args, startedAt: Date.now() };
    this.state.currentTool = name;
    this.state.toolLogs.push(log);
    return log;
  }

  private finalizeToolLog(log: ToolLog, result: string): void {
    log.result = result;
    log.completedAt = Date.now();
    this.state.currentTool = undefined;
  }

  private async dispatchToolExecution(toolName: string, args: unknown): Promise<string> {
    if (!toolName || toolName === "unknown") {
      return "Error: Unknown tool";
    }

    if (toolName === "compact") {
      const systemPrompt = await this.buildSystemPrompt();
      const compressed = await this.runtime.compactManager.compact(
        this.messages,
        this.runtime.openai.openaiClient,
        this.runtime.openai.model,
        systemPrompt,
      );
      this.replaceMessages(compressed);
      return "Context has been compacted successfully";
    }

    try {
      return await this.scope.toolRegistry.execute(toolName as ToolsType, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${this.id}] Tool execution failed: ${toolName}`, message);
      return `Error: ${message}`;
    }
  }

  private completeSession(output: string): AgentRunResult {
    this.state.status = "completed";
    this.state.completedAt = Date.now();
    this.emit({ type: "session.completed", sessionId: this.id, result: output });
    return {
      sessionId: this.id,
      output,
      steps: this.state.step,
      status: this.state.status,
    };
  }

  private failSession(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    this.state.status = "failed";
    this.state.completedAt = Date.now();
    this.emit({ type: "session.failed", sessionId: this.id, error: message });
    throw error;
  }

  private async refreshTaskState(): Promise<void> {
    const previousTasks = new Map<number, Task>(this.state.tasks.map((task) => [task.id, task]));
    const nextTasks = await this.scope.taskManager.listAll();

    for (const task of nextTasks) {
      const previous = previousTasks.get(task.id);
      if (!previous) {
        this.emit({
          type: "task.created",
          sessionId: this.id,
          taskId: task.id,
          subject: task.subject,
        });
      } else if (previous.status !== task.status) {
        this.emit({
          type: "task.updated",
          sessionId: this.id,
          taskId: task.id,
          status: task.status,
        });
      }
    }

    this.state.tasks = nextTasks;
  }

  private refreshBackgroundState(): void {
    const previousTasks = new Map(
      this.state.backgroundTasks.map((task) => [task.id, task]),
    );
    const nextTasks = this.scope.backgroundManager.list();

    for (const task of nextTasks) {
      const previous = previousTasks.get(task.id);
      if (!previous) {
        this.emit({
          type: "background.started",
          sessionId: this.id,
          taskId: task.id,
          status: task.status,
        });
      } else if (previous.status !== task.status) {
        this.emit({
          type: "background.updated",
          sessionId: this.id,
          taskId: task.id,
          status: task.status,
        });
      }
    }

    this.state.backgroundTasks = nextTasks;
  }
}

