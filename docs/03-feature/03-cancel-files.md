# 取消文件

这份文档只讲一件事：

## 取消 Agent Run 这个 feature，逐文件应该怎么设计

不是直接给你实现代码，而是告诉你：

- 每个文件为什么要改
- 每个文件改完后承担什么职责
- 它和上下游怎么衔接

这样你自己动手时，不容易改着改着又散掉。

---

## 1. 先定总原则

这个 feature 的核心原则只有 4 条：

1. `cancelled` 是正式状态，不是失败
2. `session` 拥有取消真相
3. `handler` 只桥接取消，不拥有取消逻辑
4. `service/repository` 只负责持久化取消结果

你改任何文件时，都不能偏离这 4 条。

---

## 2. 文件改动总览

建议按这个顺序推进：

```text
src/agent/core/types.ts
src/agent/core/events.ts
src/types/conversation.ts
src/agent/session/session.ts
src/tools/context.ts
src/tools/definitions.ts
src/handlers/conversations.ts
src/services/conversation-service.ts
src/repositories/conversation-repository.ts
frontend/hooks/agent/use-agent-view.ts
```

顺序不要乱。

因为这是：

- 先语义
- 再状态机
- 再工具协作
- 再桥接层
- 再持久化
- 最后前端

---

## 3. `src/agent/core/types.ts`

### 为什么要改

因为这里定义的是 agent 的正式运行契约。

如果这里不先改，后面所有实现都会变成临时拼接。

### 这里应该改什么

#### 1. 给 `AgentStatus` 增加 `cancelled`

因为取消必须成为正式状态。

#### 2. 给 `AgentSession` 接口增加 `cancel()`

因为 session 才是运行控制拥有者。

### 改完后的职责

这个文件负责回答：

- Agent 有哪些正式运行状态
- Session 暴露哪些正式控制能力

### 它和上下游怎么衔接

- `core/events.ts` 会基于它补取消事件
- `session/session.ts` 会按这个契约实现取消
- 前端状态映射也会依赖这个状态集合

---

## 4. `src/agent/core/events.ts`

### 为什么要改

因为系统现在需要明确表达：

- 这次运行不是失败，而是被取消

### 这里应该改什么

新增一个正式事件：

- `session.cancelled`

建议事件里带：

- `sessionId`
- `reason`

### 改完后的职责

这个文件负责回答：

- Session 取消时，对外广播什么协议

### 它和上下游怎么衔接

- `session/session.ts` 负责发这个事件
- `handlers/conversations.ts` 负责接收这个事件并落库
- 前端负责把它显示成“已取消”

---

## 5. `src/types/conversation.ts`

### 为什么要改

因为 conversation 持久化状态也必须承认：

- cancelled 是正式状态

### 这里应该改什么

给 `PersistedConversationStatus` 增加：

- `cancelled`

### 改完后的职责

这个文件负责回答：

- conversation 在数据库和服务层有哪些合法状态

### 它和上下游怎么衔接

- `conversation-service.ts` 会写这个状态
- `repository.ts` 会存这个状态
- 前端 hydrate conversation 状态时会读到这个状态

---

## 6. `src/agent/session/session.ts`

### 为什么要改

这是这个 feature 的核心文件。

因为只有 session 真正拥有运行时控制权。

### 这里应该改什么

建议分 4 块来想。

#### 1. 增加取消状态

你需要让 session 内部能表达：

- 是否已经收到取消请求
- 取消原因是什么

这里的关键不是字段名，而是：

- 这个状态必须由 session 自己持有

#### 2. 增加 `cancel()` 方法

职责：

- 标记取消请求
- 记录 reason
- 为后续主循环退出提供依据

#### 3. 在关键节点做取消检查

至少检查这些点：

- 每轮 step 开始前
- LLM 返回后
- 每个工具执行前
- 每个工具执行后

为什么这些点最关键：

- 能阻止继续推进主循环
- 能阻止新的工具被启动

#### 4. 增加取消退出路径

你现在已经有：

- `completeSession`
- `failSession`

还需要一个：

- `cancelSession`

它的职责是：

- 把状态切成 `cancelled`
- 设置结束时间
- emit `session.cancelled`
- 结束本次运行

### 改完后的职责

`session/session.ts` 要负责回答：

- 这次运行是否还允许继续推进
- 这次运行最终是 completed / failed / cancelled 哪一种

### 它和上下游怎么衔接

- 向下：通知 tool 层当前已取消
- 向上：向 handler 发出 `session.cancelled`

### 这里最容易犯的错

#### 错误 1

到处写零散的：

```ts
if (cancelled) return
```

这样后面会非常难维护。

#### 错误 2

把取消当普通 error 抛出去。

取消和失败必须分流。

---

## 7. `src/tools/context.ts`

### 为什么要改

因为 session 的取消状态需要向工具层传递。

但工具层不能直接依赖 `AgentSession` 类本身。

### 这里应该改什么

给 `ToolContext` 增加“最小取消感知能力”。

推荐方向：

- `isCancelled()`

如果后面要做更强中断，再考虑：

- `signal`

### 改完后的职责

这个文件负责回答：

