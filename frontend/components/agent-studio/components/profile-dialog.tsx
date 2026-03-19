"use client";

import { LoaderCircleIcon, LogOutIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUserInitials } from "@/utils/user-utils";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ProfileDialog({
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
  user?: { email: string; name?: string | null };
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
