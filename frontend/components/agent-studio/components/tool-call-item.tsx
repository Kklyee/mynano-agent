"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { AgentTransportTool } from "@/types/agent-state";
import { cn } from "@/lib/utils";
import { formatToolInvocation, getToolTimestamp } from "@/utils/tool-utils";
import type { ToolGroup } from "@/types/agent-studio";

export function ToolCallItem({
  tool,
  group,
}: {
  tool: AgentTransportTool;
  group: ToolGroup;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = tool.status === "running";
  const GroupIcon = group.icon;

  return (
    <div className="tool-flow-group w-full max-w-[30rem]">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "tool-group-trigger flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent/10",
          isRunning && "border-primary/30 bg-primary/5",
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
            group.iconClassName,
          )}
        >
          <GroupIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/70">
              {group.label}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
                isRunning ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/70",
              )}
            >
              {isRunning ? "运行中" : "已完成"}
            </span>
          </div>
          <div className="mt-1 truncate text-sm font-medium text-foreground">
            {group.label} 工具调用
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            最近一次: {formatToolInvocation(tool)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground/70">
          <span>{group.tools.length} 次</span>
          {isOpen ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </div>
      </button>

      {isOpen &&
        group.tools.map((entry, idx) => (
          <div
            key={entry.id}
            className={cn(
              "tool-entry-reply rounded-2xl border border-border/35 bg-muted/35 px-4 py-3 shadow-sm",
              idx === 0 ? "mt-4" : "mt-3",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {formatToolInvocation(entry)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground/80">
                  {new Date(getToolTimestamp(entry)).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none",
                  entry.status === "running"
                    ? "bg-primary/15 text-primary"
                    : "bg-background text-muted-foreground/70",
                )}
              >
                {entry.status === "running" ? "运行中" : "已完成"}
              </span>
            </div>
            {Boolean(entry.args) && (
              <pre className="mt-3 overflow-auto rounded-xl bg-background/80 px-3 py-2 text-[10px] text-muted-foreground">
                {JSON.stringify(entry.args, null, 2)}
              </pre>
            )}
          </div>
        ))}
    </div>
  );
}