- 工具在执行时能感知哪些运行时控制信息

### 它和上下游怎么衔接

- `core/runtime.ts` / `session/session.ts` 负责把取消感知能力传下来
- `definitions.ts` 使用这个能力

---

## 8. `src/tools/definitions.ts`

### 为什么要改

因为有些工具是耗时动作。

取消如果传不到工具层，就还是假取消。

### 这里应该改什么

不是每个工具都大改。

第一阶段只做最小协作：

- 在耗时工具开始前检查取消
- 避免已取消后继续启动新的耗时操作

重点关注：

- `web_search`
- `delegate_to_subagent`
- `bash`

### 改完后的职责

这个文件负责回答：

- 工具在已取消状态下是否还应该继续执行

### 它和上下游怎么衔接

- 从 `ToolContext` 读取取消感知
- 被 `session/session.ts` 间接驱动执行

### 注意

第一阶段不要在这里过度追求“强杀所有 IO”。

先把：

- 不继续新开动作
- 能感知取消

做好。

---

## 9. `src/handlers/conversations.ts`

### 为什么要改

因为 HTTP 层需要一个地方把“用户取消意图”转给正在运行的 session。

### 这里应该改什么

建议拆成两个思考点。

#### 1. active session registry

你需要能根据：

- `conversationId`

找到：

- 当前活跃的 `AgentSession`

否则取消请求进来时，找不到目标。

#### 2. cancel 路由或取消入口

你需要一个正式入口，例如：

- `POST /api/conversations/:id/cancel`

第一阶段哪怕你先只做：

- `stream.onAbort()` 时触发 `session.cancel()`

也比现在强。

但正式版本还是建议有独立 cancel endpoint。

### 改完后的职责

这个文件负责回答：

- 用户的取消意图如何进入 runtime

### 它和上下游怎么衔接

- 向下：调用 `session.cancel()`
- 向上：把 `session.cancelled` 事件推给前端
- 向旁边：通知 service 持久化状态

### 这里最容易犯的错

把取消逻辑大量写在 handler 里。

记住：

- handler 只桥接
- session 才拥有真相

---

## 10. `src/services/conversation-service.ts`

### 为什么要改

因为业务层必须正式承接：

- 这次 conversation run 被取消了

### 这里应该改什么

重点是：

- 支持把 conversation 状态更新为 `cancelled`

如果你后面还想增强，可以再考虑：

- 记录取消原因
- 记录取消时间

但第一阶段先不用加复杂字段。

### 改完后的职责

这个文件负责回答：

- 取消在业务记录上意味着什么

### 它和上下游怎么衔接

- 上游从 handler 接收 `session.cancelled`
- 下游调用 repository 持久化状态

---

## 11. `src/repositories/conversation-repository.ts`

### 为什么要改

因为 repository 需要支持存储新的 conversation 状态。

### 这里应该改什么

通常不需要大改逻辑。

重点只是：

- 允许 `cancelled` 作为合法状态被写入和读取

### 改完后的职责

这个文件负责回答：

- cancelled 如何进入数据库

### 它和上下游怎么衔接

- 上游接 service
- 下游接真实表结构

### 注意

不要把业务判断写进 repository。

---

## 12. `frontend/hooks/agent/use-agent-view.ts`

### 为什么要改

因为前端现在只有：

- 本地中断 SSE

但没有：

- 正式向后端请求取消

### 这里应该改什么

建议分两步：

#### 1. 保留当前 `AbortController`

它仍然有意义，因为可以立刻停止浏览器侧读取。

#### 2. 增加正式 cancel 请求

取消按钮触发时：

- 请求后端 cancel endpoint
- 同时中止 SSE 读取

### 改完后的职责

这个文件负责回答：

- 用户点击取消时，前端如何发送意图并更新本地状态

### 它和上下游怎么衔接

- 向后端发 cancel 请求
- 接收 `session.cancelled` 或下一次 hydration 里的 `cancelled`

### 注意

前端不能自己宣布“这次一定已经取消成功”。

必须以后端状态为准。

---

## 13. 如果你想更稳，建议加一个隐藏文件位

这不是第一阶段必须做，但你脑子里要有这个位置：

## active run map / session registry

它的作用：

- 管理哪些 conversation 当前有活跃 session
- 支持 cancel 请求精准命中目标 session

这个能力可以暂时先放在 handler 模块附近。

不用一上来就抽很大。

---

## 14. 逐文件改造时的验收顺序

你每改完一层，都问自己这个问题：

### 第一关：语义对不对

- cancelled 是不是已经成为正式状态

### 第二关：状态机对不对

- session 收到取消后是不是不再继续推进

### 第三关：链路对不对

- handler 能不能把取消意图送到正确 session

### 第四关：持久化对不对

- conversation 状态是不是能写成 cancelled

### 第五关：前端语义对不对

- 前端是不是把取消和失败区分开了

---

## 15. 一句话总结

如果你按文件去推进这个 feature，最重要的不是“每个文件都改一点”。

而是：

## 每个文件都只改它该承担的那部分职责

这样你做完取消之后，系统会更清楚，不会更乱。
