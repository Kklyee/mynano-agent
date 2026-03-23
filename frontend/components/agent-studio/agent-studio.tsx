"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftOpenIcon,
  PanelRightOpenIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react";
import { useAgentView } from "@/hooks/agent/use-agent-view";
import { Button } from "@/components/ui/button";
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
import { buildToolGroups } from "@/utils/tool-utils";
import {
  normalizeTaskStatus,
  sortTasksForDisplay,
  sortBackgroundTasksForDisplay,
} from "@/utils/task-utils";
import { TOOL_PREVIEW_LIMIT, suggestions } from "@/constants/agent-studio";
import { buildTimeline, MessageTimeline } from "./components/message-timeline";
import { LeftSidebar } from "./components/left-sidebar";
import { RightDebugPanel } from "./components/right-debug-panel";
import { ProfileDialog } from "./components/profile-dialog";
import { SettingsDialog } from "./components/settings-dialog";

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
    deleteConversation,
    healthQuery,
    isConversationListLoading,
    isRunning,
    resetWorkspace,
    sendPrompt,
    selectConversation,
    state,
  } = useAgentView();
  const [prompt, setPrompt] = useState("");
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const toolGroups = buildToolGroups(state.tools);
  const visibleToolGroups = toolGroups.slice(0, TOOL_PREVIEW_LIMIT);
  const timeline = buildTimeline(state.messages, state.tools, state.tasks, state.backgroundTasks);
  const sortedTasks = sortTasksForDisplay(state.tasks);
  const activeTasks = sortedTasks.filter(
    (task) => normalizeTaskStatus(task.status) !== "completed",
  );
  const completedTasks = sortedTasks.filter(
    (task) => normalizeTaskStatus(task.status) === "completed",
  );
  const sortedBackgroundTasks = sortBackgroundTasksForDisplay(state.backgroundTasks);

  const getHealthStatus = () => {
    if (healthQuery.isError) return { label: "Offline", variant: "destructive" as const };
    if (healthQuery.isFetching) return { label: "Checking", variant: "secondary" as const };
    return { label: "Ready", variant: "default" as const };
  };

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

  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-background">
        <LeftSidebar
          conversations={conversations}
          currentThreadId={state.session.threadId}
          health={getHealthStatus()}
          isConversationListLoading={isConversationListLoading}
          onDeleteConversation={(id) => void deleteConversation(id)}
          onNewConversation={resetWorkspace}
          onSelectConversation={(id) => void selectConversation(id)}
          onSetIsProfileOpen={setIsProfileOpen}
          onSetIsSettingsOpen={setIsSettingsOpen}
          open={leftSidebarOpen}
          setOpen={setLeftSidebarOpen}
          user={user}
        />

        {/* Main Content */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Top Navigation */}
          <header className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
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
                  <div className="border-b p-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2"
                      onClick={resetWorkspace}
                    >
                      <PlusIcon className="h-4 w-4" />
                      新对话
                    </Button>
                  </div>
                  <ScrollArea className="h-[calc(100vh-5.5rem)] p-2">
                    {conversations.length > 0 ? (
                      <div className="space-y-1">
                        {conversations.map((conversation) => (
                          <Button
                            key={conversation.id}
                            variant={
                              state.session.threadId === conversation.id ? "secondary" : "ghost"
                            }
                            className="h-auto w-full justify-start rounded-xl px-3 py-2 text-left"
                            onClick={() => void selectConversation(conversation.id)}
                          >
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="truncate text-sm font-medium leading-5">
                                {conversation.title}
                              </div>
                              <div className="truncate text-[11px] leading-4 text-muted-foreground">
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

          {/* Messages Area */}
          <div className="relative flex min-h-0 flex-1 h-full flex-col overflow-hidden">
            <ScrollArea className="h-full w-full" viewportRef={viewportRef}>
              <div className="mx-auto max-w-4xl">
                {state.messages.length === 0 ? (
                  <EmptyState />
                ) : (
                  <MessageTimeline timeline={timeline} isRunning={isRunning} />
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Input Area */}
          <div className="shrink-0 border-t bg-background">
            <div className="mx-auto max-w-3xl px-4 py-4">
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

        {/* Right Panel */}
        <aside
          className={`hidden flex-col border-l bg-card transition-all duration-300 ease-in-out lg:flex ${
            rightPanelOpen ? "w-[320px] opacity-100" : "w-0 overflow-hidden opacity-0"
          }`}
        >
          {rightPanelOpen && (
            <RightDebugPanel
              activeTasks={activeTasks}
              completedTasks={completedTasks}
              eventLog={state.eventLog}
              session={state.session}
              setOpen={setRightPanelOpen}
              sortedBackgroundTasks={sortedBackgroundTasks}
              toolGroups={toolGroups}
              totalToolCount={state.tools.length}
              visibleToolGroups={visibleToolGroups}
            />
          )}
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

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-20">
      <h2 className="mb-2 text-2xl font-semibold">有什么可以帮你的？</h2>
      <p className="mb-8 max-w-md text-center text-sm text-muted-foreground">
        我是一个 AI Agent，可以通过工具调用和任务规划来帮助你完成复杂的任务。
      </p>
    </div>
  );
}
