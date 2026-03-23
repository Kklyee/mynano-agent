# Cancel 功能实战教程

这份文档不是讲抽象原理，而是讲：

## 基于你当前仓库，怎么一步一步把 cancel 功能做完

默认前提：

- `agent` 内核已经完成分层重构
- 前端请求层已经完成基础拆分
- 现在要做的是 `cancel` 全链路，不是再重构架构

---

## 1. 先明确目标

你这次要完成的不是“前端点一下停掉请求”。

真正目标是：

```text
用户点击取消
  -> 前端发 cancel 请求
  -> 后端找到正在运行的 session
  -> session 记录取消请求
  -> runner 在检查点收敛为 cancelled
  -> tool executor 不再启动后续工具
  -> conversation 状态落库为 cancelled
  -> 前端收到 cancelled 并正确展示
```

如果只做了中间一半，都不算完成。

---

## 2. 先看你现在已经有什么

你现在已经有这些基础：

### 后端内核

- [session.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/session.ts)
- [runtime-state.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/runtime-state.ts)
- [runner.ts](/home/kk/dev/agents/mynano-agent/src/agent/orchestration/runner.ts)
- [tool-executor.ts](/home/kk/dev/agents/mynano-agent/src/agent/tools/tool-executor.ts)

这几层已经具备：

- `session.cancel()`
- cancellation request state
- runner 中断点
- tools 后续阻断

### 事件和状态

- [events.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/events.ts)
- [types.ts](/home/kk/dev/agents/mynano-agent/src/agent/core/types.ts)
- [conversation.ts](/home/kk/dev/agents/mynano-agent/src/types/conversation.ts)

这里已经具备：

- `session.cancelled`
- `cancelled` 状态类型

### 前端基础

- [use-agent-view.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/agent/use-agent-view.ts)
- [api.ts](/home/kk/dev/agents/mynano-agent/frontend/api/conversations/api.ts)
- [view-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/agent/view-state.ts)
- [agent-state.ts](/home/kk/dev/agents/mynano-agent/frontend/types/agent-state.ts)

这里已经具备：

- cancel 的前端状态类型
- `session.cancelled` reducer
- 请求层边界

所以现在不是“从零做 cancel”，而是：

## 把缺的桥接层补齐

---

## 3. 当前真正缺什么

还缺 4 件事：

1. active session 注册表
2. cancel API
3. 前端真正调用 cancel API
4. cancel 联调验证

这个顺序不要乱。

---

## 4. 第一步：做 active session 注册表

### 为什么先做这个

因为后端要想取消某个 run，必须先能找到那次 run 对应的 `AgentSession`。

你现在的问题是：

- 在 [conversations.ts](/home/kk/dev/agents/mynano-agent/src/handlers/conversations.ts) 里，session 只存在于当前 SSE 请求上下文里
- 一旦你要做 `POST /api/conversations/:id/cancel`，就需要从别的请求里找到它

所以必须先做一个运行中的 session 注册表。

### 推荐放在哪里

建议新增：

- `src/agent/application/active-session-store.ts`

原因：

- 它不是 agent core 协议
- 它也不是 session 内部状态
- 它是应用层运行时索引

### 这个模块该负责什么

只做最小职责：

- `set(conversationId, session)`
- `get(conversationId)`
- `delete(conversationId)`

如果你要更稳一点，可以再加：

- `has(conversationId)`

不要一上来做复杂 map of maps。

### 推荐接口

```ts
export class ActiveSessionStore {
  set(conversationId: string, session: AgentSession): void;
  get(conversationId: string): AgentSession | undefined;
  delete(conversationId: string): void;
}
```

### 接入位置

在 [conversations.ts](/home/kk/dev/agents/mynano-agent/src/handlers/conversations.ts) 里：

1. `createSession()` 后注册
2. run 结束时删除
3. 出错时删除
4. cancelled 时也删除

### 这一阶段完成标准

你要能回答：

- 现在给定一个 `conversationId`，后端能不能找到当前正在运行的 session

如果还不能，就不要进入下一步。

---

## 5. 第二步：做 cancel API

### 放在哪里

还是放在：

- [conversations.ts](/home/kk/dev/agents/mynano-agent/src/handlers/conversations.ts)

因为这是 conversation 范畴的控制动作。

### 推荐接口

```text
POST /api/conversations/:id/cancel
```

返回可以很简单：

```json
{ "success": true }
```

如果没有找到 active session：

