"use client";

import { Thread } from "./thread";
import type { AgentTransportState } from "@/types/agent-state";
import {
  createEmptyAgentTransportState,
  type AgentTransportState as TransportState,
} from "@/types/agent-state";
import { useAssistantState } from "@assistant-ui/react";
import {
  CheckCheckIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  WrenchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

const EMPTY_TRANSPORT_STATE = createEmptyAgentTransportState();
const HIDDEN_TOOL_NAMES = new Set([
  "task_create",
  "task_update",
  "task_list",
  "task_get",
]);

const statusTone: Record<AgentTransportState["session"]["status"], string> = {
  idle: "bg-slate-100 text-slate-600",
  connecting: "bg-sky-100 text-sky-700",
  running: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-zinc-100 text-zinc-700",
  failed: "bg-rose-100 text-rose-700",
};

const normalizeTaskStatus = (status: string) => {
  switch (status.toLowerCase()) {
    case "created":
      return "pending";
    default:
      return status.toLowerCase();
  }
};

const isTaskRunning = (status: string) => normalizeTaskStatus(status) === "in_progress";

const getTaskStatusIcon = (status: string) => {
  const normalized = normalizeTaskStatus(status);

  if (normalized === "blocked") {
    return <CircleAlertIcon className="size-4 text-rose-500" />;
  }

  if (normalized === "in_progress") {
    return <LoaderCircleIcon className="size-4 animate-spin text-sky-600" />;
  }

  if (normalized === "pending") {
    return <CircleDashedIcon className="size-4 text-slate-400" />;
  }

  return <CheckCheckIcon className="size-4 text-emerald-600" />;
};

export function AgentWorkspace() {
  return <AgentWorkspaceContent />;
}

function AgentWorkspaceContent() {
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const state = useAssistantState((auiState) => {
    const extras = auiState.thread.extras as
      | { state?: TransportState }
      | undefined;
    return extras?.state ?? EMPTY_TRANSPORT_STATE;
  }) as AgentTransportState;
  const visibleTools = state.tools.filter((tool) => !HIDDEN_TOOL_NAMES.has(tool.name));

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background p-4 md:p-6">
      <div className={cn(
        "mx-auto flex h-full min-h-0 max-w-7xl gap-5",
        isLeftPanelOpen && "xl:grid xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]"
      )}>
        <section
          className={cn(
            "relative h-full min-h-0 overflow-hidden rounded-[28px] border border-border bg-card shadow-lg transition-all duration-300",
            isLeftPanelOpen ? "flex-1" : "w-0 opacity-0"
          )}
        >
          {/* Collapse Button - Top Right of Left Panel */}
          <div className="absolute top-3 right-3 z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
              className="h-8 w-8 bg-background/80 backdrop-blur hover:bg-accent"
            >
              <PanelLeftCloseIcon className="h-4 w-4" />
            </Button>
          </div>
          <Thread />
        </section>
        <aside className={cn(
          "flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1 transition-all duration-300",
          isLeftPanelOpen ? "" : "flex-1"
        )}>
          {/* Collapsed Panel - Show Open Button */}
          {!isLeftPanelOpen && (
            <div className="flex items-center justify-start">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsLeftPanelOpen(true)}
                className="h-8 w-8"
              >
                <PanelLeftOpenIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Panel title="运行状态">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusTone[state.session.status]} ${state.session.status === "running" ? "animate-pulse" : ""}`}
              >
                {state.session.status}
              </span>
              <InfoRow label="Thread" value={state.session.threadId ?? "新线程"} />
              <InfoRow label="Session" value={state.session.sessionId ?? "等待启动"} />
            </div>
            <InfoRow label="Last Event" value={state.session.lastEventType ?? "-"} />
            <InfoRow label="Steps" value={String(state.session.steps ?? 0)} />
            <InfoRow
              label="Error"
              value={state.session.error ?? "无"}
              className={state.session.error ? "text-rose-600" : "text-slate-500"}
            />
          </Panel>

          <Panel title={`工具执行 (${visibleTools.length})`}>
            {visibleTools.length === 0 ? (
              <EmptyState text="还没有需要展示的工具调用事件。task 管理类工具已折叠到任务面板里。" />
            ) : (
              <div className="space-y-2">
                {visibleTools.map((tool) => (
                  <div
                    key={tool.id}
                    className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 duration-300"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {tool.status === "running" ? (
                          <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-sky-600" />
                        ) : (
                          <WrenchIcon className="size-4 shrink-0 text-slate-500" />
                        )}
                        <div className="truncate text-sm font-medium text-slate-900">
                          {tool.name}
                        </div>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">
                        {tool.status}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      这里只展示工具调用摘要，不展开参数和输出。
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title={`任务面板 (${state.tasks.length})`}>
            {state.tasks.length === 0 ? (
              <EmptyState text="任务事件会聚合到这里，适合后续接 plan tree 或审批流程。" />
            ) : (
              <div className="space-y-2">
                {state.tasks.map((task) => {
                  const normalizedStatus = normalizeTaskStatus(task.status);

                  return (
                    <div
                      key={task.taskId}
                      className={`animate-in fade-in slide-in-from-bottom-2 flex items-center justify-between rounded-2xl border px-3 py-3 duration-300 ${isTaskRunning(task.status)
                          ? "border-sky-200 bg-sky-50/60"
                          : "border-slate-200 bg-white"
                        }`}
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="pt-0.5">{getTaskStatusIcon(task.status)}</div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900">#{task.taskId}</div>
                          <div className="truncate text-xs text-slate-500">
                            {task.subject ?? "未提供 subject"}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`rounded-full px-2.5 py-1 text-xs ${isTaskRunning(task.status)
                            ? "bg-white text-sky-700"
                            : normalizedStatus === "blocked"
                              ? "bg-rose-50 text-rose-600"
                              : normalizedStatus === "completed"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                      >
                        {normalizedStatus}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title={`后台任务 (${state.backgroundTasks.length})`}>
            {state.backgroundTasks.length === 0 ? (
              <EmptyState text="后台通知会在这里显示，适合后续接 subagent、长任务或人工审批状态。" />
            ) : (
              <div className="space-y-2">
                {state.backgroundTasks.map((task) => (
                  <div
                    key={task.taskId}
                    className="animate-in fade-in slide-in-from-bottom-2 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 duration-300"
                  >
                    <div className="truncate text-sm font-medium text-slate-900">
                      {task.taskId}
                    </div>
                    <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {task.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: Readonly<{
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="rounded-[28px] border border-border bg-card p-4 shadow-lg md:p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {title}
        </h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
  className,
}: Readonly<{
  label: string;
  value: string;
  className?: string;
}>) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={className ?? "text-slate-900"}>{value}</span>
    </div>
  );
}

function EmptyState({ text }: Readonly<{ text: string }>) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-500">
      {text}
    </div>
  );
}
