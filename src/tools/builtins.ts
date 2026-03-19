import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import type OpenAI from "openai";
import { runSubagent } from "../services/subagent";
import { TodoManager } from "../services/todo-manager";
import type { BackgroundManager } from "../services/background-manager";
import type { CompactManager } from "../services/compact-manager";
import type { SkillLoader } from "../services/skill-loader";
import type { TaskManager } from "../services/task-manager";
import type { Task, TodoItem } from "../services/types";
import type { ToolsType } from "./types";

export function safePath(relativePath: string, workDir: string): string {
  const resolvedPath = path.resolve(workDir, relativePath);
  if (!resolvedPath.startsWith(workDir)) {
    throw new Error(`非法路径 ${relativePath}`);
  }
  return resolvedPath;
}

export interface ToolContext {
  workDir: string;
  todoManager: TodoManager;
  skillLoader: SkillLoader;
  client: OpenAI;
  model: string;
  getTools: () => OpenAI.Chat.Completions.ChatCompletionTool[];
  compactManager?: CompactManager;
  taskManager?: TaskManager;
  backgroundManager?: BackgroundManager;
}

export interface ToolDefinition {
  name: ToolsType;
  description: string;
  parameters: OpenAI.FunctionParameters;
  handler: (args: any, ctx: ToolContext) => Promise<string>;
}

