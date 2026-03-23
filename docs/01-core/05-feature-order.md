# Feature 实现顺序

这份文档只回答一个问题：

`后面开发一个新 feature，应该按什么顺序下手。`

## 1. 固定顺序

按这条顺序做：

1. 先定 feature 属于哪个业务目录
2. 先定类型和状态语义
3. 先补后端能力
4. 再补前端请求
5. 再补前端状态
6. 再补前端 hook
7. 最后改 UI
8. 最后做验证

不要反过来先改 UI。

## 2. 怎么判断 feature 落点

前端只看 3 类目录：

- `api/<biz>`
- `hooks/<biz>`
- `state/<biz>`

后端只看 4 类目录：

- `session`
- `orchestration`
- `application`
- `handlers`

先回答：

- 这个 feature 主要属于 `agent` 还是 `conversations`
- 它会不会引入新状态
- 它是走 HTTP 还是 SSE 事件

这三句答清楚，再动手。

## 3. 具体到前端

如果是前端 feature，顺序固定成：

1. `api/<biz>`
2. `state/<biz>`
3. `hooks/<biz>`
4. `components/*`

规则：

- `api` 只管请求和流
- `state` 只管状态和映射
- `hooks` 只管交互流程
- 页面只消费 hook

## 4. 具体到后端

如果是 agent runtime feature，顺序固定成：

1. `core/types` 或 `events`
2. `session / orchestration / tools`
3. `application`
4. `handlers`
5. 前端消费

规则：

- 先让系统里有这个概念
- 再让 runtime 真能跑
- 最后让 handler 和前端接住

## 5. 一个最实用的检查表

每次开始前，先回答这 4 句：

1. 这个 feature 属于哪个业务目录？
2. 它新增了什么状态？
3. 它通过什么接口或事件流动？
4. 页面最后只消费什么结果？

如果这 4 句答不清，先别写代码。

## 6. 以 cancel 为例

正确顺序就是：

1. 后端加 active session store
2. 后端加 cancel endpoint
3. 前端 `api/conversations/api.ts` 加 cancel 请求
4. 前端 `state/agent/run-state.ts` 接住 `session.cancelled`
5. 前端 `hooks/agent/use-agent-run.ts` 改 stop 行为
6. UI 显示 cancelled

## 7. 一句话总结

以后开发 feature，固定记住这句：

`先定边界，再定状态，再做后端，再接前端，最后碰 UI。`
