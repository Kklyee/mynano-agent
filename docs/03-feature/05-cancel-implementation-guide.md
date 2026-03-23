# Cancel 实现指南

这份文档不是讲“如何把已经输出到前端的字撤回”。

因为在流式输出里，已经发给前端、已经画到 UI 上的内容，本质上就已经提交了，不能假装它没发生。

所以这个项目里 `cancel` 的正确语义应该是：

- 保留已经产生并已经发送的内容
- 停止后续 token 继续生成
- 停止后续 tool call 继续启动
- 停止这次 run 继续推进到 completed
- 最终把 run 标成 `cancelled`，而不是 `failed`

一句话定义：

`cancel` 不是“回滚已有输出”，而是“受控结束当前 run”。

## 1. 先统一产品语义

先把语义定死，不然后面每层都会乱。

### 用户点击取消以后，系统应该表现成什么

1. 如果前端已经收到一部分 assistant 文本，这部分文本保留。
2. 后端收到取消请求后，不再继续生成新的文本。
3. 如果模型已经返回了一批 tool calls，还没开始执行的 tool 不再执行。
4. 如果某个耗时工具已经在跑：
   - 理想情况：它能收到 abort signal 并尽快停下。
   - 最低可接受情况：它继续跑完，但结果不再驱动后续 agent 继续推进。
5. 这次运行最后状态是 `cancelled`。
6. 前端 UI 要明确显示“已取消”，不能显示成“失败”。

### 你要接受的现实约束

- 已经渲染到前端的字，不能回收。
- 已经发出的 SSE chunk，不能撤回。
- 已经启动的外部请求，不一定都能强制中断，取决于调用方是否支持 abort。

所以你做 cancel 时，不要追求“绝对撤销”，要追求“停止未来动作”。

## 2. 先看你现在项目里的结构

你现在这套 agent 更接近“分层 + 会话驱动”的结构。

### 后端主链路

```text
frontend/hooks/agent/use-agent-view
  -> POST /api/conversations/:id/messages
    -> handlers/conversations.ts
      -> agent.createSession()
        -> AgentSession
          -> AgentRunner
            -> AgentModelClient
            -> AgentToolExecutor
      -> ConversationRunRecorder
        -> ConversationService
          -> ConversationRepository
```

### 当前 cancel 相关模块

- `frontend/hooks/agent/use-agent-view.ts`
  现在只会 abort 当前 fetch
- `frontend/api/agent-native-client.ts`
  现在把 cancel 当成 failed
- `src/handlers/conversations.ts`
  现在只在 `stream.onAbort()` 时调用 `session.cancel()`
- `src/agent/session/session.ts`
  现在只负责记录取消请求
- `src/agent/session/runtime-state.ts`
  现在有 `requestCancellation()` 和 `cancel()`
- `src/agent/orchestration/runner.ts`
  现在会在循环检查点收敛成 `session.cancelled`
- `src/agent/tools/tool-executor.ts`
  现在只会阻止“下一个 tool”启动

所以现在的问题不是“完全没有 cancel”，而是：

- 语义没闭环
- 前端没接住 `cancelled`
- 后端没有正式 cancel API
- 模型层和工具层没有真正 abort 通道

## 3. 各模块应该负责什么

这里最关键。

### 前端

前端负责两件事：

- 发送取消意图
- 展示 `cancelled` 终态

前端不负责宣布“这次一定取消成功了”。

正确做法是：

- 点击取消时，立刻进入一种“cancelling”或继续保持 `running` 但禁用输入
- 向后端发正式 cancel 请求
- 等后端 SSE 发来 `session.cancelled`，再真正落成 `cancelled`

### Handler / Route

handler 只负责桥接取消意图，不负责内部取消逻辑。

它的职责应该是：

- 找到正在运行的 session
- 调用 `session.cancel(reason)`
- 把结果返回给前端

不要把取消状态机大量写在 handler 里。

### Session

session 是 cancel 真相源。

它应该负责：

- 记录“是否收到取消请求”
- 保存取消原因
- 暴露 abort signal 或 cancellation context 给下层

### Runner

runner 负责把取消请求收敛成正式终态。

它应该负责：

