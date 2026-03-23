# Agent 系统架构详解

这份文档只描述当前仓库里已经存在的 Agent 系统，不讲理想化设计。

目标有 3 个：

1. 让你一眼看清系统现在是怎么跑起来的
2. 让你知道每个模块放在哪里、为什么放在那里
3. 让你知道模块之间到底通过哪些方法协作

## 1. 系统总览

当前系统更接近下面这种风格：

- 后端：分层架构 + handler/service/repository 模式
- Agent Runtime：运行时装配 + session loop + tool registry 模式
- 前端：Next.js 组件化 + hook 驱动的 SSE 状态同步
- 数据层：Postgres + Drizzle，conversation 相关数据全部持久化

它不是传统 MVC，也不是纯事件驱动架构，而是一个混合式的 agent 应用：

- HTTP 层负责接收请求和推送 SSE
- AgentSession 提供会话外观，AgentRunner 负责主循环
- ToolRegistry 负责给模型暴露能力
- ConversationService/Repository 负责把运行历史落库

## 2. 总体架构图

```text
Frontend (Next.js / Agent Studio)
  - app/page.tsx
  - hooks/agent/use-agent-view.ts
  - api/agent-native-client.ts
          |
          | REST + SSE
          v
Backend Server (Hono)
  - src/server.ts
  - src/handlers/chat.ts
  - src/handlers/conversations.ts
  - src/handlers/auth.ts
          |
          v
Agent Facade
  - src/agent/core/create-agent.ts
  - src/agent/index.ts
          |
          v
Agent Runtime
  - src/agent/core/runtime.ts
  - OpenAICompatibleClient
  - SkillLoader
  - CompactManager
  - TaskManager / ConversationTaskManager
  - BackgroundManager / ConversationBackgroundManager
  - ToolRegistry
          |
          v
Agent Session
  - src/agent/session/session.ts
  - src/agent/orchestration/runner.ts
  - session 负责外观，runner 负责执行编排
          |
          +------------------> OpenAI-compatible LLM
          |
          +------------------> Builtin Tools
          |                    - bash
          |                    - read_file / write_file / edit_file
          |                    - task_*
          |                    - background_*
          |                    - web_search
          |                    - load_skill
          |                    - delegate_to_subagent
          |
          +------------------> ConversationService
                                 |
                                 v
                           ConversationRepository
                                 |
                                 v
                              Postgres
```

## 3. 一次完整请求的调用链

```text
用户输入 prompt
  -> frontend/hooks/agent/use-agent-view.ts sendPrompt()
  -> POST /api/conversations/:id/messages
  -> src/handlers/conversations.ts
  -> conversationService.prepareRun()
  -> agent.createSession({ conversationId, messages })
  -> session.runStream(prompt)
  -> AgentRunner.run()
  -> buildSystemPrompt()
  -> AgentModelClient.generate()
     -> 模型返回文本 或 tool_calls
  -> AgentToolExecutor.executeToolCalls()
     -> ToolRegistry.execute()
     -> builtin handler()
  -> 工具结果作为 role=tool 写回消息
  -> 再次 AgentModelClient.generate()
  -> 最终输出 assistant message
  -> handler 把消息/工具/任务/后台事件落库
  -> SSE 事件推给前端
  -> frontend/api/agent-native-client.ts applyAgentEvent()
  -> 前端状态刷新
```

## 4. 模块摘要

### `src/agent/core/create-agent.ts`

- 负责创建 `AgentRuntime`
- 对外暴露 `run()` 和 `createSession()`

### `src/agent/core/runtime.ts`

- 装配模型、skill、compact、task manager、background manager、tool registry
- 为 session 创建执行作用域

### `src/agent/session/session.ts` + `src/agent/orchestration/runner.ts`

- `session.ts` 维护会话外观和事件桥接
- `runner.ts` 驱动 LLM 主循环
- `state-store.ts` / `message-store.ts` 维护内部状态
- `tools/tool-executor.ts` 执行工具

### `src/tools/*`

- `context.ts` 定义工具上下文契约
- `definitions.ts` 放内置工具定义与实现
- `tool-registry.ts` 做注册和执行门面

### `src/handlers/conversations.ts`

- 接 conversation 相关 HTTP 请求
- 建立 SSE
- 将 session 事件写入数据库

### `src/services/conversation-service.ts`

- 承接 conversation 领域逻辑
- 处理消息、工具、任务、后台事件的持久化动作

### `src/repositories/conversation-repository.ts`

- 封装数据库读写
- 用 Drizzle 操作 conversation 相关表

## 5. 当前架构优点

- 已经有明确分层
- session 与 HTTP 层分离
- task/background/conversation 都有独立模块
- 前端有基础可观测工作台

## 6. 当前架构短板

- session 缺少真正取消能力
- background manager 仍是内存态
- tool call 还缺统一身份追踪
- 测试覆盖接近为空
