# Frontend 快速浏览

这份文档只回答 3 个问题：

1. 前端目录现在怎么分
2. 每个目录负责什么
3. 应该按什么顺序读

## 1. 目录结构

```text
frontend
├── api
│   ├── agent
│   │   └── stream.ts
│   └── conversations
│       └── api.ts
├── hooks
│   ├── agent
│   │   ├── use-agent-run.ts
│   │   └── use-agent-view.ts
│   └── conversations
│       └── use-conversations.ts
├── state
│   ├── agent
│   │   ├── run-state.ts
│   │   └── view-state.ts
│   └── conversations
│       └── detail-state.ts
└── components
    └── agent-studio
        └── agent-studio.tsx
```

规则是固定的：

- `api/<biz>`：只放请求和流
- `hooks/<biz>`：只放交互流程
- `state/<biz>`：只放状态和映射
- 不再用 `api/client`、`api/hooks`、`api/state`

## 2. 每层职责

### `api/conversations`

- 文件：[api.ts](/home/kk/dev/agents/mynano-agent/frontend/api/conversations/api.ts)
- 职责：对话相关 HTTP 请求
- 包含：列表、详情、创建、删除、发 prompt、health

一句话：
`和 conversations 后端接口直接通信`

### `api/agent`

- 文件：[stream.ts](/home/kk/dev/agents/mynano-agent/frontend/api/agent/stream.ts)
- 职责：处理 agent 流式事件
- 包含：SSE block 解析、event normalize、stream consume

一句话：
`把后端事件流翻译成前端事件`

### `hooks/conversations`

- 文件：[use-conversations.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/conversations/use-conversations.ts)
- 职责：对话列表相关交互
- 包含：加载列表、选择会话、删除会话、health、创建会话

一句话：
`conversation 页面交互逻辑`

### `hooks/agent`

- 文件：[use-agent-run.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/agent/use-agent-run.ts)
- 职责：agent 运行相关交互
- 包含：send prompt、消费 stream、cancel、reset

- 文件：[use-agent-view.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/agent/use-agent-view.ts)
- 职责：门面组合
- 包含：把 `use-conversations` 和 `use-agent-run` 拼起来给页面用

一句话：
`agent 运行逻辑在 use-agent-run，页面门面在 use-agent-view`

### `state/conversations`

- 文件：[detail-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/conversations/detail-state.ts)
- 职责：把 conversation detail payload 转成前端状态

一句话：
`后端 detail -> 前端 view state`

### `state/agent`

- 文件：[view-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/agent/view-state.ts)
- 职责：定义 agent 页面状态和空状态

- 文件：[run-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/agent/run-state.ts)
- 职责：运行期 reducer
- 包含：begin、fail、cancel、apply event

一句话：
`view-state 定义状态，run-state 推进状态`

## 3. 主调用链

```text
AgentStudio
  -> useAgentView
    -> useConversations
      -> api/conversations/api.ts
      -> state/conversations/detail-state.ts
    -> useAgentRun
      -> api/conversations/api.ts
      -> api/agent/stream.ts
      -> state/agent/run-state.ts
```

你看代码时，优先沿这条链读。

## 4. 阅读顺序

建议顺序：

1. [agent-studio.tsx](/home/kk/dev/agents/mynano-agent/frontend/components/agent-studio/agent-studio.tsx)
2. [use-agent-view.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/agent/use-agent-view.ts)
3. [use-conversations.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/conversations/use-conversations.ts)
4. [use-agent-run.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/agent/use-agent-run.ts)
5. [api.ts](/home/kk/dev/agents/mynano-agent/frontend/api/conversations/api.ts)
6. [stream.ts](/home/kk/dev/agents/mynano-agent/frontend/api/agent/stream.ts)
7. [detail-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/conversations/detail-state.ts)
8. [run-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/agent/run-state.ts)
9. [view-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/agent/view-state.ts)

## 5. 边界规则

后面继续改前端时，按这几条守住：

- 请求不要写进 `state`
- reducer 不要直接发请求
- hook 负责组织流程，不负责定义 DTO
- `api` 下面只放业务目录
- 通用能力再放 `lib`，不要提前抽象

## 6. 一句话总结

现在前端是：

`api 管通信，state 管状态，hooks 管流程，页面只消费 useAgentView。`
