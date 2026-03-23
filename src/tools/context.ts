import type OpenAI from "openai";
import type { SkillLoader } from "../agent/skills/skill-loader";
import type { CompactManager } from "../runtime/compact-manager";
import type { BackgroundManagerContract, TaskManagerContract } from "../types";
import type { ToolsType } from "./types";

export interface ToolContext {
	workDir: string;
	skillLoader: SkillLoader;
	client: OpenAI;
	model: string;
	getTools: () => OpenAI.Chat.Completions.ChatCompletionTool[];
	compactManager?: CompactManager;
	taskManager?: TaskManagerContract;
	backgroundManager?: BackgroundManagerContract;
}

export interface ToolDefinition {
	name: ToolsType;
	description: string;
	parameters: OpenAI.FunctionParameters;
	handler: (args: any, ctx: ToolContext) => Promise<string>;
}