- 在关键检查点停机
- 区分 `cancelled` 和 `failed`
- 发出 `session.cancelled`

### Model Client

model client 负责“尽量停掉还在生成的模型调用”。

它应该负责：

- 接收 abort signal
- 把 abort 传给模型 SDK / fetch
- 在 abort 时抛出可识别的取消错误，或者返回明确的取消结果

### Tool Executor / Tools

tool executor 负责“不要再启动新的工具”，工具本身负责“如果支持，就尽快停下来”。

要分清两层：

- executor 层：不要再启动新的 tool
- tool 层：支持中断的工具尽量中断

## 4. 推荐你采用的实现顺序

不要一上来就改所有文件。

按这个顺序做，最稳：

1. 前端先接住 `cancelled` 终态
2. 后端补正式 cancel API 和活动 session 注册表
3. runner / session 把取消链路收敛完整
4. model client 补 abort signal
5. tool executor / tools 补取消感知
6. 最后补测试

这个顺序的原因很简单：

- 先把状态语义走通
- 再做真正的执行中断
- 否则你会先陷入底层 abort 细节，但用户界面还是错的

## 5. 模块一：前端应该怎么改

### 目标

让前端明确区分：

- `running`
- `cancelling`（可选）
- `cancelled`
- `failed`

### 先改类型

文件：

- `frontend/types/agent-state.ts`

要做的事：

1. 给 `AgentBackendEvent` 增加 `session.cancelled`
2. 给 `AgentSession.status` 增加 `cancelled`
3. 如果你想让交互更稳，也可以加 `cancelling`

建议状态：

```ts
status: "idle" | "connecting" | "running" | "cancelling" | "completed" | "failed" | "cancelled"
```

### 再改事件归并

文件：

- `frontend/api/agent-native-client.ts`

要做的事：

1. `cancelAgentRun()` 不要再复用 `failAgentRun()`
2. 单独实现 `cancelAgentRun()`
3. `applyAgentEvent()` 里增加 `session.cancelled`

推荐语义：

- 用户本地点击取消后：
  - 先把状态设成 `cancelling`
- 收到后端 `session.cancelled` 后：
  - 再把状态设成 `cancelled`

不要在本地一点击就直接落成 `cancelled`，因为取消请求可能失败。

### 再改 hook

文件：

- `frontend/hooks/agent/use-agent-view.ts`

当前问题：

- 现在 `cancelRun()` 只是 `abortRef.current?.abort()`

这只会断掉当前连接，不是正式 cancel 协议。

应该改成：

1. 如果有当前 `threadId`
2. 调用 `POST /api/conversations/:id/cancel`
3. 同时中止当前 SSE 连接，避免前端继续读流
4. 本地状态切到 `cancelling`

注意：

- `abort()` 可以保留，但它只是辅助动作，不是唯一 cancel 入口

### UI 层怎么展示

文件：

- `frontend/components/agent-studio/agent-studio.tsx`
- 以及状态展示相关组件

展示原则：

- 已输出的 assistant 文本照常展示
- 输入框恢复可编辑
- 顶部或消息尾部显示“已取消”
- 不要弹成 error

## 6. 模块二：后端入口应该怎么改

### 目标

让取消不再依赖“断开当前 SSE 连接”，而是有正式入口。

### 需要新增一个 Active Session Registry

建议新增模块：

- `src/agent/application/active-session-registry.ts`

职责很简单：

- `set(conversationId, session)`
- `get(conversationId)`
- `delete(conversationId)`

为什么一定要有它：

因为取消请求和消息流请求不一定来自同一个 HTTP 连接。

没有 registry，`POST /cancel` 进来时你根本找不到正在运行的 session。

### 然后补正式 cancel 路由

文件：

- `src/handlers/conversations.ts`

新增：

```text
POST /api/conversations/:id/cancel
```

handler 逻辑只做这些事：

1. 校验 conversation 属于当前用户
2. 从 registry 找 session
3. 如果没找到：
   - 返回“当前没有运行中的 session”之类的结果
4. 如果找到了：
   - `await session.cancel("Cancelled by user")`
   - 返回成功

### `messages` 路由也要配合 registry

在 `POST /api/conversations/:id/messages` 里：

