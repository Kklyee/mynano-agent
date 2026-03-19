export const suggestions = [
  "帮我拆一个前端重构计划",
  "总结这个 agent 的能力边界",
  "给我一个调研任务的执行步骤",
  "分析一下当前代码架构",
];

export const MODEL_PROVIDER_PRESETS = [
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

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  blocked: "等待前置任务",
  running: "进行中",
  failed: "失败",
};

export const TOOL_PREVIEW_LIMIT = 3;
