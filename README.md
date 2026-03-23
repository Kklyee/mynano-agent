# mini-agent

一个目录边界清晰的轻量 Agent 项目。

当前工程按“运行时代码 / 前端 / 文档 / 历史方案”拆开，避免根目录和 `src/` 混入实验文件或旧实现。

## 当前代码结构

```text
src/
  cli.ts
  server.ts
  auth.ts
  agent/
  app/
  models/
  services/
  tools/
  utils/
frontend/
  app/
  components/
  hooks/
  lib/
legacy/
  express-auth/
  hono-sse-server.ts
tests/
docs/
skills/
data/
```

### 结构约定

- `src/cli.ts`
  命令行入口，跑单次 agent 任务
- `src/server.ts`
  Hono + Better Auth 服务端入口
- `src/agent`
  agent 核心运行时、会话、事件、配置
- `src/services`
  任务、压缩、技能、后台任务、子代理等支撑能力
- `src/tools`
  工具定义、工具注册、内置工具
- `src/utils`
  纯工具函数
- `frontend`
  Next.js + shadcn/ui 前端
- `legacy`
  已归档的旧实现，不参与当前运行链路
- `tests`
  当前 Vitest 测试

## 如何运行

先安装根目录依赖：

```bash
npm install
```

配置模型环境变量：

```bash
ZHIPU_API_KEY=...
ZHIPU_BASE_URL=...
ZHIPU_MODEL=GLM-4.7
TAVILY_API_KEY=...
```

`TAVILY_API_KEY` 用于启用 agent 的联网搜索工具 `web_search`。当任务需要最新网页信息、新闻或外部资料来源时，agent 会通过 Tavily 搜索并返回摘要与结果链接。

启动后端服务：

```bash
npm run dev
```

运行 CLI：

```bash
npm run start -- 帮我做一个调研计划
```

启动前端：

```bash
cd frontend
npm install
npm run dev
```

前端默认连接：

```bash
NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:3001
```

## 代码里如何使用

最常用的入口是 [`src/agent/index.ts`](/D:/dev/code/agent/mini-agent/src/agent/index.ts)。

```ts
import {
  createAgent,
  createAgentConfig,
} from "./src/agent/index";

const agent = await createAgent(
  createAgentConfig({
    workDir: process.cwd(),
  }),
);

const result = await agent.run("帮我分析一下 AI Agent 产品方向");
console.log(result.output);
```

如果要接前端或 TUI，可以直接使用 session：

```ts
const session = await agent.createSession();

for await (const event of session.runStream("帮我做竞品分析")) {
  console.log(event);
}

console.log(session.getState());
```

## 文档入口

- [`docs/architecture.md`](/D:/dev/code/agent/mini-agent/docs/architecture.md)
- [`docs/async-event-queue-explained.md`](/D:/dev/code/agent/mini-agent/docs/async-event-queue-explained.md)
- [`docs/s06-context-compact-guide.md`](/D:/dev/code/agent/mini-agent/docs/s06-context-compact-guide.md)
- [`docs/s07-task-system-guide.md`](/D:/dev/code/agent/mini-agent/docs/s07-task-system-guide.md)
- [`docs/s08-background-tasks-guide.md`](/D:/dev/code/agent/mini-agent/docs/s08-background-tasks-guide.md)
