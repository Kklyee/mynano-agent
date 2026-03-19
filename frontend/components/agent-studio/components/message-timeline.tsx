"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  BotIcon,
  ListTodoIcon,
  MessageSquareIcon,
  TerminalIcon,
} from "lucide-react";
import type {
  AgentBackgroundTask,
  AgentTask,
  AgentTransportMessage,
  AgentTransportTool,
} from "@/types/agent-state";
import { cn } from "@/lib/utils";
import { StreamdownText } from "./streamdown-text";
import { ToolCallItem } from "./tool-call-item";
import { ActivityTraceItem } from "./activity-trace-item";
import { buildToolGroups, getToolTimestamp } from "@/utils/tool-utils";
import { TOOL_PREVIEW_LIMIT } from "@/constants/agent-studio";
import type { TimelineItem } from "@/types/agent-studio";

export function buildTimeline(
  messages: AgentTransportMessage[],
  tools: AgentTransportTool[],
  tasks: AgentTask[],
  backgroundTasks: AgentBackgroundTask[],
): TimelineItem[] {
  const visibleToolGroups = buildToolGroups(tools).slice(0, TOOL_PREVIEW_LIMIT);

  return [
    ...messages.map<TimelineItem>((message, index) => ({
      id: message.id,
      kind: "message",
      timestamp: message.createdAt,
      sequence: message.sequence ?? index,
      message,
    })),
    ...visibleToolGroups.map<TimelineItem>((group, index) => ({
      id: `tool-group-${group.key}`,
      kind: "tool",
      timestamp: getToolTimestamp(group.latestTool),
      sequence: group.latestTool.sequence ?? messages.length + index,
      tool: group.latestTool,
      toolGroup: group,
    })),
    ...tasks.map<TimelineItem>((task, index) => ({
      id: `task-${task.taskId}`,
      kind: "task",
      timestamp: task.updatedAt,
      sequence: task.sequence ?? messages.length + visibleToolGroups.length + index,
      task,
    })),
    ...backgroundTasks.map<TimelineItem>((backgroundTask, index) => ({
      id: `background-${backgroundTask.taskId}`,
      kind: "background",
      timestamp: backgroundTask.updatedAt,
      sequence:
        backgroundTask.sequence ??
        messages.length + visibleToolGroups.length + tasks.length + index,
      backgroundTask,
    })),
  ].sort((left, right) => {
    const sequenceDiff = left.sequence - right.sequence;
    if (sequenceDiff !== 0) return sequenceDiff;
    return new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();
  });
}

export function shouldShowTimelineActivityIndicator(
  latestItem: TimelineItem | undefined,
  isRunning: boolean,
) {
  if (!isRunning || !latestItem) return false;
  if (latestItem.kind === "tool") return true;
  if (latestItem.kind === "task") return true;
  if (latestItem.kind === "background") return true;
  if (latestItem.message.role === "user") return true;
  return latestItem.message.status === "running" || !latestItem.message.text;
}

function InlineLoadingState() {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/80 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/80 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/80 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export function TimelineActivityIndicator() {
  return (
    <div className="mx-auto mt-4 max-w-3xl px-4 pb-2">
      <div className="ml-[2.75rem]">
        <InlineLoadingState />
      </div>
    </div>
  );
}

export function TimelineItemRow({
  item,
  isLast,
  isRunning,
}: {
  item: TimelineItem;
  isLast: boolean;
  isRunning: boolean;
}) {
  const isMessage = item.kind === "message";
  const isAssistant = isMessage && item.message.role === "assistant";
  const isTool = item.kind === "tool";
  const isTask = item.kind === "task";
  const isBackground = item.kind === "background";
  const isUser = isMessage && item.message.role === "user";
  const message = isMessage ? item.message : null;
  const tool = isTool ? item.tool : null;
  const toolGroup = isTool ? item.toolGroup : null;
  const task = isTask ? item.task : null;
  const backgroundTask = isBackground ? item.backgroundTask : null;
  const isActiveAssistant =
    isAssistant && isLast && isRunning && (message?.status === "running" || !message?.text);

  if (isAssistant && !message?.text) {
    return null;
  }

  return (
    <div>
      <div
        className={cn(
          "mx-auto max-w-3xl px-4",
          isTool || isTask || isBackground ? "py-1" : "py-6",
        )}
      >
        <div
          className={cn(
            "flex",
            isTool || isTask || isBackground
              ? "items-start gap-3"
              : isUser
                ? "justify-end"
                : "gap-4",
          )}
        >
          {isTool ? null : isTask ? (
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pink-500/12 text-pink-400">
              <ListTodoIcon className="h-3.5 w-3.5" />
            </div>
          ) : isBackground ? (
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/12 text-sky-400">
              <TerminalIcon className="h-3.5 w-3.5" />
            </div>
          ) : !isUser ? (
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback
                className={cn(
                  isAssistant && "bg-primary text-primary-foreground",
                  !isAssistant && "bg-accent text-accent-foreground",
                )}
              >
                {isAssistant ? (
                  <BotIcon className="h-4 w-4" />
                ) : (
                  <MessageSquareIcon className="h-4 w-4" />
                )}
              </AvatarFallback>
            </Avatar>
          ) : null}

          <div
            className={cn(
              "min-w-0",
              isTool || isTask || isBackground
                ? "w-fit max-w-[32rem]"
                : isUser
                  ? "max-w-[40rem]"
                  : "flex-1",
            )}
          >
            {isUser ? (
              <div className="max-w-none">
                <div className="inline-flex max-w-[40rem] rounded-2xl bg-accent px-4 py-3 text-accent-foreground shadow-sm">
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                    {message?.text}
                  </p>
                </div>
              </div>
            ) : null}

            {isAssistant && (
              <div className="prose prose-invert max-w-none pt-0.5">
                {message?.text ? (
                  <StreamdownText text={message.text} isAnimating={isActiveAssistant} />
                ) : null}
              </div>
            )}

            {isTool && tool && toolGroup && <ToolCallItem tool={tool} group={toolGroup} />}
            {isTask && task && <ActivityTraceItem kind="task" task={task} />}
            {isBackground && backgroundTask && (
              <ActivityTraceItem kind="background" backgroundTask={backgroundTask} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MessageTimeline({
  timeline,
  isRunning,
}: {
  timeline: TimelineItem[];
  isRunning: boolean;
}) {
  const latestItem = timeline.at(-1);
  const showActivityIndicator = shouldShowTimelineActivityIndicator(latestItem, isRunning);

  return (
    <>
      {timeline.map((item, index) => (
        <TimelineItemRow
          key={item.id}
          item={item}
          isLast={index === timeline.length - 1}
          isRunning={isRunning}
        />
      ))}
      {showActivityIndicator && <TimelineActivityIndicator />}
    </>
  );
}
