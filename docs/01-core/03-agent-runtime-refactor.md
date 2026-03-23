# Agent Runtime 目录化重构说明

这份文档只讲重构后的 `src/agent`。

目标很明确：

- 不再让 `session` 成为大杂烩
- 用目录把职责边界直接写在结构里
- 让阅读顺序和依赖方向一致

## 1. 目录结构

```text
src/agent
├── index.ts
├── application
│   └── conversation-run-recorder.ts
├── core
│   ├── config.ts
│   ├── create-agent.ts
│   ├── events.ts
│   ├── runtime.ts
│   └── types.ts
├── context
│   ├── context-manager.ts
│   └── prompt-builder.ts
├── model
│   └── model-client.ts
├── orchestration
│   └── runner.ts
├── session
│   ├── event-bus.ts
│   ├── message-store.ts
│   ├── session-sync.ts
│   ├── session.ts
│   └── state-store.ts
├── skills
│   └── skill-loader.ts
├── subagents
│   └── subagent.ts
├── templates
│   └── prompts.ts
└── tools
    └── tool-executor.ts
```

这个结构不是为了好看，而是为了把职责写死在目录里：

- `core` 管创建、配置、协议、runtime 装配
- `session` 管会话实例、消息、状态、事件
- `orchestration` 管主循环编排
- `context` 管 prompt 和上下文准备
- `model` 管模型协议适配
- `tools` 管 tool 执行
- `application` 管把 agent 事件投影到业务动作
- `skills / subagents / templates` 管附属能力

## 2. 架构原则

### 单一职责

每个目录只回答一类问题：

- `core` 回答“系统怎么被创建”
- `session` 回答“会话持有什么状态”
- `orchestration` 回答“执行顺序是什么”
- `context` 回答“每一轮输入怎么准备”
- `model` 回答“怎么和模型通信”
- `tools` 回答“工具怎么执行”

### 单向依赖

主链路是：

```text
createAgent
  -> AgentRuntime
    -> AgentSession
      -> AgentRunner
        -> SessionContextManager
        -> AgentModelClient
        -> AgentToolExecutor
        -> SessionStateStore
        -> MessageStore
```

下层不能反过来依赖上层。

### 状态和行为分离

这次最核心的拆分是：

- `MessageStore` 只管消息
- `SessionStateStore` 只管运行状态
- `AgentRunner` 只管编排

以前这些混在一个类里，所以阅读成本很高。

### 外观层尽量薄

[session.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/session.ts) 现在只是 facade。

它只负责：

- `run`
- `runStream`
- `getState`
- `cancel`

它不再直接做 LLM、tool、compact、background。

## 3. 各目录职责

### `core`

文件：

- [config.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/config.ts)
- [create-agent.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/create-agent.ts)
- [events.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/events.ts)
- [runtime.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/runtime.ts)
- [types.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/types.ts)

职责：

- 定义公共类型和事件协议
- 提供 agent 创建入口
- 装配共享依赖
- 创建 session services
- 创建 session

架构考虑：

- `core` 保存跨 session 可复用的依赖
- `runtime.ts` 是 container，不是执行器
- provider、task manager、background manager 的默认实现都应该从这里装配

### `session`

文件：

- [session.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/session.ts)
- [runtime-state.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/runtime-state.ts)
- [message-store.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/message-store.ts)
- [event-bus.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/event-bus.ts)
- [session-sync.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/session-sync.ts)

职责：

- `session.ts` 提供会话外观
- `state-store.ts` 提供单一状态源
- `message-store.ts` 维护消息真状态
- `event-bus.ts` 做最小事件发布
- `session-sync.ts` 把 task/background 差异转换成事件

架构考虑：

- 会话消息和会话运行状态必须分开
- `AgentState.messages` 只是输出快照，不是第二份内部状态
- 如果以后 `session.ts` 又膨胀，说明边界退化了

### `orchestration`

文件：

- [runner.ts](/home/kk/dev/agents/mynano-agent/src/agent/orchestration/runner.ts)

职责：

- 控制主循环顺序
- 控制 started/completed/failed/cancelled
- 决定何时准备上下文
- 决定何时请求模型
- 决定何时执行工具

架构考虑：

- `runner` 只做编排，不做底层细节
- 任何“先做 A 再做 B”的逻辑，都优先落在这里

### `context`

文件：

