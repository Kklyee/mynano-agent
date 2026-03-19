"use client";

import { ChevronDownIcon, PanelRightCloseIcon, TerminalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { AgentBackgroundTask, AgentTask } from "@/types/agent-state";
import type { ToolGroup } from "@/types/agent-studio";
import { formatToolInvocation, getToolTimestamp } from "@/utils/tool-utils";
import { TaskSummaryCard, BackgroundSummaryCard } from "./task-cards";

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

export function RightDebugPanel({
  activeTasks,
  completedTasks,
  eventLog,
  session,
  setOpen,
  sortedBackgroundTasks,
  toolGroups,
  totalToolCount,
  visibleToolGroups,
}: {
  activeTasks: AgentTask[];
  completedTasks: AgentTask[];
  eventLog: Array<{ id: string; type: string; summary: string }>;
  session: {
    sessionId?: string | null;
    threadId?: string | null;
    status: string;
    steps: number;
  };
  setOpen: (open: boolean) => void;
  sortedBackgroundTasks: AgentBackgroundTask[];
  toolGroups: ToolGroup[];
  totalToolCount: number;
  visibleToolGroups: ToolGroup[];
}) {
  return (
    <>
      {/* Panel Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Debug Panel</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setOpen(false)}
        >
          <PanelRightCloseIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Debug Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Session Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Session
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={session.status === "running" ? "default" : "secondary"}>
                  {session.status}
                </Badge>
              </div>
              <DebugItem label="Session ID" value={session.sessionId ?? "—"} />
              <DebugItem label="Conversation ID" value={session.threadId ?? "—"} />
              <DebugItem label="Steps" value={String(session.steps)} />
            </CardContent>
          </Card>

          {/* Tools */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tools ({totalToolCount})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {toolGroups.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">暂无工具调用</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {visibleToolGroups.map((group) => {
                      const GroupIcon = group.icon;
                      const latestTool = group.latestTool;
                      const isRunning = latestTool.status === "running";
                      return (
                        <div key={group.key} className="rounded-xl border bg-muted/30 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                                group.iconClassName,
                              )}
                            >
                              <GroupIcon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                  {group.label}
                                </span>
                                <Badge
                                  className="h-5 rounded-full px-1.5 text-[10px]"
                                  variant="outline"
                                >
                                  {group.tools.length}
                                </Badge>
                              </div>
                              <div className="truncate text-xs font-medium text-foreground/90">
                                {formatToolInvocation(latestTool)}
                              </div>
                            </div>
                            <Badge
                              variant={isRunning ? "default" : "outline"}
                              className="text-[10px]"
                            >
                              {isRunning ? "运行中" : "已完成"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="w-full justify-between px-2 text-xs text-muted-foreground"
                      >
                        <span>展开工具调用流</span>
                        <ChevronDownIcon className="h-3.5 w-3.5" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-1">
                      {toolGroups.map((group) => {
                        const GroupIcon = group.icon;
                        return (
                          <div
                            key={group.key}
                            className="space-y-2 rounded-xl border bg-background/40 p-3"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                                  group.iconClassName,
                                )}
                              >
                                <GroupIcon className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-foreground">
                                  {group.label}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  最近 {group.tools.length} 次调用
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {[...group.tools].reverse().map((tool) => (
                                <div
                                  key={tool.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-2.5 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-medium text-foreground/90">
                                      {formatToolInvocation(tool)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                      {new Date(getToolTimestamp(tool)).toLocaleTimeString(
                                        "zh-CN",
                                        {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          second: "2-digit",
                                        },
                                      )}
                                    </div>
                                  </div>
                                  <Badge
                                    variant={tool.status === "running" ? "default" : "outline"}
                                    className="text-[10px]"
                                  >
                                    {tool.status === "running" ? "运行中" : "已完成"}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tasks ({activeTasks.length + completedTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeTasks.length === 0 && completedTasks.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">
                  Agent 还没有拆出明确任务
                </p>
              ) : (
                <>
                  {activeTasks.length > 0 && (
                    <div className="space-y-2">
                      {activeTasks.map((task) => (
                        <TaskSummaryCard key={task.taskId} task={task} />
                      ))}
                    </div>
                  )}
                  {completedTasks.length > 0 && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-between px-2 text-xs text-muted-foreground"
                        >
                          <span>已完成任务 ({completedTasks.length})</span>
                          <ChevronDownIcon className="h-3.5 w-3.5" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-2 pt-2">
                        {completedTasks.map((task) => (
                          <TaskSummaryCard key={task.taskId} task={task} compact />
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Background Tasks */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Background ({sortedBackgroundTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sortedBackgroundTasks.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">暂无后台任务</p>
              ) : (
                sortedBackgroundTasks.map((task) => (
                  <BackgroundSummaryCard key={task.taskId} task={task} />
                ))
              )}
            </CardContent>
          </Card>

          {/* Events */}
          {eventLog.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Events ({eventLog.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[200px] space-y-1 overflow-y-auto">
                {eventLog
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((item) => (
                    <div key={item.id} className="text-[10px]">
                      <Badge variant="secondary" className="mr-2">
                        {item.type}
                      </Badge>
                      <span className="text-muted-foreground">{item.summary}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
