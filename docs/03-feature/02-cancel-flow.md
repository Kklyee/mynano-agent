# 取消流程

这份文档讲取消 Agent Run 时，各层应该怎么思考。

## 状态流

```text
用户点击取消
  -> 前端发 cancel 请求
  -> handler 找到 active session
  -> session 标记 cancelRequested
  -> 主循环停止继续推进
  -> tool 层感知取消
  -> service 持久化 cancelled
  -> 前端展示已取消
```

## 各层职责

### `types.ts`

- 承认 `cancelled` 是正式状态

### `events.ts`

- 增加 `session.cancelled`

### `session.ts`

- 持有取消状态
- 负责受控退出
- 停止后续 step 推进

### `tools/*`

- 提供最小取消感知
- 避免已取消后继续启动新的耗时动作

### `handlers/conversations.ts`

- 接收取消意图
- 找到 active session
- 调用 `session.cancel()`

### `conversation-service.ts`

- 把 conversation 状态写成 `cancelled`

### 前端

- 发 cancel 请求
- 停止 SSE 读取
- 区分 `cancelled` 和 `failed`

## 第一阶段成功标准

1. Session 不再继续新的 step
2. conversation 状态能写成 `cancelled`
3. 前端能显示已取消
4. 取消不再被当作失败

