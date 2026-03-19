"use client";

import { useChat } from "@/api/hooks/use-chat";
import {
  ArrowUpIcon,
  BotIcon,
  CheckIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  DatabaseIcon,
  Edit3Icon,
  FileCode2Icon,
  FolderSearch2Icon,
  GitBranchIcon,
  GlobeIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MonitorIcon,
  type LucideIcon,
  MenuIcon,
  MessageSquareIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  StarIcon,
  SunIcon,
  SquareIcon,
  TerminalIcon,
  Trash2Icon,
  UserIcon,
  ListTodoIcon,
  WrenchIcon,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { StreamdownText } from "./components/streamdown-text";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AgentBackgroundTask,
  AgentTask,
  AgentTransportTool,
  AgentTransportMessage,
} from "@/types/agent-state";
import { useSettings, type ModelConfig } from "@/providers/settings-provider";
import { useTheme } from "@/providers/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

const suggestions = [
  "帮我拆一个前端重构计划",
  "总结这个 agent 的能力边界",
  "给我一个调研任务的执行步骤",
  "分析一下当前代码架构",
];

const MODEL_PROVIDER_PRESETS = [
  { id: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic", baseURL: "https://api.anthropic.com/v1" },
  {
    id: "google",
    name: "Google AI",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
  },
  { id: "ollama", name: "Ollama", baseURL: "http://localhost:11434/v1" },
  { id: "custom", name: "自定义", baseURL: "" },
];

export function AgentStudio({
  isSigningOut = false,
  onSignOut,
  user,
}: {
  isSigningOut?: boolean;
  onSignOut?: () => void;
  user?: {
    email: string;
    name?: string | null;
  };
}) {
  const {
    apiBaseUrl,
    cancelRun,
    conversations,
    healthQuery,
    isConversationListLoading,
    isRunning,
    resetWorkspace,
    sendPrompt,
    selectConversation,
    state,
  } = useChat();
  const [prompt, setPrompt] = useState("");
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const timeline = buildTimeline(state.messages, state.tools, state.tasks, state.backgroundTasks);

  useEffect(() => {
    viewportRef.current?.scrollTo({
      top: viewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state.eventLog.at(-1)?.id]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    sendPrompt(prompt);
    setPrompt("");
  };

  const getHealthStatus = () => {
    if (healthQuery.isError) return { label: "Offline", variant: "destructive" as const };
    if (healthQuery.isFetching) return { label: "Checking", variant: "secondary" as const };
    return { label: "Ready", variant: "default" as const };
  };

  const health = getHealthStatus();

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-background">
        {/* Left Sidebar - Chat History */}
        <aside
          className={`hidden flex-col border-r bg-card transition-all duration-300 lg:flex ${leftSidebarOpen ? "w-[260px]" : "w-0 overflow-hidden opacity-0"
            }`}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between gap-2 border-b p-3">
            <Button
              variant="ghost"
              className="flex-1 justify-start gap-2"
              onClick={resetWorkspace}
            >
              <PlusIcon className="h-4 w-4" />
              新对话
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setLeftSidebarOpen(false)}
            >
              <PanelLeftCloseIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Chat List */}
          <ScrollArea className="flex-1 p-2">
            {isConversationListLoading ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                正在加载会话
              </div>
            ) : conversations.length > 0 ? (
              <div className="space-y-1">
                {conversations.map((conversation) => (
                  <Button
                    key={conversation.id}
                    variant={
                      state.session.threadId === conversation.id ? "secondary" : "ghost"
                    }
                    className="w-full justify-start text-left"
                    onClick={() => void selectConversation(conversation.id)}
                  >
                    <div className="min-w-0 truncate">
                      <div className="truncate font-medium">{conversation.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {conversation.lastMessageAt
                          ? new Date(conversation.lastMessageAt).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                          : "暂无消息"}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                暂无历史对话
              </div>
            )}
          </ScrollArea>

          {/* Sidebar Footer */}
          <div className="space-y-3 border-t p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={`h-2 w-2 rounded-full ${health.variant === "default"
                  ? "bg-green-500"
                  : health.variant === "destructive"
                    ? "bg-red-500"
                    : "bg-yellow-500"
                  }`}
              />
              <span>Backend {health.label}</span>
            </div>
            {user && (
              <div className="rounded-2xl border bg-background/70 p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/12 text-primary">
                      {getUserInitials(user)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {user.name?.trim() || "未命名用户"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    className="justify-start gap-2"
                    onClick={() => setIsProfileOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    <UserIcon className="h-4 w-4" />
                    Profile
                  </Button>
                  <Button
                    className="justify-start gap-2"
                    onClick={() => setIsSettingsOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Settings2Icon className="h-4 w-4" />
                    Settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Top Navigation */}
          <header className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              {/* Show Sidebar Button - When sidebar is collapsed */}
              {!leftSidebarOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex"
                  onClick={() => setLeftSidebarOpen(true)}
                >
                  <PanelLeftOpenIcon className="h-5 w-5" />
                </Button>
              )}
              {/* Mobile Menu */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <MenuIcon className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[260px] p-0">
                  <SheetHeader className="p-4">
                    <SheetTitle>对话历史</SheetTitle>
                  </SheetHeader>
                  <Separator />
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2"
                      onClick={resetWorkspace}
                    >
                      <PlusIcon className="h-4 w-4" />
                      新对话
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <h1 className="text-sm font-semibold">Agent Studio</h1>
            </div>

            <div className="flex items-center gap-1">
              {user && (
                <>
                  <div className="hidden items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground md:flex">
                    <span className="font-medium text-foreground">
                      {user.name?.trim() || user.email}
                    </span>
                    <span className="text-muted-foreground/70">{user.email}</span>
                  </div>
                  {onSignOut && (
                    <Button
                      className="gap-2"
                      disabled={isSigningOut}
                      onClick={onSignOut}
                      size="sm"
                      variant="ghost"
                    >
                      {isSigningOut ? (
                        <LoaderCircleIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOutIcon className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">退出</span>
                    </Button>
                  )}
                </>
              )}
              {!rightPanelOpen && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRightPanelOpen(true)}
                      className="hidden lg:flex"
                    >
                      <PanelRightOpenIcon className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>打开 Debug Panel</TooltipContent>
                </Tooltip>
              )}
            </div>
          </header>

          {/* Messages Area - Scrollable */}
          <div className="relative flex min-h-0 flex-1 h-full flex-col overflow-hidden">
            <ScrollArea className="h-full w-full " viewportRef={viewportRef}>
              <div className="mx-auto max-w-4xl">
                {state.messages.length === 0 ? (
                  <EmptyState onSuggestionClick={setPrompt} />
                ) : (
                  <MessageTimeline timeline={timeline} isRunning={isRunning} />
                )}
                {/* Spacer at bottom of scroll area */}
              </div>
            </ScrollArea>
          </div>

          {/* Input Area - Fixed at bottom */}
          <div className="shrink-0 border-t bg-background">
            <div className="mx-auto max-w-3xl px-4 py-4">
              {/* Suggestions */}
              {state.messages.length === 0 && (
                <div className="mb-4 flex flex-wrap justify-center gap-2">
                  {suggestions.map((item) => (
                    <Button
                      key={item}
                      variant="outline"
                      size="sm"
                      onClick={() => setPrompt(item)}
                      className="rounded-full"
                    >
                      {item}
                    </Button>
                  ))}
                </div>
              )}

              {/* Input Form */}
              <form onSubmit={handleSubmit}>
                <div className="relative flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-lg">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                      >
                        <PlusIcon className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>添加工具</TooltipContent>
                  </Tooltip>

                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="输入消息..."
                    className="min-h-[24px] flex-1 resize-none border-0 bg-transparent py-2 shadow-none focus-visible:ring-0"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (prompt.trim()) {
                          handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
                        }
                      }
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                    }}
                  />

                  <div className="flex items-center gap-1">
                    {isRunning ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={cancelRun}
                        className="h-8 w-8"
                      >
                        <SquareIcon className="h-4 w-4 fill-current" />
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!prompt.trim()}
                        className="h-8 w-8"
                      >
                        <ArrowUpIcon className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>

                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Agent 可能会生成不准确的信息，请验证重要信息。
                </p>
              </form>
            </div>
          </div>
        </main>

        {/* Right Panel - Debug Info */}
        <aside
          className={cn(
            "hidden flex-col border-l bg-card transition-all duration-300 ease-in-out lg:flex",
            rightPanelOpen ? "w-[320px] opacity-100" : "w-0 overflow-hidden opacity-0"
          )}
        >
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
              onClick={() => setRightPanelOpen(false)}
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
                    <Badge variant={state.session.status === "running" ? "default" : "secondary"}>
                      {state.session.status}
                    </Badge>
                  </div>
                  <DebugItem label="Session ID" value={state.session.sessionId ?? "—"} />
                  <DebugItem label="Conversation ID" value={state.session.threadId ?? "—"} />
                  <DebugItem label="Steps" value={String(state.session.steps)} />
                </CardContent>
              </Card>

              {/* Tools */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tools ({state.tools.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {state.tools.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground">
                      暂无工具调用
                    </p>
                  ) : (
                    state.tools.map((tool) => (
                      <div
                        key={tool.id}
                        className="flex items-center gap-2 rounded-lg bg-muted p-2"
                      >
                        {tool.status === "running" ? (
                          <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin text-primary" />
                        ) : (
                          <WrenchIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate text-xs">{tool.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {tool.status}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Tasks */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Tasks ({state.tasks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {state.tasks.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground">暂无任务</p>
                  ) : (
                    state.tasks.map((task) => (
                      <div
                        key={task.taskId}
                        className="flex items-center gap-2 rounded-lg bg-muted p-2"
                      >
                        {task.status === "in_progress" ? (
                          <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin text-primary" />
                        ) : task.status === "completed" ? (
                          <CheckCircle2Icon className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <CircleDashedIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-xs">#{task.taskId}</div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {task.subject}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Events */}
              {state.eventLog.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Events ({state.eventLog.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[200px] space-y-1 overflow-y-auto">
                    {state.eventLog
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
        </aside>

        <ProfileDialog
          isSigningOut={isSigningOut}
          onOpenChange={setIsProfileOpen}
          onSignOut={onSignOut}
          open={isProfileOpen}
          user={user}
        />
        <SettingsDialog
          apiBaseUrl={apiBaseUrl}
          onOpenChange={setIsSettingsOpen}
          onResetWorkspace={resetWorkspace}
          open={isSettingsOpen}
        />
      </div>
    </TooltipProvider>
  );
}

// Empty State Component
function EmptyState({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col  items-center justify-center px-4 py-20">

      <h2 className="mb-2 text-2xl font-semibold">有什么可以帮你的？</h2>
      <p className="mb-8 max-w-md text-center text-sm text-muted-foreground">
        我是一个 AI Agent，可以通过工具调用和任务规划来帮助你完成复杂的任务。
      </p>
    </div>
  );
}

type TimelineItem =
  | {
    id: string;
    kind: "message";
    timestamp: string;
    sequence: number;
    message: AgentTransportMessage;
  }
  | {
    id: string;
    kind: "tool";
    timestamp: string;
    sequence: number;
    tool: AgentTransportTool;
  }
  | {
    id: string;
    kind: "task";
    timestamp: string;
    sequence: number;
    task: AgentTask;
  }
  | {
    id: string;
    kind: "background";
    timestamp: string;
    sequence: number;
    backgroundTask: AgentBackgroundTask;
  };

function getToolVisual(name: string): {
  icon: LucideIcon;
  iconClassName: string;
} {
  const normalized = name.toLowerCase();

  if (
    normalized.includes("bash") ||
    normalized.includes("shell") ||
    normalized.includes("command") ||
    normalized.includes("terminal")
  ) {
    return {
      icon: TerminalIcon,
      iconClassName: "bg-sky-500/12 text-sky-400",
    };
  }

  if (
    normalized.includes("search") ||
    normalized.includes("find") ||
    normalized.includes("grep") ||
    normalized.includes("query")
  ) {
    return {
      icon: SearchIcon,
      iconClassName: "bg-violet-500/12 text-violet-400",
    };
  }

  if (
    normalized.includes("file") ||
    normalized.includes("read") ||
    normalized.includes("write") ||
    normalized.includes("edit")
  ) {
    return {
      icon: FileCode2Icon,
      iconClassName: "bg-emerald-500/12 text-emerald-400",
    };
  }

  if (
    normalized.includes("web") ||
    normalized.includes("fetch") ||
    normalized.includes("http") ||
    normalized.includes("url")
  ) {
    return {
      icon: GlobeIcon,
      iconClassName: "bg-cyan-500/12 text-cyan-400",
    };
  }

  if (
    normalized.includes("git") ||
    normalized.includes("branch") ||
    normalized.includes("commit")
  ) {
    return {
      icon: GitBranchIcon,
      iconClassName: "bg-orange-500/12 text-orange-400",
    };
  }

  if (
    normalized.includes("npm") ||
    normalized.includes("pnpm") ||
    normalized.includes("yarn") ||
    normalized.includes("bun")
  ) {
    return {
      icon: PackageIcon,
      iconClassName: "bg-amber-500/12 text-amber-400",
    };
  }

  if (
    normalized.includes("task") ||
    normalized.includes("todo") ||
    normalized.includes("plan")
  ) {
    return {
      icon: ListTodoIcon,
      iconClassName: "bg-pink-500/12 text-pink-400",
    };
  }

  if (
    normalized.includes("database") ||
    normalized.includes("sql") ||
    normalized.includes("query_db")
  ) {
    return {
      icon: DatabaseIcon,
      iconClassName: "bg-indigo-500/12 text-indigo-400",
    };
  }

  if (normalized.includes("folder") || normalized.includes("dir")) {
    return {
      icon: FolderSearch2Icon,
      iconClassName: "bg-teal-500/12 text-teal-400",
    };
  }

  return {
    icon: WrenchIcon,
    iconClassName: "bg-muted text-muted-foreground",
  };
}

function buildTimeline(
  messages: AgentTransportMessage[],
  tools: AgentTransportTool[],
  tasks: AgentTask[],
  backgroundTasks: AgentBackgroundTask[],
) {
  return [
    ...messages.map<TimelineItem>((message, index) => ({
      id: message.id,
      kind: "message",
      timestamp: message.createdAt,
      sequence: message.sequence ?? index,
      message,
    })),
    ...tools.map<TimelineItem>((tool, index) => ({
      id: tool.id,
      kind: "tool",
      timestamp: tool.startedAt,
      sequence: tool.sequence ?? messages.length + index,
      tool,
    })),
    ...tasks.map<TimelineItem>((task, index) => ({
      id: `task-${task.taskId}`,
      kind: "task",
      timestamp: task.updatedAt,
      sequence: task.sequence ?? messages.length + tools.length + index,
      task,
    })),
    ...backgroundTasks.map<TimelineItem>((backgroundTask, index) => ({
      id: `background-${backgroundTask.taskId}`,
      kind: "background",
      timestamp: backgroundTask.updatedAt,
      sequence:
        backgroundTask.sequence ?? messages.length + tools.length + tasks.length + index,
      backgroundTask,
    })),
  ].sort((left, right) => {
    const timestampDiff =
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();

    if (timestampDiff !== 0) return timestampDiff;
    return left.sequence - right.sequence;
  });
}

function MessageTimeline({
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

function TimelineItemRow({
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
  const task = isTask ? item.task : null;
  const backgroundTask = isBackground ? item.backgroundTask : null;
  const toolVisual = tool ? getToolVisual(tool.name) : null;
  const ToolGlyph = toolVisual?.icon;
  const isActiveAssistant =
    isAssistant && isLast && isRunning && (message?.status === "running" || !message?.text);

  if (isAssistant && !message?.text) {
    return null;
  }

  return (
    <div>
      <div className={cn("mx-auto max-w-3xl px-4", isTool || isTask || isBackground ? "py-1" : "py-6")}>
        <div
          className={cn(
            "flex",
            isTool || isTask || isBackground ? "items-start gap-3" : isUser ? "justify-end" : "gap-4",
          )}
        >
          {isTool ? (
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                toolVisual?.iconClassName,
              )}
            >
              {ToolGlyph ? <ToolGlyph className="h-3.5 w-3.5" /> : null}
            </div>
          ) : isTask ? (
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
              isTool || isTask || isBackground ? "w-fit max-w-[32rem]" : isUser ? "max-w-[40rem]" : "flex-1",
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

            {isTool && tool && <ToolCallItem tool={tool} />}
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

// Tool Call Item Component - Collapsible tool info
function ToolCallItem({ tool }: { tool: AgentTransportTool }) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = tool.status === "running";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          "rounded-md border border-border/40 bg-background/30",
          isRunning && "border-primary/20",
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="flex min-w-[13rem] max-w-[28rem] items-center justify-between gap-3 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/20">
            <div className="flex min-w-0 items-center gap-2">
              {isRunning ? (
                <div className="flex h-3.5 w-3.5 items-center justify-center">
                  <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <CheckCircle2Icon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="truncate text-xs font-medium text-foreground/90">
                {tool.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {isRunning ? "Running" : "Done"}
              </span>
            </div>
            {isOpen ? (
              <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 border-t border-border/40 px-2.5 py-2">
            {Boolean(tool.args) && (
              <div>
                <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                  参数
                </div>
                <pre className="overflow-auto rounded bg-muted/60 p-1.5 text-[10px]">
                  {JSON.stringify(tool.args, null, 2)}
                </pre>
              </div>
            )}
            {tool.result && (
              <div>
                <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                  输出
                </div>
                <pre className="max-h-32 overflow-auto rounded bg-muted/60 p-1.5 text-[10px]">
                  {tool.result.length > 200
                    ? tool.result.substring(0, 200) + "..."
                    : tool.result}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ActivityTraceItem({
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

  const normalizedStatus = activity.status.toLowerCase();
  const isRunning = normalizedStatus === "in_progress" || normalizedStatus === "running";
  const isCompleted = normalizedStatus === "completed" || normalizedStatus === "done";
  const isBlocked = normalizedStatus === "blocked";
  const title =
    kind === "task"
      ? task?.subject || `Task #${task?.taskId}`
      : `Background ${backgroundTask?.taskId}`;
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
        <span className="truncate text-xs font-medium text-foreground/90">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">{activity.status}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{trailingId}</span>
    </div>
  );
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

function TimelineActivityIndicator() {
  return (
    <div className="mx-auto mt-4 max-w-3xl px-4 pb-2">
      <div className="ml-[2.75rem]">
        <InlineLoadingState />
      </div>
    </div>
  );
}

function shouldShowTimelineActivityIndicator(latestItem: TimelineItem | undefined, isRunning: boolean) {
  if (!isRunning || !latestItem) return false;

  if (latestItem.kind === "tool") {
    return true;
  }

  if (latestItem.kind === "task") {
    return true;
  }

  if (latestItem.kind === "background") {
    return true;
  }

  if (latestItem.message.role === "user") {
    return true;
  }

  return latestItem.message.status === "running" || !latestItem.message.text;
}

function ProfileDialog({
  isSigningOut,
  onOpenChange,
  onSignOut,
  open,
  user,
}: {
  isSigningOut: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut?: () => void;
  open: boolean;
  user?: {
    email: string;
    name?: string | null;
  };
}) {
  if (!user) return null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>查看当前登录账号和会话安全信息。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-3xl border bg-muted/30 p-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-primary/12 text-lg text-primary">
                  {getUserInitials(user)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-foreground">
                  {user.name?.trim() || "未设置昵称"}
                </div>
                <div className="truncate text-sm text-muted-foreground">{user.email}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border p-4">
            <InfoRow label="登录方式" value="Email & Password" />
            <InfoRow label="账号状态" value="Active" />
            <InfoRow label="会话作用域" value="Mini Agent Workspace" />
          </div>

          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/8 p-4 text-sm text-muted-foreground">
            资料编辑接口目前还没有接到后端。这个面板先用于查看当前账号信息和执行退出操作。
          </div>
        </div>

        <DialogFooter>
          {onSignOut && (
            <Button
              className="gap-2"
              disabled={isSigningOut}
              onClick={() => {
                onSignOut();
                onOpenChange(false);
              }}
              variant="destructive"
            >
              {isSigningOut ? (
                <LoaderCircleIcon className="h-4 w-4 animate-spin" />
              ) : (
                <LogOutIcon className="h-4 w-4" />
              )}
              退出当前账号
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  apiBaseUrl,
  onOpenChange,
  onResetWorkspace,
  open,
}: {
  apiBaseUrl: string;
  onOpenChange: (open: boolean) => void;
  onResetWorkspace: () => void;
  open: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const { addModel, getDefaultModel, removeModel, setDefaultModel, settings, updateModel } =
    useSettings();
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftProvider, setDraftProvider] = useState("openai");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("https://api.openai.com/v1");
  const [draftMaxTokens, setDraftMaxTokens] = useState([4096]);
  const [draftTemperature, setDraftTemperature] = useState([0.7]);
  const defaultModel = getDefaultModel();

  const resetEditor = () => {
    setEditorMode(null);
    setEditingModelId(null);
    setDraftName("");
    setDraftProvider("openai");
    setDraftApiKey("");
    setDraftBaseUrl("https://api.openai.com/v1");
    setDraftMaxTokens([4096]);
    setDraftTemperature([0.7]);
  };

  const applyProviderPreset = (providerId: string) => {
    setDraftProvider(providerId);
    const provider = MODEL_PROVIDER_PRESETS.find((item) => item.id === providerId);
    if (provider) {
      setDraftBaseUrl(provider.baseURL);
    }
  };

  const beginCreateModel = () => {
    resetEditor();
    setEditorMode("create");
  };

  const beginEditModel = (model: ModelConfig) => {
    setEditorMode("edit");
    setEditingModelId(model.id);
    setDraftName(model.name);
    setDraftProvider(model.provider);
    setDraftApiKey(model.apiKey ?? "");
    setDraftBaseUrl(model.baseURL ?? "");
    setDraftMaxTokens([model.maxTokens ?? 4096]);
    setDraftTemperature([model.temperature ?? 0.7]);
  };

  const saveModel = () => {
    const payload = {
      name: draftName.trim(),
      provider: draftProvider,
      apiKey: draftApiKey.trim(),
      baseURL: draftBaseUrl.trim(),
      maxTokens: draftMaxTokens[0] ?? 4096,
      temperature: draftTemperature[0] ?? 0.7,
    };

    if (!payload.name) return;

    if (editorMode === "edit" && editingModelId) {
      updateModel(editingModelId, payload);
    } else {
      addModel(payload);
    }

    resetEditor();
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          resetEditor();
        }
      }}
      open={open}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>管理外观、工作区连接和本地模型配置。</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3 rounded-2xl border p-4">
            <div>
              <div className="text-sm font-medium text-foreground">外观主题</div>
              <div className="text-xs text-muted-foreground">切换当前工作台的显示模式。</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={() => setTheme("light")}
                variant={theme === "light" ? "default" : "outline"}
              >
                <SunIcon className="h-4 w-4" />
                浅色
              </Button>
              <Button
                onClick={() => setTheme("dark")}
                variant={theme === "dark" ? "default" : "outline"}
              >
                <MoonIcon className="h-4 w-4" />
                深色
              </Button>
              <Button
                onClick={() => setTheme("system")}
                variant={theme === "system" ? "default" : "outline"}
              >
                <MonitorIcon className="h-4 w-4" />
                系统
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">工作区连接</div>
                <div className="text-xs text-muted-foreground">
                  当前前端会直接访问这个后端地址。
                </div>
              </div>
              <Badge variant="outline">Runtime</Badge>
            </div>
            <Input readOnly value={apiBaseUrl} />
            <Button onClick={onResetWorkspace} variant="outline">
              清空当前会话
            </Button>
          </section>

          <section className="space-y-4 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">模型配置</div>
                <div className="text-xs text-muted-foreground">
                  这些设置保存在浏览器本地，用于后续接入模型偏好。
                </div>
              </div>
              <Button onClick={beginCreateModel} size="sm" variant="outline">
                <PlusIcon className="h-4 w-4" />
                添加模型
              </Button>
            </div>

            {defaultModel ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <StarIcon className="h-4 w-4 text-primary" />
                  默认模型
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {defaultModel.name} · {defaultModel.provider}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                还没有模型配置。你可以先添加一个常用模型作为默认偏好。
              </div>
            )}

            {settings.models.length > 0 && (
              <div className="space-y-2">
                {settings.models.map((model) => {
                  const isDefault = model.id === settings.defaultModelId;
                  return (
                    <div
                      className="flex items-center justify-between gap-3 rounded-2xl border p-3"
                      key={model.id}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-medium text-foreground">
                            {model.name}
                          </div>
                          <Badge variant="outline">{model.provider}</Badge>
                          {isDefault && <Badge>默认</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {model.baseURL || "未设置 Base URL"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!isDefault && (
                          <Button
                            onClick={() => setDefaultModel(model.id)}
                            size="icon-sm"
                            variant="ghost"
                          >
                            <StarIcon className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          onClick={() => beginEditModel(model)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <Edit3Icon className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => removeModel(model.id)}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {editorMode && (
              <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">
                    {editorMode === "edit" ? "编辑模型" : "新增模型"}
                  </div>
                  <Button onClick={resetEditor} size="sm" variant="ghost">
                    取消
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    模型名称
                  </div>
                  <Input
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="例如 gpt-4.1 / claude-sonnet"
                    value={draftName}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    提供商
                  </div>
                  <Select onValueChange={applyProviderPreset} value={draftProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择提供商" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_PROVIDER_PRESETS.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    API Key
                  </div>
                  <Input
                    onChange={(event) => setDraftApiKey(event.target.value)}
                    placeholder="sk-..."
                    type="password"
                    value={draftApiKey}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Base URL
                  </div>
                  <Input
                    onChange={(event) => setDraftBaseUrl(event.target.value)}
                    placeholder="https://api.example.com/v1"
                    value={draftBaseUrl}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Max Tokens</span>
                    <span>{draftMaxTokens[0] ?? 4096}</span>
                  </div>
                  <Slider
                    max={32000}
                    min={256}
                    onValueChange={setDraftMaxTokens}
                    step={256}
                    value={draftMaxTokens}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Temperature</span>
                    <span>{(draftTemperature[0] ?? 0.7).toFixed(1)}</span>
                  </div>
                  <Slider
                    max={2}
                    min={0}
                    onValueChange={setDraftTemperature}
                    step={0.1}
                    value={draftTemperature}
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={!draftName.trim()}
                  onClick={saveModel}
                >
                  <CheckIcon className="h-4 w-4" />
                  保存模型
                </Button>
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function getUserInitials(user: { email: string; name?: string | null }) {
  const source = user.name?.trim() || user.email;
  const parts = source
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

function DebugItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
