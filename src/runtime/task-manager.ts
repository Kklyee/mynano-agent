import fs from "node:fs/promises";
import path from "node:path";
import type { Task } from "../types";
import { diffTaskDependencies } from "../utils/task-graph";

export class TaskManager {
  private readonly tasksDir: string;
  private nextId: number;
  private readonly ready: Promise<void>;

  constructor(tasksDir: string) {
    this.tasksDir = tasksDir;
    this.nextId = 1;
    this.ready = this.initialize();
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(this.tasksDir, { recursive: true });
    this.nextId = await this.calcNextId();
  }

  private async calcNextId(): Promise<number> {
    try {
      const files = await fs.readdir(this.tasksDir);
      let maxId = 0;
      for (const file of files) {
        const match = file.match(/^task_(\d+)\.json$/);
        if (match) {
          const id = Number(match[1]);
          maxId = Math.max(maxId, id);
        }
      }
      return maxId + 1;
    } catch {
      return 1;
    }
  }

  private getTaskPath(taskId: number): string {
    return path.join(this.tasksDir, `task_${taskId}.json`);
  }

  private async saveTask(task: Task): Promise<void> {
    task.updatedAt = Date.now();
    await fs.writeFile(
      this.getTaskPath(task.id),
      JSON.stringify(task, null, 2),
      "utf-8",
    );
  }

  private async loadTask(taskId: number): Promise<Task | null> {
    try {
      const content = await fs.readFile(this.getTaskPath(taskId), "utf-8");
      return JSON.parse(content) as Task;
    } catch {
      return null;
    }
  }

  private async unblockDependents(completedTaskId: number): Promise<void> {
    const completedTask = await this.loadTask(completedTaskId);
    if (!completedTask) {
      return;
    }

    for (const dependentId of completedTask.blocks) {
      const dependent = await this.loadTask(dependentId);
      if (!dependent) {
        continue;
      }
      dependent.blockedBy = dependent.blockedBy.filter(
        (taskId) => taskId !== completedTaskId,
      );
      if (dependent.blockedBy.length === 0 && dependent.status === "blocked") {
        dependent.status = "pending";
      }
      await this.saveTask(dependent);
    }
  }

  async create(
    subject: string,
    description?: string,
    blockedBy?: number[],
  ): Promise<Task> {
    await this.whenReady();

    const deps = blockedBy ?? [];
    for (const depId of deps) {
      const depTask = await this.loadTask(depId);
      if (!depTask) {
        throw new Error(`Dependency task ${depId} not found`);
      }
    }

    const now = Date.now();
    const task: Task = {
      id: this.nextId++,
      subject,
      description: description ?? "",
      status: deps.length > 0 ? "blocked" : "pending",
      blockedBy: deps,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    };

    for (const depId of deps) {
      const dep = await this.loadTask(depId);
      if (!dep) {
        continue;
      }
      dep.blocks.push(task.id);
      await this.saveTask(dep);
    }

    await this.saveTask(task);
    return task;
  }

  async update(
    taskId: number,
    updates: Partial<Pick<Task, "status" | "owner" | "blockedBy" | "description">>,
  ): Promise<Task> {
    await this.whenReady();

    const task = await this.loadTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (updates.status !== undefined) {
      task.status = updates.status;
      if (updates.status === "completed") {
        await this.unblockDependents(taskId);
      }
    }

    if (updates.description !== undefined) {
      task.description = updates.description;
    }

    if (updates.owner !== undefined) {
      task.owner = updates.owner;
    }

    if (updates.blockedBy !== undefined) {
      const { added, removed } = diffTaskDependencies(task.blockedBy, updates.blockedBy)

      for (const depId of removed) {
        const dep = await this.loadTask(depId)
        if (dep) {
          dep.blocks = dep.blocks.filter(id => id !== taskId)
          await this.saveTask(dep)
        }
      }

      for (const depId of added) {
        const dep = await this.loadTask(depId)
        if (dep) {
          dep.blocks.push(taskId)
          await this.saveTask(dep)
        }
      }

      task.blockedBy = updates.blockedBy;
      task.status = updates.blockedBy.length > 0 ? "blocked" : "pending";
    }

    await this.saveTask(task);
    return task;
  }

  async get(taskId: number): Promise<Task | null> {
    await this.whenReady();
    return this.loadTask(taskId);
  }

  async listAll(): Promise<Task[]> {
    await this.whenReady();

    const tasks: Task[] = [];
    const files = await fs.readdir(this.tasksDir);
    for (const file of files) {
      const match = file.match(/^task_(\d+)\.json$/);
      if (!match) {
        continue;
      }
      const task = await this.loadTask(Number(match[1]));
      if (task) {
        tasks.push(task);
      }
    }
    tasks.sort((a, b) => a.id - b.id);
    return tasks;
  }

  async getReadyTasks(): Promise<Task[]> {
    const tasks = await this.listAll();
    return tasks.filter(
      (task) => task.status === "pending" && task.blockedBy.length === 0,
    );
  }

  async getBlockedTasks(): Promise<Task[]> {
    const tasks = await this.listAll();
    return tasks.filter((task) => task.status === "blocked");
  }

  async getInProgressTasks(): Promise<Task[]> {
    const tasks = await this.listAll();
    return tasks.filter((task) => task.status === "in_progress");
  }

  async delete(taskId: number): Promise<boolean> {
    await this.whenReady();

    const task = await this.loadTask(taskId);
    if (!task) {
      return false;
    }

    for (const dependentId of task.blocks) {
      const dependent = await this.loadTask(dependentId);
      if (!dependent) {
        continue;
      }
      dependent.blockedBy = dependent.blockedBy.filter((id) => id !== taskId);
      if (dependent.blockedBy.length === 0 && dependent.status === "blocked") {
        dependent.status = "pending";
      }
      await this.saveTask(dependent);
    }

    for (const depId of task.blockedBy) {
      const dep = await this.loadTask(depId)
      if (dep) {
        dep.blocks = dep.blocks.filter(id => id !== taskId)
        await this.saveTask(dep)
      }
    }

    try {
      await fs.unlink(this.getTaskPath(taskId));
      return true;
    } catch {
      return false;
    }
  }

  renderTasks(tasks: Task[]): string {
    if (tasks.length === 0) {
      return "No tasks available.";
    }

    return tasks
      .map((task) => {
        const statusEmoji = {
          pending: "⏳",
          in_progress: "🔨",
          completed: "✅",
          blocked: "🚫",
        }[task.status];
        const deps =
          task.blockedBy.length > 0
            ? ` (blocked by ${task.blockedBy.join(", ")})`
            : "";
        const owner = task.owner ? ` (@${task.owner})` : "";
        return `[${statusEmoji}] #${task.id}: ${task.subject}${deps}${owner}`;
      })
      .join("\n");
  }
}
