"use client";

import { MoreHorizontalIcon, PanelLeftCloseIcon, PlusIcon, Settings2Icon, Trash2Icon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getUserInitials } from "@/utils/user-utils";

type Conversation = {
  id: string;
  title: string;
  lastMessageAt?: string | null;
};

type HealthStatus = {
  label: string;
  variant: "default" | "destructive" | "secondary";
};

export function LeftSidebar({
  conversations,
  currentThreadId,
  health,
  isConversationListLoading,
  onDeleteConversation,
  onNewConversation,
  onSelectConversation,
  onSetIsProfileOpen,
  onSetIsSettingsOpen,
  open,
  setOpen,
  user,
}: {
  conversations: Conversation[];
  currentThreadId?: string | null;
  health: HealthStatus;
  isConversationListLoading: boolean;
  onDeleteConversation: (id: string) => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onSetIsProfileOpen: (open: boolean) => void;
  onSetIsSettingsOpen: (open: boolean) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  user?: { email: string; name?: string | null };
}) {
  return (
    <aside
      className={`hidden flex-col border-r bg-card transition-all duration-300 lg:flex ${open ? "w-[260px]" : "w-0 overflow-hidden opacity-0"
        }`}
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <Button
          variant="ghost"
          className="flex-1 justify-start gap-2"
          onClick={onNewConversation}
        >
          <PlusIcon className="h-4 w-4" />
          新对话
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setOpen(false)}
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
            {conversations.map((conversation) => {
              const isActive = currentThreadId === conversation.id;
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-xl pr-1 transition-colors",
                    isActive ? "bg-secondary text-secondary-foreground" : "hover:bg-muted",
                  )}
                >
                  <Button
                    variant="ghost"
                    className="h-auto min-w-0 flex-1 justify-start rounded-xl bg-transparent px-3 py-2 text-left hover:bg-transparent"
                    onClick={() => onSelectConversation(conversation.id)}
                  >
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5">
                        {conversation.title}
                      </div>
                      <div
                        className={cn(
                          "truncate text-[11px] leading-4",
                          isActive ? "text-secondary-foreground/70" : "text-muted-foreground",
                        )}
                      >
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`${conversation.title} 操作`}
                        variant="ghost"
                        size="icon-xs"
                        className={cn(
                          "shrink-0 rounded-lg opacity-0 transition-opacity hover:bg-background/60 data-[state=open]:opacity-100",
                          isActive
                            ? "text-secondary-foreground/70 hover:text-secondary-foreground"
                            : "text-muted-foreground group-hover:opacity-100",
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontalIcon className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conversation.id);
                        }}
                      >
                        <Trash2Icon className="mr-2 h-3.5 w-3.5" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
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
                onClick={() => onSetIsProfileOpen(true)}
                size="sm"
                variant="outline"
              >
                <UserIcon className="h-4 w-4" />
                Profile
              </Button>
              <Button
                className="justify-start gap-2"
                onClick={() => onSetIsSettingsOpen(true)}
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
  );
}