- [context-manager.ts](/home/kk/dev/agents/mynano-agent/src/agent/context/context-manager.ts)
- [prompt-builder.ts](/home/kk/dev/agents/mynano-agent/src/agent/context/prompt-builder.ts)

职责：

- 拼 system prompt
- 执行 micro compact / auto compact
- 处理手动 compact
- 注入 background notifications

架构考虑：

- 上下文策略是独立能力，不属于 session，也不属于 model
- 以后要加 memory、summary、retrieval，都应该先看这个目录

### `model`

文件：

- [model-client.ts](/home/kk/dev/agents/mynano-agent/src/agent/model/model-client.ts)

职责：

- 调用底层 LLM client
- 处理 streaming chunk
- 汇总 assistant 文本
- 汇总 tool calls
- 发出 stream 事件

架构考虑：

- provider 协议细节最容易污染主循环，所以必须隔离
- 以后从 Chat Completions 切 Responses API，优先改这里

### `tools`

文件：

- [tool-executor.ts](/home/kk/dev/agents/mynano-agent/src/agent/tools/tool-executor.ts)

职责：

- 解析 tool 参数
- 执行具体 tool
- 处理 `compact` 特例
- 写回 tool result message
- 刷新 task/background 状态

架构考虑：

- runner 只决定“是否进入工具阶段”
- executor 负责“工具怎么跑”
- tool 副作用层必须和编排层分开

### `application`

文件：

- [conversation-run-recorder.ts](/home/kk/dev/agents/mynano-agent/src/agent/application/conversation-run-recorder.ts)

职责：

- 把 agent 事件投影成 conversation 持久化动作
- 记录 run 的终态是 `completed / failed / cancelled`
- 让 handler 不直接理解 agent 内部细节

架构考虑：

- handler 该管 HTTP 和 SSE，不该塞满持久化投影逻辑
- recorder 放在 application 层，专门衔接 agent 内核和 conversation service

### `skills / subagents / templates`

文件：

- [skill-loader.ts](/home/kk/dev/agents/mynano-agent/src/agent/skills/skill-loader.ts)
- [subagent.ts](/home/kk/dev/agents/mynano-agent/src/agent/subagents/subagent.ts)
- [prompts.ts](/home/kk/dev/agents/mynano-agent/src/agent/templates/prompts.ts)

职责：

- `skills` 负责技能元数据和内容装载
- `subagents` 负责子代理最小 loop
- `templates` 负责 prompt 模板

架构考虑：

- 这些是旁支能力，不应该混进主链路目录
- 独立出来后，主路径阅读更集中

## 4. 推荐阅读顺序

1. [index.ts](/home/kk/dev/agents/mynano-agent/src/agent/index.ts)
2. [create-agent.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/create-agent.ts)
3. [runtime.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/runtime.ts)
4. [session.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/session.ts)
5. [runner.ts](/home/kk/dev/agents/mynano-agent/src/agent/orchestration/runner.ts)
6. [runtime-state.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/runtime-state.ts)
7. [message-store.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/message-store.ts)
8. [context-manager.ts](/home/kk/dev/agents/mynano-agent/src/agent/context/context-manager.ts)
9. [model-client.ts](/home/kk/dev/agents/mynano-agent/src/agent/model/model-client.ts)
10. [tool-executor.ts](/home/kk/dev/agents/mynano-agent/src/agent/tools/tool-executor.ts)
11. [conversation-run-recorder.ts](/home/kk/dev/agents/mynano-agent/src/agent/application/conversation-run-recorder.ts)

## 5. 这次删掉了什么

删除了旧的 `assistant-stream.ts`。

原因很简单：

- stream 汇总逻辑已经稳定落在 `model/model-client.ts`
- 再保留旧工具函数只会制造误导

## 6. 后续扩展怎么放

### 加取消、暂停、恢复

优先看：

- `session/runtime-state.ts`
- `session/session.ts`
- `orchestration/runner.ts`

### 加新的上下文策略

优先看：

- `context/context-manager.ts`
- `context/prompt-builder.ts`

### 换模型协议

优先看：

- `model/model-client.ts`
- `models/openai-compatible.ts`

### 扩展工具执行和 guardrail

优先看：

- `agent/tools/tool-executor.ts`
- `tools/`

一句话说：

以后不要再围着一个大类打补丁，而是先判断问题属于哪个目录，再把逻辑放进对应模块。
