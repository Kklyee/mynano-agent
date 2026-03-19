import {
  DatabaseIcon,
  FileCode2Icon,
  GitBranchIcon,
  GlobeIcon,
  ListTodoIcon,
  PackageIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { AgentTransportTool } from "@/types/agent-state";
import type { ToolGroup } from "@/types/agent-studio";

export function truncateMiddle(value: string, maxLength = 56) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export function extractToolPrimaryArg(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;

  const entries = Object.entries(args as Record<string, unknown>);
  const preferredKeys = [
    "command", "cmd", "filePath", "filepath", "path",
    "paths", "target", "url", "query", "pattern", "name",
  ];

  for (const key of preferredKeys) {
    const matched = entries.find(([entryKey]) => entryKey === key);
    if (!matched) continue;

    const [, value] = matched;
    if (typeof value === "string" && value.trim()) {
      return truncateMiddle(value.trim());
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return truncateMiddle(String(value[0]));
    }
  }

  const firstPrimitive = entries.find(([, value]) =>
    typeof value === "string" || typeof value === "number" || typeof value === "boolean",
  )?.[1];

  if (firstPrimitive !== undefined) {
    return truncateMiddle(String(firstPrimitive));
  }

  return null;
}

export function formatToolName(name: string) {
  const normalized = name.toLowerCase();
  if (
    normalized.includes("bash") ||
    normalized.includes("shell") ||
    normalized.includes("terminal")
  ) {
    return "Bash";
  }
  return name;
}

export function formatToolInvocation(tool: AgentTransportTool) {
  const argPreview = extractToolPrimaryArg(tool.args);
  return argPreview
    ? `${formatToolName(tool.name)}(${argPreview})`
    : `${formatToolName(tool.name)}()`;
}

export function getToolCategoryMeta(name: string): {
  key: string;
  label: string;
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
    return { key: "execute", label: "Execute", icon: TerminalIcon, iconClassName: "bg-sky-500/12 text-sky-400" };
  }

  if (
    normalized.includes("search") ||
    normalized.includes("find") ||
    normalized.includes("grep") ||
    normalized.includes("query") ||
    normalized.includes("folder") ||
    normalized.includes("dir")
  ) {
    return { key: "explore", label: "Explore", icon: SearchIcon, iconClassName: "bg-violet-500/12 text-violet-400" };
  }

  if (
    normalized.includes("file") ||
    normalized.includes("read") ||
    normalized.includes("write") ||
    normalized.includes("edit")
  ) {
    return { key: "files", label: "Files", icon: FileCode2Icon, iconClassName: "bg-emerald-500/12 text-emerald-400" };
  }

  if (
    normalized.includes("web") ||
    normalized.includes("fetch") ||
    normalized.includes("http") ||
    normalized.includes("url")
  ) {
    return { key: "web", label: "Web", icon: GlobeIcon, iconClassName: "bg-cyan-500/12 text-cyan-400" };
  }

  if (
    normalized.includes("git") ||
    normalized.includes("branch") ||
    normalized.includes("commit")
  ) {
    return { key: "git", label: "Git", icon: GitBranchIcon, iconClassName: "bg-orange-500/12 text-orange-400" };
  }

  if (
    normalized.includes("npm") ||
    normalized.includes("pnpm") ||
    normalized.includes("yarn") ||
    normalized.includes("bun")
  ) {
    return { key: "package", label: "Package", icon: PackageIcon, iconClassName: "bg-amber-500/12 text-amber-400" };
  }

  if (normalized.includes("task") || normalized.includes("plan")) {
    return { key: "plan", label: "Plan", icon: ListTodoIcon, iconClassName: "bg-pink-500/12 text-pink-400" };
  }

  if (
    normalized.includes("database") ||
    normalized.includes("sql") ||
    normalized.includes("query_db")
  ) {
    return { key: "data", label: "Data", icon: DatabaseIcon, iconClassName: "bg-indigo-500/12 text-indigo-400" };
  }

  return { key: "other", label: "Other", icon: WrenchIcon, iconClassName: "bg-muted text-muted-foreground" };
}

export function getToolVisual(name: string) {
  return getToolCategoryMeta(name);
}

export function getToolTimestamp(tool: AgentTransportTool) {
  return tool.completedAt || tool.startedAt;
}

export function buildToolGroups(tools: AgentTransportTool[]) {
  const groups = new Map<string, ToolGroup>();

  for (const tool of tools) {
    const meta = getToolCategoryMeta(tool.name);
    const existing = groups.get(meta.key);
    if (!existing) {
      groups.set(meta.key, {
        key: meta.key,
        label: meta.label,
        icon: meta.icon,
        iconClassName: meta.iconClassName,
        latestTool: tool,
        tools: [tool],
      });
      continue;
    }

    existing.tools.push(tool);
    const currentSequence = existing.latestTool.sequence ?? -1;
    const nextSequence = tool.sequence ?? -1;
    const shouldPromote =
      nextSequence > currentSequence ||
      (nextSequence === currentSequence &&
        new Date(getToolTimestamp(tool)).getTime() >=
        new Date(getToolTimestamp(existing.latestTool)).getTime());

    if (shouldPromote) {
      existing.latestTool = tool;
    }
  }

  return [...groups.values()].sort((left, right) => {
    const sequenceDiff = (right.latestTool.sequence ?? -1) - (left.latestTool.sequence ?? -1);
    if (sequenceDiff !== 0) return sequenceDiff;
    return (
      new Date(getToolTimestamp(right.latestTool)).getTime() -
      new Date(getToolTimestamp(left.latestTool)).getTime()
    );
  });
}
