"use client";

import { LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { AgentStudio } from "@/components/agent-studio/agent-studio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { signIn, signOut, signUp, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AuthMode = "sign-in" | "sign-up";
type CachedUser = { email: string; name: string | null };

const CACHE_KEY = "auth-user-cache";

function readCachedUser(): CachedUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedUser) : null;
  } catch {
    return null;
  }
}

const DEFAULT_FORM = { name: "", email: "", password: "" };

export function AuthShell() {
  const { data: session, isPending, refetch } = useSession();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const [isSigningOut, startSignOutTransition] = useTransition();
  const [cachedUser, setCachedUser] = useState<CachedUser | null>(null);

  // Read cache after mount (avoids SSR/hydration mismatch)
  useEffect(() => {
    setCachedUser(readCachedUser());
  }, []);

  // Sync localStorage cache whenever real session resolves
  useEffect(() => {
    if (isPending) return;
    if (session?.user) {
      const user: CachedUser = { email: session.user.email, name: session.user.name ?? null };
      localStorage.setItem(CACHE_KEY, JSON.stringify(user));
      setCachedUser(user);
    } else {
      localStorage.removeItem(CACHE_KEY);
      setCachedUser(null);
    }
  }, [isPending, session]);

  const handleAuth = () => {
    setMessage(null);
    startTransition(async () => {
      const response =
        mode === "sign-in"
          ? await signIn.email({ email: form.email.trim(), password: form.password })
          : await signUp.email({ name: form.name.trim(), email: form.email.trim(), password: form.password });

      if (response.error) {
        setMessage(response.error.message ?? "Authentication failed");
        return;
      }
      setForm(DEFAULT_FORM);
      await refetch();
    });
  };

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      await signOut();
      localStorage.removeItem(CACHE_KEY);
      setCachedUser(null);
      await refetch();
    });
  };

  // Use real session user if available, fall back to cached for instant render
  const effectiveUser = session?.user
    ? { email: session.user.email, name: session.user.name ?? null }
    : cachedUser;

  // Confirmed not logged in: real session returned null
  const confirmedLoggedOut = !isPending && !session?.user;

  return (
    <div className="relative min-h-screen">
      {isPending && !effectiveUser && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
          <LoaderCircleIcon className="h-10 w-10 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">正在验证身份</p>
        </div>
      )}

      {confirmedLoggedOut ? (
        <div className="relative min-h-screen overflow-hidden bg-background">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_24%),linear-gradient(180deg,_rgba(15,23,42,0.06),_transparent)]" />
          <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10">
            <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="flex flex-col justify-center">
                <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
                  <ShieldCheckIcon className="h-3.5 w-3.5" />
                  Better Auth + SQLite
                </div>
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  登录后再使用 Agent Studio
                </h1>
                <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                  当前项目的聊天能力已经切到会话鉴权，未登录请求不会再直接访问 `/chat`。
                </p>
                <div className="mt-8 grid gap-3 text-sm text-muted-foreground sm:max-w-xl sm:grid-cols-3">
                  <div className="rounded-2xl border bg-card/60 p-4 backdrop-blur">邮箱密码注册</div>
                  <div className="rounded-2xl border bg-card/60 p-4 backdrop-blur">Better Auth session</div>
                  <div className="rounded-2xl border bg-card/60 p-4 backdrop-blur">SQLite 本地存储</div>
                </div>
              </section>

              <section className="flex items-center justify-center">
                <Card className="w-full max-w-md border-white/10 bg-card/90 shadow-2xl backdrop-blur">
                  <CardHeader className="space-y-4">
                    <div className="inline-flex rounded-full border bg-muted p-1">
                      {(["sign-in", "sign-up"] as const).map((value) => (
                        <button
                          key={value}
                          className={cn(
                            "rounded-full px-4 py-2 text-sm transition-colors",
                            mode === value
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground",
                          )}
                          onClick={() => { setMode(value); setMessage(null); }}
                          type="button"
                        >
                          {value === "sign-in" ? "登录" : "注册"}
                        </button>
                      ))}
                    </div>
                    <div>
                      <CardTitle>{mode === "sign-in" ? "继续使用工作台" : "创建新账号"}</CardTitle>
                      <CardDescription>
                        {mode === "sign-in"
                          ? "输入邮箱和密码以访问受保护的 Agent 能力。"
                          : "注册后会自动建立登录 session。"}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <form
                      className="space-y-4"
                      onSubmit={(e) => { e.preventDefault(); handleAuth(); }}
                    >
                      {mode === "sign-up" && (
                        <Input
                          autoComplete="name"
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="昵称"
                          required
                          value={form.name}
                        />
                      )}
                      <Input
                        autoComplete="email"
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="邮箱"
                        required
                        type="email"
                        value={form.email}
                      />
                      <Input
                        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                        minLength={8}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="密码，至少 8 位"
                        required
                        type="password"
                        value={form.password}
                      />
                      {message && (
                        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                          {message}
                        </div>
                      )}
                      <Button className="w-full" disabled={isSubmitting} type="submit">
                        {isSubmitting ? (
                          <><LoaderCircleIcon className="mr-2 h-4 w-4 animate-spin" />处理中</>
                        ) : mode === "sign-in" ? "登录" : "注册并进入"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </section>
            </div>
          </div>
        </div>
      ) : effectiveUser ? (
        <AgentStudio user={effectiveUser} onSignOut={handleSignOut} isSigningOut={isSigningOut} />
      ) : null}
    </div>
  );
}