```json
{ "success": false, "error": "No active run" }
```

### 这个 handler 该做什么

只做桥接：

1. 校验当前用户有权限
2. 用 `conversationId` 去 active session store 取 session
3. 调 `session.cancel("Cancelled by user")`
4. 返回结果

### 这个 handler 不该做什么

- 不直接改 session 内部字段
- 不直接改 conversation status
- 不自己发 `session.cancelled`

这些都应该由 session/runner/recorder 链路自然完成。

### 这一阶段完成标准

你要能回答：

- 前端之外的任意请求，现在能不能独立触发后端取消

如果只能靠 `AbortController`，说明还没做完。

---

## 6. 第三步：把 active session store 接入现有流

你现在要回到 [conversations.ts](/home/kk/dev/agents/mynano-agent/src/handlers/conversations.ts)，把 store 接到现有 streaming 流程里。

### 推荐接入点

#### run 开始时

```ts
const session = await agent.createSession(...)
activeSessionStore.set(conversationId, session)
```

#### run 正常结束时

```ts
activeSessionStore.delete(conversationId)
```

#### run failed 时

```ts
activeSessionStore.delete(conversationId)
```

#### run cancelled 时

也要删掉。

### 一个重要注意点

删除动作建议放在 `finally` 收口，不要散在多个分支里重复写很多次。

比如你的流处理结构里，最好最终有一个统一清理点：

```ts
try {
  ...
} catch (error) {
  ...
} finally {
  activeSessionStore.delete(conversationId)
}
```

### 这一阶段完成标准

你要能回答：

- 一个 conversation 的 run 不管成功、失败还是取消，active session 引用会不会残留

如果会残留，后面很容易出脏状态。

---

## 7. 第四步：确认 recorder 正确落 cancelled

现在去看：

- [conversation-run-recorder.ts](/home/kk/dev/agents/mynano-agent/src/agent/application/conversation-run-recorder.ts)

它现在已经能识别：

- `session.completed`
- `session.failed`
- `session.cancelled`

你现在要确认两件事：

### 1. 终态有没有被记录

`terminalStatus` 是否在 `session.cancelled` 时设成了 `cancelled`

### 2. handler 最终有没有用这个状态落库

也就是 [conversations.ts](/home/kk/dev/agents/mynano-agent/src/handlers/conversations.ts) 最终更新 conversation status 时，是否优先使用 recorder 的 terminal status。

### 目标效果

取消时最终应当是：

```ts
await conversationService.updateConversationStatus(conversationId, "cancelled")
```

而不是：

```ts
await conversationService.updateConversationStatus(conversationId, "failed")
```

### 这一阶段完成标准

你要能回答：

- 一次用户主动取消，数据库最后状态是不是 `cancelled`

---

## 8. 第五步：前端真正发 cancel 请求

现在去看：

- [use-agent-view.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/agent/use-agent-view.ts)
- [api.ts](/home/kk/dev/agents/mynano-agent/frontend/api/conversations/api.ts)

### 你现在的问题

当前 `cancelRun()` 大概率还是：

- 本地 `abort()`

这只能停掉浏览器请求，不等于通知后端真正取消。

### 正确做法

在 `frontend/api/conversations/api.ts` 加一个请求：

```ts
export async function cancelConversationRun(apiBaseUrl: string, conversationId: string) {
  ...
}
```

然后在 [use-agent-view.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/agent/use-agent-view.ts) 里：

1. 先取当前 `threadId`
2. 调 cancel API
3. 再 abort 当前流

顺序建议是：

```text
先通知后端
再断开本地 SSE
```

不要反过来。

### 为什么

如果先 abort，本地可能立刻断流，后端取消请求反而没发出去。

### 这一阶段完成标准

你要能回答：

- 用户点击取消时，后端有没有真的收到一条独立 cancel 请求

---

## 9. 第六步：前端状态正确展示 cancelled

现在去看：

- [run-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/agent/run-state.ts)
- [agent-state.ts](/home/kk/dev/agents/mynano-agent/frontend/types/agent-state.ts)
- [agent-workspace.tsx](/home/kk/dev/agents/mynano-agent/frontend/components/agent-studio/agent-workspace.tsx)

### 你要确认的点

#### 1. 状态类型

`AgentSession.status` 里有：

- `cancelled`

#### 2. reducer

`applyAgentEvent()` 里有：

- `session.cancelled -> state.session.status = "cancelled"`

#### 3. 取消按钮逻辑

