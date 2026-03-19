export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

export type BackgroundTaskStatus = "running" | "completed" | "failed";

export interface Task {
  id: number;
  subject: string;
  description: string;
  status: TaskStatus;
  owner?: string;
  worktree?: string;
  blockedBy: Array<number>;
  blocks: Array<number>;
  createdAt: number;
  updatedAt: number;
}

export interface TranscriptMetadata {
  timestamp: number;
  messageCount: number;
  summary?: string;
}

export interface BackgroundTask {
  id: string;
  command: string;
  cwd: string;
  status: BackgroundTaskStatus;
  startedAt: number;
  completedAt?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface BackgroundNotification {
  taskId: string;
  status: Exclude<BackgroundTaskStatus, "running">;
  command: string;
  message: string;
}