1. 创建 session 后注册到 registry
2. run 结束后无论成功 / 失败 / 取消，都从 registry 清理掉

这一步必须放 `finally`

否则 registry 会泄漏脏 session。

## 7. 模块三：Session 层应该怎么改

### 目标

让 session 不只是保存一个布尔标记，而是持有取消上下文。

### 现在最值得补的能力

文件：

- `src/agent/session/runtime-state.ts`
- `src/agent/session/session.ts`

建议新增：

- `AbortController`
- `AbortSignal`

例如在 state store 或 session 内持有：

```ts
private readonly abortController = new AbortController();
```

然后暴露：

```ts
getAbortSignal(): AbortSignal
```

当 `cancel()` 被调用时：

1. 记录取消原因
2. 调用 `abortController.abort(reason)`
3. 标记 cancellation requested

这样下游模型层和工具层才有机会感知“立刻停”。

### 为什么这里适合继续用 class

因为你这里已经是 session 对象模型：

- 有生命周期
- 有内部状态
- 有运行期依赖

这个 feature 跟随现有 class 风格最合理，不要为了“函数式纯洁”把它拆散。

## 8. 模块四：Runner 层应该怎么改

### 目标

把取消从“一个普通异常”变成“正式结束路径”。

文件：

- `src/agent/orchestration/runner.ts`

### Runner 里至少要有这些检查点

1. 开始一轮前检查
2. `contextManager.prepare()` 后检查
3. 模型返回后检查
4. tool calls 执行前检查
5. 每个 tool call 之间检查

为什么模型返回后也要检查：

因为用户可能在模型生成期间点了取消。

这时模型也许已经吐出部分结果。

你的策略应该是：

- 部分文本保留
- 但不再继续执行这条 assistant message 后续带来的 tools

### 一个关键原则

`cancelled` 不要走 `catch -> session.failed`

要单独分流。

做法一般有两种：

1. 不抛异常，runner 在检查点显式 `return this.state.cancel()`
2. 抛出专门的 `CancellationError`，在外层单独捕获

对于你现在这套代码，我更推荐第一种：

- 简单
- 可读
- 不会把取消和失败混起来

## 9. 模块五：Model Client 应该怎么改

### 目标

当用户点击取消时，尽量停掉正在生成的模型调用。

文件：

- `src/agent/model/model-client.ts`

### 这里要补的能力

1. `generate()` 接收取消上下文
2. 调用模型 SDK / fetch 时传入 `signal`
3. 如果底层报 abort：
   - 转成可识别取消
   - 不要按普通失败处理

典型接口形态可以是：

```ts
generate(messages, { signal })
```

### 你要注意一个现实

即使底层支持 abort，也可能已经收到一部分流内容。

这不矛盾。

正确语义依然是：

- 保留已收到内容
- 停掉未收到内容

### 如果你后面要做真正流式 token

那 model client 更要支持：

- `assistant.stream.started`
- `assistant.stream.delta`
- `assistant.stream.completed`
- 取消时结束流，不补全后续 delta

## 10. 模块六：Tool Executor 和工具层应该怎么改

### 目标

让取消后不再启动新的工具，并让支持中断的工具尽快停下。

文件：

- `src/agent/tools/tool-executor.ts`
- `src/tools/context.ts`
- 各个具体 tool

### executor 层应该做什么

1. 每次开始一个 tool 前检查取消
2. 每个 tool 执行完成后再检查取消
3. 取消后直接返回，不再推进后续工具

你这里第一点已经有了，但还不够。

### tool context 应该补什么

建议在 `ToolContext` 里补最小取消感知能力：

- `signal: AbortSignal`
- `isCancelled(): boolean`

然后把它一路传到真正的工具实现。

### 哪些工具必须优先支持取消

优先处理耗时工具：

- shell / command execution
- 网络请求
- 长轮询
- 文件大扫描
- 后台任务启动器

如果某个工具天然不支持中断，也没关系，最低要求是：

- 已取消后不再启动新的工具
- 当前工具跑完后，不再继续 agent 下一轮

## 11. Conversation 持久化层应该怎么改

### 目标

让数据库里的 run 状态也和 runtime 语义一致。

文件：

