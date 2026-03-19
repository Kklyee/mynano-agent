import type { AgentBackgroundTask, AgentTask } from "@/types/agent-state";
import { TASK_STATUS_LABELS } from "@/constants/agent-studio";

export function normalizeTaskStatus(status: string) {
  return status.toLowerCase();
}

export function getTaskStatusLabel(status: string) {
  return TASK_STATUS_LABELS[normalizeTaskStatus(status)] ?? status;
}

export function taskStatusRank(status: string) {
  switch (normalizeTaskStatus(status)) {
    case "in_progress":
      return 0;
    case "blocked":
      return 1;
    case "pending":
      return 2;
    case "completed":
      return 3;
    default:
      return 4;
  }
}

export function backgroundStatusRank(status: string) {
  switch (normalizeTaskStatus(status)) {
    case "running":
    case "in_progress":
      return 0;
    case "failed":
      return 1;
    case "completed":
      return 2;
    default:
      return 3;
  }
}

export function sortTasksForDisplay(tasks: AgentTask[]) {
  return [...tasks].sort((left, right) => {
    const rankDiff = taskStatusRank(left.status) - taskStatusRank(right.status);
    if (rankDiff !== 0) return rankDiff;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function sortBackgroundTasksForDisplay(tasks: AgentBackgroundTask[]) {
  return [...tasks].sort((left, right) => {
    const rankDiff = backgroundStatusRank(left.status) - backgroundStatusRank(right.status);
    if (rankDiff !== 0) return rankDiff;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function getBackgroundTitle(task: AgentBackgroundTask) {
  return task.summary || task.command || `后台任务 ${task.taskId}`;
}
