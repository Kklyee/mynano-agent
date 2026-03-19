import path from "node:path";
import { OpenAICompatibleClient } from "../models/openai-compatible";
import { BackgroundManager } from "../services/background-manager";
import { CompactManager } from "../services/compact-manager";
import { SkillLoader } from "../services/skill-loader";
import { TaskManager } from "../services/task-manager";
import { TodoManager } from "../services/todo-manager";
import { ToolRegistry } from "../tools/tool-registry";
import type { ToolContext } from "../tools/builtins";
import type { CreateAgentOptions } from "./types";

export class AgentRuntime {
  readonly openai: OpenAICompatibleClient;
  readonly todoManager: TodoManager;
  readonly skillLoader: SkillLoader;
  readonly compactManager: CompactManager;
  readonly taskManager: TaskManager;
  readonly backgroundManager: BackgroundManager;
  readonly toolRegistry: ToolRegistry;
  readonly options: CreateAgentOptions;

  constructor(options: CreateAgentOptions) {
    this.options = options;
    this.openai = new OpenAICompatibleClient(options.llmConfig);
    this.todoManager = new TodoManager();
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

    const toolContext: ToolContext = {
      workDir: options.runtime.workDir,
      todoManager: this.todoManager,
      skillLoader: this.skillLoader,
      client: this.openai.openaiClient,
      model: this.openai.model,
      getTools: () => this.toolRegistry.getDefinitions(),
      compactManager: this.compactManager,
      taskManager: this.taskManager,
      backgroundManager: this.backgroundManager,
    };

    this.toolRegistry = new ToolRegistry(
      toolContext,
      options.behavior?.enabledTools,
    );
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
}
