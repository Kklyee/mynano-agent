# Mini Agent Assistant Transport Sample

这个目录基于 assistant-ui 官方 `with-assistant-transport` 示例生成，再改造成适配当前 `mini-agent` 后端的模板代码。

这份代码刻意保持“样板”属性：

- 重点是看懂交互流程
- 不是完整产品实现
- 后端仍然沿用你当前的 `/chat` SSE
- 前端通过 Next 的 `/api/assistant` 做一层 assistant transport 适配

## 你能从这里看什么

1. assistant-ui 的 `useAssistantTransportRuntime` 怎么接
2. transport state 怎么映射成 thread messages
3. 现有 `/chat` 事件流怎么翻译成完整 agent state
4. 右侧状态面板怎么直接读取 transport state

## 快速开始

1. 在项目根目录启动 agent 服务：

```bash
npm run dev
```

2. 在 `frontend/` 目录配置 `frontend/.env.local`：

```bash
NEXT_PUBLIC_AGENT_API_BASE_URL=http://localhost:3001
```

3. 启动前端：

```bash
npm run dev
```

## 关键文件

- `app/assistant-runtime-provider.tsx`
- `app/api/assistant/route.ts`
- `components/agent-workspace.tsx`
- `lib/agent-state.ts`

## 详细教程

- [`docs/assistant-ui-next16-sample-frontend.md`](/D:/dev/code/agent/mini-agent/docs/assistant-ui-next16-sample-frontend.md)
