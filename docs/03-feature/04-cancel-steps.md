# 取消步骤

这份文档基于重构后的目录结构来写。

现在取消不该再理解成“去改一个大 session 类”，而应该理解成一条固定链路：

- `session/session.ts` 暴露取消入口
- `session/runtime-state.ts` 记录取消请求
- `orchestration/runner.ts` 在主循环收敛取消
- `tools/tool-executor.ts` 阻止后续工具启动
- `handlers / services / frontend` 消费 `session.cancelled`

## 1. 总体顺序

严格按下面顺序做：

```text
1. 定义取消语义
2. 让 session 层接住取消请求
3. 让 runner 收敛取消
4. 让 tool-executor 停止后续工具
5. 打通 handler 和 API
6. 打通 conversation 持久化
7. 打通前端状态和交互
8. 做联调验证
```

原因很简单：

- 取消先是状态语义
- 再是执行中断
- 最后才是存储和 UI

## 2. 第一步：定义取消语义

文件：

- `src/agent/core/types.ts`
- `src/agent/core/events.ts`
- `src/types/conversation.ts`

目标：

- `AgentStatus` 有 `cancelled`
- 会话接口有正式 `cancel()`
- 事件里有 `session.cancelled`
- conversation 持久化状态也有 `cancelled`

检查点：

- 取消是正式状态，不再拿 `failed` 代替

## 3. 第二步：让 session 层接住取消请求

文件：

- `src/agent/session/session.ts`
- `src/agent/session/runtime-state.ts`

目标：

- `AgentSession.cancel()` 只负责提交取消请求
- `SessionStateStore` 记录取消意图和原因
- 已结束后再次取消有清晰行为

职责边界：

- `session/session.ts` 是入口
- `session/runtime-state.ts` 是事实来源

不要把取消状态重新塞回 `session.ts` 私有字段。

检查点：

1. 取消请求是不是只有一个存储位置
2. `session.cancel()` 是不是没有直接操纵 loop

## 4. 第三步：让 runner 收敛取消

文件：

- `src/agent/orchestration/runner.ts`

目标：

- 主循环在关键检查点调用 `isCancellationRequested()`
- 命中取消后发出 `session.cancelled`
- run 结果走 `cancelled`，不是 `failed`

重构后最应该改的是 `orchestration/runner.ts`，不是 `session/session.ts`。

至少检查：

- 一轮开始前是否检查取消
- tool calls 执行前后是否还会继续推进
- 取消后是否还会继续向模型发下一轮请求

检查点：

- 取消是 runner 控制的受控结束，不是异常退出

## 5. 第四步：让 tool-executor 停止后续工具

文件：

- `src/agent/tools/tool-executor.ts`
- 需要时补 `src/tools/context.ts`

目标：

- 已收到取消请求后，不再启动新的 tool call
- 如果工具层需要上下文，也能拿到取消状态

第一阶段先做最重要的事：

- 不再开启后续工具

先不要追求“强杀已经在跑的全部 IO”，那是下一阶段能力。

检查点：

- 当取消发生在 assistant 已返回多个 tools 时，未执行的 tools 不再继续执行

## 6. 第五步：打通 handler 和 API

文件：

- `src/handlers/conversations.ts`

目标：

- 找到当前 active session
- 把取消请求传给 `session.cancel()`
- 把 `session.cancelled` 往 SSE 推出去

建议分两层做：

### 最小版本

- `stream.onAbort()` 时调用 `session.cancel()`

### 正式版本

- 增加 `POST /api/conversations/:id/cancel`

原则：

- handler 不负责内部取消逻辑
- handler 只负责把取消请求传进去，并消费事件

## 7. 第六步：打通持久化

文件：

- `src/services/conversation-service.ts`
- `src/repositories/conversation-repository.ts`

目标：

- `session.cancelled` 到来时，把 conversation 状态写成 `cancelled`
- 不再把用户主动取消落成 `failed`

同时检查：

- 取消时 assistant message 是否保留部分输出
- 运行中的 task/background task 是否需要补 `cancelled` 或 `stopped`

检查点：

- 数据库最终状态和运行时状态一致

## 8. 第七步：打通前端

文件：

- `frontend/hooks/agent/use-agent-view.ts`
- 相关消息流、状态管理、UI 组件

目标：

- 前端能发送 cancel
- 前端能消费 `session.cancelled`
- UI 明确区分 `cancelled` 和 `failed`

前端至少要区分：

- `completed`
- `failed`
- `cancelled`

如果前端还把取消展示成失败，说明链路虽然通了，语义还是错的。

## 9. 第八步：联调验证

至少测下面 5 种情况。

### 场景 1：普通运行中取消

预期：

- `session.cancel()` 返回成功
- 下一次 runner 检查点命中取消
- SSE 收到 `session.cancelled`
- conversation 变成 `cancelled`

### 场景 2：tool call 之间取消

预期：

- 已完成的 tool 保留结果
- 尚未开始的 tool 不再启动

### 场景 3：前端断线触发取消

预期：

- 不只是前端停读 SSE
- 后端 session 也收到取消请求

### 场景 4：取消和失败严格区分

预期：

- 用户主动取消走 `cancelled`
- 真异常才走 `failed`

### 场景 5：已结束 session 再次取消

预期：

- 返回明确结果
- 不改写已完成状态

## 10. 现在这套结构下，取消功能应该改哪里

按模块看，落点应该是：

- 取消入口：`src/agent/session/session.ts`
- 取消状态：`src/agent/session/runtime-state.ts`
- 取消收敛：`src/agent/orchestration/runner.ts`
- 工具阻断：`src/agent/tools/tool-executor.ts`
- 事件对接：`src/handlers/conversations.ts`
- 最终持久化：`src/services/conversation-service.ts`

如果以后你又发现“为了做取消，不得不回去改一个大 session 类”，说明边界又退化了，要优先把职责拉回这些模块。
