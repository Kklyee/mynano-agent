"use client";

import { CheckCircle2Icon, CircleDashedIcon, LoaderCircleIcon } from "lucide-react";
import type { AgentBackgroundTask, AgentTask } from "@/types/agent-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { normalizeTaskStatus, getTaskStatusLabel, getBackgroundTitle } from "@/utils/task-utils";

export function TaskSummaryCard({
  task,
  compact = false,
}: {
  task: AgentTask;
  compact?: boolean;
}) {
  const status = normalizeTaskStatus(task.status);

  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/40 px-3 py-2",
        status === "in_progress" && "border-primary/30 bg-primary/5",
        status === "blocked" && "border-amber-500/20 bg-amber-500/5",
        status === "completed" && "border-emerald-500/20 bg-emerald-500/5",
      )}
    >
      <div className="flex items-start gap-2">
        {status === "in_progress" ? (
          <LoaderCircleIcon className="mt-0.5 h-3.5 w-3.5 animate-spin text-primary" />
        ) : status === "completed" ? (
          <CheckCircle2Icon className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
        ) : status === "blocked" ? (
          <CircleDashedIcon className="mt-0.5 h-3.5 w-3.5 text-amber-500" />
        ) : (
          <CircleDashedIcon className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-xs font-medium text-foreground">
              {task.subject || `任务 #${task.taskId}`}
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {getTaskStatusLabel(task.status)}
            </Badge>
          </div>
          {!compact && task.description && (
            <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
              {task.description}
            </div>
          )}
          {!compact && Boolean(task.blockedBy?.length) && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              等待 #{task.blockedBy?.join(", #")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BackgroundSummaryCard({ task }: { task: AgentBackgroundTask }) {
  const status = normalizeTaskStatus(task.status);

  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/40 px-3 py-2",
        status === "running" && "border-primary/30 bg-primary/5",
        status === "failed" && "border-destructive/20 bg-destructive/5",
      )}
    >
      <div className="flex items-start gap-2">
        {status === "running" ? (
          <LoaderCircleIcon className="mt-0.5 h-3.5 w-3.5 animate-spin text-primary" />
        ) : status === "completed" ? (
          <CheckCircle2Icon className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <CircleDashedIcon className="mt-0.5 h-3.5 w-3.5 text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-xs font-medium text-foreground">
              {getBackgroundTitle(task)}
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {getTaskStatusLabel(task.status)}
            </Badge>
          </div>
          <div className="mt-1 truncate text-[10px] text-muted-foreground">
            {task.command || task.taskId}
          </div>
        </div>
      </div>
    </div>
  );
}
