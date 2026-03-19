import path from "node:path";
import { OpenAICompatibleClient } from "../models/openai-compatible";
import { BackgroundManager } from "../services/background-manager";
import { CompactManager } from "../services/compact-manager";
import { ConversationBackgroundManager } from "../services/conversation-background-manager";
import { ConversationTaskManager } from "../services/conversation-task-manager";
import { SkillLoader } from "../services/skill-loader";
import { TaskManager } from "../services/task-manager";
import type { BackgroundManagerContract, TaskManagerContract } from "../services/types";
import { ToolRegistry } from "../tools/tool-registry";
import type { ToolContext } from "../tools/builtins";
import type { AgentSessionScope, CreateAgentOptions } from "./types";

export class AgentRuntime {
  readonly openai: OpenAICompatibleClient;
  readonly skillLoader: SkillLoader;
  readonly compactManager: CompactManager;
  readonly taskManager: TaskManagerContract;
  readonly backgroundManager: BackgroundManagerContract;
  readonly toolRegistry: ToolRegistry;
  readonly options: CreateAgentOptions;

  constructor(options: CreateAgentOptions) {
    this.options = options;
    this.openai = new OpenAICompatibleClient(options.llmConfig);
    this.skillLoader = new SkillLoader(
      options.runtime.skillsDir ?? path.join(options.runtime.workDir, "skills"),
      options.runtime.enabledSkills,
    );
    this.compactManager = new CompactManager(
      options.runtime.transcriptDir ??
      path.join(options.runtime.workDir, ".transcript"),
    );
    this.taskManager = new TaskManager(
      options.runtime.tasksDir ??
      path.join(options.runtime.workDir, ".tasks"),
    );
    this.backgroundManager = new BackgroundManager();
    this.toolRegistry = this.createToolRegistry(this.taskManager, this.backgroundManager);
  }

  createSessionScope(conversationId?: string): AgentSessionScope {
    if (conversationId && this.options.conversationService) {
      const taskManager = new ConversationTaskManager(
        this.options.conversationService,
        conversationId,
      );
      const backgroundManager = new ConversationBackgroundManager();

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

  private createToolRegistry(
    taskManager: TaskManagerContract,
    backgroundManager: BackgroundManagerContract,
  ) {
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

    registry = new ToolRegistry(
      toolContext,
      this.options.behavior?.enabledTools,
    );

    return registry;
  }
}


