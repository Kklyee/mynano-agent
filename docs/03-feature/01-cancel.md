# 取消 Run

这份文档讲“为什么下一步必须先做取消 Agent Run”。

## 为什么先做

因为当前系统已经能跑、能展示，但还不能真正控制运行。

现在的问题是：

- 前端断开了
- 后端 session 可能还在继续
- 工具和子代理可能还在继续

这是假取消。

## 这个 feature 的本质

不是加一个按钮，而是：

## 给 Agent Runtime 增加真正的运行控制能力

## 落点

### 核心拥有者

- `src/agent/session/session.ts`

### 配套模块

- `src/agent/core/types.ts`
- `src/agent/core/events.ts`
- `src/types/conversation.ts`
- `src/tools/context.ts`
- `src/tools/definitions.ts`
- `src/handlers/conversations.ts`
- `src/services/conversation-service.ts`
- `src/repositories/conversation-repository.ts`
- `frontend/hooks/agent/use-agent-view.ts`

## 原则

- 取消是独立状态，不是失败
- session 拥有取消真相
- handler 只桥接取消
- service 只负责持久化 cancelled
- tools 只感知取消，不拥有取消语义
