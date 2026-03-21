import path from "node:path";
import { OpenAICompatibleClient } from "../models/openai-compatible";
import { BackgroundManager } from "../runtime/background-manager";
import { CompactManager } from "../runtime/compact-manager";
import { ConversationBackgroundManager } from "../runtime/conversation-background-manager";
import { ConversationTaskManager } from "../runtime/conversation-task-manager";
import { TaskManager } from "../runtime/task-manager";
import type { ConversationService } from "../services/conversation-service";
import type { ToolContext } from "../tools/builtins";
import { ToolRegistry } from "../tools/tool-registry";
import type { BackgroundManagerContract, TaskManagerContract } from "../types";
import { SkillLoader } from "./skill-loader";
import type { AgentSessionScope, CreateAgentOptions } from "./types";

export class AgentRuntime {
	readonly openai: OpenAICompatibleClient;
	readonly skillLoader: SkillLoader;
	readonly compactManager: CompactManager;
	readonly taskManager: TaskManagerContract;
	readonly backgroundManager: BackgroundManagerContract;
	readonly toolRegistry: ToolRegistry;
	readonly options: CreateAgentOptions;

	constructor(
		options: CreateAgentOptions,
		private readonly conversationService?: ConversationService,
	) {
		this.options = options;
		this.openai = new OpenAICompatibleClient(options.llmConfig);
		this.skillLoader = new SkillLoader(
			options.runtime.skillsDir ?? path.join(options.runtime.workDir, "skills"),
			options.runtime.enabledSkills,
		);
		this.compactManager = new CompactManager(
			options.runtime.transcriptDir ?? path.join(options.runtime.workDir, ".transcript"),
		);
		this.taskManager = new TaskManager(options.runtime.tasksDir ?? path.join(options.runtime.workDir, ".tasks"));
		this.backgroundManager = new BackgroundManager();
		this.toolRegistry = this.createToolRegistry(this.taskManager, this.backgroundManager);
	}

	createSessionScope(conversationId?: string): AgentSessionScope {
		if (conversationId && this.conversationService) {
			const taskManager = new ConversationTaskManager(this.conversationService, conversationId);
			const backgroundManager = new ConversationBackgroundManager(this.conversationService, conversationId);

			return {
				taskManager,
				backgroundManager,
				toolRegistry: this.createToolRegistry(taskManager, backgroundManager),
			};
		}

		return {
			taskManager: this.taskManager,
			backgroundManager: this.backgroundManager,
			toolRegistry: this.toolRegistry,
		};
	}

	getMaxSteps(): number {
		return this.options.runtime.maxSteps ?? 20;
	}

	shouldUseCompact(): boolean {
		return this.options.runtime.enableCompact ?? true;
	}

	shouldUseBackground(): boolean {
		return this.options.runtime.enableBackground ?? true;
	}

	private createToolRegistry(taskManager: TaskManagerContract, backgroundManager: BackgroundManagerContract) {
		let registry: ToolRegistry;
		const toolContext: ToolContext = {
			workDir: this.options.runtime.workDir,
			skillLoader: this.skillLoader,
			client: this.openai.openaiClient,
			model: this.openai.model,
			getTools: () => registry.getDefinitions(),
			compactManager: this.compactManager,
			taskManager,
			backgroundManager,
		};

		registry = new ToolRegistry(toolContext, this.options.behavior?.enabledTools);

		return registry;
	}
}
