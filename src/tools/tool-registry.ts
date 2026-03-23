import type OpenAI from "openai";
import type { ToolsType } from "./types";
import {
  executeTool,
  getToolDefinitions,
} from "./builtins";
import type { ToolContext } from "./context";

export class ToolRegistry {
  private readonly enabledTools?: ToolsType[];
  private readonly context: ToolContext;

  constructor(context: ToolContext, enabledTools?: ToolsType[]) {
    this.context = context;
    this.enabledTools = enabledTools;
  }

  getDefinitions(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return getToolDefinitions(this.enabledTools);
  }

  async execute(name: ToolsType, args: unknown): Promise<string> {
    return executeTool(name, args, this.context);
  }

  getEnabledTools(): ToolsType[] | undefined {
    return this.enabledTools;
  }
}