本地 cancel 后不要再把它映射成 failed。

#### 4. UI 展示

状态 badge、错误展示、空状态文案都要区分：

- `failed`
- `cancelled`

### 很重要的一条

取消不是错误。

所以：

- cancelled 时一般不应该把 `error` 文案挂成红色错误语义

### 这一阶段完成标准

你要能回答：

- 用户现在看到的是“已取消”，还是“报错”

如果还是“报错”，说明语义没打通。

---

## 10. 第七步：把 onAbort 和正式 cancel 区分清楚

你现在有两类取消来源：

### 1. 用户主动点击取消

这是正式取消：

- 调 cancel API
- 状态应为 `cancelled`

### 2. 浏览器断线 / tab 关闭 / 网络中断

这个可以继续保留：

- `stream.onAbort() -> session.cancel("Client disconnected")`

但你要意识到：

- 这是“连接中断触发取消”
- 不完全等同于“用户点击取消”

第一阶段可以先都归到 `cancelled`，没有问题。

但最好 reason 不一样：

- `Cancelled by user`
- `Client disconnected`

这样以后排查更清楚。

---

## 11. 第八步：补测试

你现在至少补这几类测试。

### 后端

#### 1. active session store

- set/get/delete

#### 2. cancel endpoint

- 有 active session 时返回 success
- 没有 active session 时返回明确失败

#### 3. runner

这个你已经有基础测试了，继续确认：

- cancellation request 命中后不再继续发模型请求

#### 4. tool executor

这个你也已经有基础测试了，继续确认：

- cancellation 后不再执行后续 tools

### 前端

#### 5. studio state reducer

- 收到 `session.cancelled` 时状态变成 `cancelled`

#### 6. use-agent-view

- 点击取消时，会先发 cancel API，再中断本地流

---

## 12. 最终验收清单

做到最后，你按下面清单验收。

### 后端

- 有 active session store
- 有 cancel endpoint
- session 能响应取消
- runner 能收敛为 cancelled
- tool executor 不继续启动后续工具
- conversation 最终状态能写成 cancelled

### 前端

- 有正式 cancel 请求
- reducer 能处理 `session.cancelled`
- UI 展示 cancelled
- 不再把取消显示成 failed

### 联调

- 普通运行中取消成功
- tool 执行链中取消成功
- 浏览器断线能触发取消
- cancelled 和 failed 可以明确区分

---

## 13. 建议你实际开发时的顺序

不要边想边乱改，按这个顺序最稳：

1. 新建 `active-session-store.ts`
2. 在 `conversations.ts` 接入 active session store
3. 增加 `POST /api/conversations/:id/cancel`
4. 验证后端单独 cancel 能工作
5. 前端 client 增加 `cancelConversationRun()`
6. 前端 `use-agent-view.ts` 改 `cancelRun()`
7. 验证前端点击取消
8. 最后补测试

---

## 14. 你现在最该做的第一步

不是先改前端。

是先做：

## `active-session-store.ts` + `cancel endpoint`

因为只要后端不能按 `conversationId` 找到正在运行的 session，前端所有 cancel 按钮都只是表面动作。

---

## 15. 读代码顺序

建议按这个顺序边读边做：

1. [session.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/session.ts)
2. [runtime-state.ts](/home/kk/dev/agents/mynano-agent/src/agent/session/runtime-state.ts)
3. [runner.ts](/home/kk/dev/agents/mynano-agent/src/agent/orchestration/runner.ts)
4. [tool-executor.ts](/home/kk/dev/agents/mynano-agent/src/agent/tools/tool-executor.ts)
5. [conversation-run-recorder.ts](/home/kk/dev/agents/mynano-agent/src/agent/application/conversation-run-recorder.ts)
6. [conversations.ts](/home/kk/dev/agents/mynano-agent/src/handlers/conversations.ts)
7. [use-agent-view.ts](/home/kk/dev/agents/mynano-agent/frontend/hooks/agent/use-agent-view.ts)
8. [api.ts](/home/kk/dev/agents/mynano-agent/frontend/api/conversations/api.ts)
9. [run-state.ts](/home/kk/dev/agents/mynano-agent/frontend/state/agent/run-state.ts)

---

## 16. 最后一句判断标准

当你做到：

- 用户点击取消
- 后端确实停止推进
- conversation 落库为 `cancelled`
- 前端明确显示 `cancelled`

这时才叫：

## cancel 功能完成