- `src/agent/application/conversation-run-recorder.ts`
- `src/services/conversation-service.ts`
- `src/repositories/conversation-repository.ts`

你现在 recorder 已经能接 `session.cancelled`，这个方向是对的。

但你要保证整条链路都一致：

1. 取消时 conversation 状态写成 `cancelled`
2. 不要落成 `failed`
3. 如有需要，记录取消原因和取消时间

如果你后面要更完整，可以在 conversation 表上补：

- `cancelReason`
- `cancelledAt`

这不是第一优先级，但对排查问题有用。

## 12. 你现在最适合的最小实现方案

如果你想先把 cancel 做到“够用”，不要一次做满。

### V1：先做语义闭环

目标：

- 用户点取消后，最终显示 `cancelled`
- 不再把取消显示成失败
- 不再启动新的 tool

需要改的模块：

- 前端状态机
- cancel endpoint
- active session registry
- runner 检查点

这版做完，已经能交付。

### V2：再做真正 abort

目标：

- 模型生成中途尽快停
- 耗时工具尽快停

需要改的模块：

- session abort signal
- model client signal 透传
- tool context signal 透传

### V3：再做体验优化

目标：

- UI 显示 cancelling
- 保留半截消息但标注“已中止”
- 更清晰的 trace / event log

## 13. 推荐你直接改的文件清单

### 前端

- `frontend/types/agent-state.ts`
- `frontend/api/agent-native-client.ts`
- `frontend/hooks/agent/use-agent-view.ts`
- `frontend/components/agent-studio/agent-studio.tsx`

### 后端入口

- `src/handlers/conversations.ts`
- `src/agent/application/active-session-registry.ts`（新增）

### agent runtime

- `src/agent/session/session.ts`
- `src/agent/session/runtime-state.ts`
- `src/agent/orchestration/runner.ts`
- `src/agent/model/model-client.ts`
- `src/agent/tools/tool-executor.ts`
- `src/tools/context.ts`

### 持久化

- `src/agent/application/conversation-run-recorder.ts`
- `src/services/conversation-service.ts`
- `src/repositories/conversation-repository.ts`

## 14. 测试应该怎么补

至少补这几类。

### 后端单测

1. 运行前已取消
2. 模型调用前取消
3. 模型返回后、tool 启动前取消
4. 多个 tool call 之间取消
5. 已结束 session 再 cancel 返回 false

### 接口测试

1. `POST /cancel` 能命中运行中的 session
2. 不存在运行中 session 时返回合理结果
3. 取消后 conversation 最终状态是 `cancelled`

### 前端状态测试

1. 点击取消后进入 `cancelling`
2. 收到 `session.cancelled` 后进入 `cancelled`
3. 不再显示成 `failed`

## 15. 一个简单的骨架参考

这里只给骨架，不直接铺满实现。

### registry

```ts
export class ActiveSessionRegistry {
  private readonly sessions = new Map<string, AgentSession>();

  set(conversationId: string, session: AgentSession) {
    this.sessions.set(conversationId, session);
  }

  get(conversationId: string) {
    return this.sessions.get(conversationId);
  }

  delete(conversationId: string) {
    this.sessions.delete(conversationId);
  }
}
```

### cancel route

```ts
app.post("/api/conversations/:id/cancel", requireAuth, async (c) => {
  const conversationId = c.req.param("id");
  const session = activeSessionRegistry.get(conversationId);

  if (!session) {
    return c.json({ cancelled: false, reason: "No active session" }, 409);
  }

  const cancelled = await session.cancel("Cancelled by user");
  return c.json({ cancelled });
});
```

### 前端状态处理

```ts
case "session.cancelled":
  state.session.status = "cancelled";
  state.session.error = null;
  return state;
```

## 16. 最后给你的工程判断

你这个项目的 cancel，不要定义成“撤销已显示文字”。

应该定义成：

- 允许保留已输出内容
- 阻止未来内容继续产生
- 阻止后续工具和后续轮次继续推进
- 最终把 run 收敛到 `cancelled`

这才是符合流式 agent 的正确实现。

如果你后面按这个文档做，我建议你先做 V1，不要一开始追求所有工具都可中断。

先把“状态语义正确”做出来，再做“执行中断更及时”。
