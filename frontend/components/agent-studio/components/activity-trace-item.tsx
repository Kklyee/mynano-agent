"use client";

import { CheckCircle2Icon, CircleDashedIcon, LoaderCircleIcon } from "lucide-react";
import type { AgentBackgroundTask, AgentTask } from "@/types/agent-state";
import { cn } from "@/lib/utils";
import {
  normalizeTaskStatus,
  getTaskStatusLabel,
  getBackgroundTitle,
} from "@/utils/task-utils";

export function ActivityTraceItem({
  kind,
  task,
  backgroundTask,
}: {
  kind: "task" | "background";
  task?: AgentTask;
  backgroundTask?: AgentBackgroundTask;
}) {
  const activity = kind === "task" ? task : backgroundTask;
  if (!activity) return null;

  const normalizedStatus = normalizeTaskStatus(activity.status);
  const isRunning = normalizedStatus === "in_progress" || normalizedStatus === "running";
  const isCompleted = normalizedStatus === "completed" || normalizedStatus === "done";
  const isBlocked = normalizedStatus === "blocked";
  const title =
    kind === "task"
      ? task?.subject || `Task #${task?.taskId}`
      : getBackgroundTitle(backgroundTask!);
  const trailingId = kind === "task" ? `#${task?.taskId}` : backgroundTask?.taskId;

  return (
    <div
      className={cn(
        "flex min-w-[13rem] max-w-[28rem] items-center justify-between gap-3 rounded-md border border-border/40 bg-background/20 px-2.5 py-1.5",
        isRunning && "border-primary/20",
        isBlocked && "border-amber-500/20",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isRunning ? (
          <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : isCompleted ? (
          <CheckCircle2Icon className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <CircleDashedIcon className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="truncate text-xs font-medium text-foreground/90">{title}</span>
        <span className="text-[10px] text-muted-foreground">
          {getTaskStatusLabel(activity.status)}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground">{trailingId}</span>
    </div>
  );
}