const toolDefinitions: ToolDefinition[] = [
  {
    name: "bash",
    description: "在当前工作目录执行 shell 命令",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "要执行的 shell 命令",
        },
      },
      required: ["command"],
    },
    handler: async ({ command }, { workDir }) => {
      const { stdout, stderr } = await execa(String(command), {
        cwd: workDir,
        shell: true,
        reject: false,
      });
      return [stdout, stderr].filter(Boolean).join("\n").slice(0, 50000);
    },
  },
  {
    name: "read_file",
    description: "读取工作目录中的文件",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要读取的文件路径",
        },
      },
      required: ["path"],
    },
    handler: async ({ path: filePath }, { workDir }) => {
      const fullPath = safePath(String(filePath), workDir);
      const text = await fs.readFile(fullPath, "utf-8");
      return text.slice(0, 50000);
    },
  },
  {
    name: "write_file",
    description: "向工作目录中写入文件",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要写入的文件路径",
        },
        content: {
          type: "string",
          description: "要写入的文件内容",
        },
      },
      required: ["path", "content"],
    },
    handler: async ({ path: filePath, content }, { workDir }) => {
      const fullPath = safePath(String(filePath), workDir);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, String(content ?? ""));
      return `已经写入 ${filePath}`;
    },
  },
  {
    name: "edit_file",
    description: "编辑工作目录中的文件",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要编辑的文件路径",
        },
        old_text: {
          type: "string",
          description: "要替换的旧文本",
        },
        new_text: {
          type: "string",
          description: "要写入的新文本",
        },
      },
      required: ["path", "old_text", "new_text"],
    },
    handler: async ({ path: filePath, old_text, new_text }, { workDir }) => {
      const fullPath = safePath(String(filePath), workDir);
      const oldText = String(old_text ?? "");
      const newText = String(new_text ?? "");
      const text = await fs.readFile(fullPath, "utf-8");
      if (!text.includes(oldText)) {
        return "编辑失败，未找到: old_text";
      }
      const updatedText = text.replace(oldText, newText);
      await fs.writeFile(fullPath, updatedText);
      return `已经编辑 ${filePath}`;
    },
  },
  {
    name: "todo_write",
    description: "更新简单任务列表，适合单轮多步骤任务",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              desc: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
              },
            },
            required: ["id", "desc", "status"],
          },
        },
      },
      required: ["items"],
    },
    handler: async ({ items }, { todoManager }) => {
      const todoItems = Array.isArray(items) ? items : [];
      return `任务列表已更新:\n${todoManager.update(todoItems as TodoItem[])}`;
    },
  },
  {
    name: "delegate_to_subagent",
    description: "把一个聚焦子任务委托给子代理",
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", description: "要委托的子任务" },
      },
      required: ["task"],
    },
    handler: async ({ task }, ctx) => {
      const taskStr = String(task ?? "").trim();
      if (!taskStr) {
        return "委托失败，未提供任务描述";
      }
      const subagentTools = ctx
        .getTools()
        .filter(
          (
            tool,
          ): tool is OpenAI.Chat.Completions.ChatCompletionFunctionTool =>
            tool.type === "function" &&
            tool.function.name !== "delegate_to_subagent",
        );
      const result = await runSubagent({
        model: ctx.model,
        client: ctx.client,
        tools: subagentTools,
        runTool: (name: string, args: any) =>
          executeTool(name as ToolsType, args, ctx),
        prompt: taskStr,
      });
      return `子智能体结果:\n${result}`;
    },
  },
  {
    name: "load_skill",
    description: "按需加载技能内容",
    parameters: {
      type: "object",
      properties: {
        skill_name: { type: "string", description: "技能名称" },
      },
      required: ["skill_name"],
    },
    handler: async ({ skill_name }, { skillLoader }) => {
      const name = String(skill_name ?? "").trim();
      if (!name) {
        return "加载失败，未提供技能名称";
      }
      return skillLoader.getContent(name);
    },
  },
  {
    name: "compact",
    description: "手动压缩上下文",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "压缩原因",
        },
      },
      required: [],
    },
    handler: async () => "COMPACT_TRIGGERED",
  },
  {
    name: "task_create",
    description: "创建新任务",
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "任务标题",
        },
        description: {
          type: "string",
          description: "任务描述",
        },
        blockedBy: {
          type: "array",
          items: { type: "number" },
          description: "依赖任务 ID",
        },
      },
      required: ["subject"],
    },
    handler: async ({ subject, description, blockedBy }, { taskManager }) => {
      if (!taskManager) {
        return "任务管理器未启用";
      }
      const deps = Array.isArray(blockedBy) ? blockedBy.map(Number) : [];
      const task = await taskManager.create(
        String(subject),
        String(description ?? ""),
        deps,
      );
      return `创建任务 #${task.id}: ${task.subject}\nStatus: ${task.status}`;
    },
  },
  {
    name: "task_update",
    description: "更新任务状态或属性",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "number",
          description: "任务 ID",
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "blocked"],
        },
        blockedBy: {
          type: "array",
          items: { type: "number" },
        },
        owner: {
          type: "string",
        },
        description: {
          type: "string",
        },
      },
      required: ["taskId"],
    },
    handler: async (
      { taskId, status, blockedBy, owner, description },
      { taskManager },
    ) => {
      if (!taskManager) {
        return "任务管理器未启用";
      }
      const updates: any = {};
      if (status !== undefined) updates.status = status;
      if (blockedBy !== undefined) updates.blockedBy = blockedBy.map(Number);
      if (owner !== undefined) updates.owner = owner;
      if (description !== undefined) updates.description = description;

      const task = await taskManager.update(Number(taskId), updates);
      return `更新任务 #${task.id}: ${task.subject}\nStatus: ${task.status}`;
    },
  },
  {
    name: "task_list",
    description: "列出任务",
    parameters: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "pending", "in_progress", "completed", "blocked", "ready"],
        },
      },
      required: [],
    },
    handler: async ({ filter }, { taskManager }) => {
      if (!taskManager) {
        return "任务管理器未启用";
      }
      let tasks: Task[] = [];
      const mode = String(filter || "all");

      switch (mode) {
        case "ready":
          tasks = await taskManager.getReadyTasks();
          break;
        case "blocked":
          tasks = await taskManager.getBlockedTasks();
          break;
        case "in_progress":
          tasks = await taskManager.getInProgressTasks();
          break;
        case "pending":
        case "completed": {
          const allTasks = await taskManager.listAll();
          tasks = allTasks.filter((task) => task.status === mode);
          break;
        }
        default:
          tasks = await taskManager.listAll();
      }

      return taskManager.renderTasks(tasks);
    },
  },
  {
    name: "task_get",
    description: "获取单个任务详情",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "number",
          description: "任务 ID",
        },
      },
      required: ["taskId"],
    },
    handler: async ({ taskId }, { taskManager }) => {
      if (!taskManager) {
        return "任务管理器未启用";
      }
      const task = await taskManager.get(Number(taskId));
      return task ? JSON.stringify(task, null, 2) : `Task #${taskId} not found`;
    },
  },
  {
    name: "background_run",
    description: "启动后台命令并立即返回 taskId",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "要执行的后台命令",
        },
      },
      required: ["command"],
    },
    handler: async ({ command }, { backgroundManager, workDir }) => {
      if (!backgroundManager) {
        return "后台任务管理器未启用";
      }
      const task = await backgroundManager.run(String(command), workDir);
      return [
        `Background task started: ${task.id}`,
        `Command: ${task.command}`,
        "Use background_check to inspect status.",
      ].join("\n");
    },
  },
  {
    name: "background_check",
    description: "检查后台任务状态",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "后台任务 ID",
        },
      },
      required: ["taskId"],
    },
    handler: async ({ taskId }, { backgroundManager }) => {
      if (!backgroundManager) {
        return "后台任务管理器未启用";
      }
      const task = backgroundManager.check(String(taskId));
      return task
        ? JSON.stringify(task, null, 2)
        : `Background task not found: ${taskId}`;
    },
  },
];

export function getToolDefinitions(
  enabledTools?: ToolsType[],
): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const selectedTools = enabledTools?.length
    ? toolDefinitions.filter((tool) => enabledTools.includes(tool.name))
    : toolDefinitions;

  return selectedTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export async function executeTool(
  name: ToolsType,
  args: unknown,
  ctx: ToolContext,
): Promise<string> {
  const tool = toolDefinitions.find((item) => item.name === name);
  if (!tool) {
    return `未知工具: ${name}`;
  }

  try {
    return await tool.handler(args, ctx);
  } catch (error: any) {
    return `工具执行失败：${error?.message ?? String(error)}`;
  }
}
