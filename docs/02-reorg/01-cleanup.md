# Agent 整洁判断

这份文档回答一个问题：

## 现在的 agent 代码到底乱不乱

## 结论

不是完全乱，但已经到了继续加功能就会明显变乱的临界点。

## 为什么会有这种感觉

### 1. `session.ts` 开始变厚

它同时承载：

- 主循环
- 状态管理
- 工具执行
- 事件发射
- task/background 状态同步

### 2. Tool 横切能力还没收口

后面会继续加：

- cancel
- timeout
- retry
- trace
- policy

如果没有固定落点，工具系统会越来越乱。

### 3. Handler 正在变成事件翻译脚本

`handlers/conversations.ts` 同时连接：

- HTTP
- SSE
- Session
- Service
- DB

它天然容易继续膨胀。

## 哪些复杂度是正常的

- session 文件比普通模块长，这是正常的
- 工具数量多，也是正常的
- conversation handler 比普通 CRUD 厚，也正常

真正的问题不是文件长，而是职责边界是否开始失焦。

## 收敛目标

- `session` 越来越像状态机
- `tools` 越来越像执行框架
- `handler` 越来越像桥接层

