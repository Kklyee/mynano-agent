# 重组结果

这份文档记录当前已经完成的重组。

## 已完成

### 1. Tool 系统拆成三层

- `src/tools/context.ts`
- `src/tools/definitions.ts`
- `src/tools/builtins.ts`

效果：

- tool 契约不再绑在 `builtins.ts`
- 工具实现和导出入口分开

### 2. Session 辅助同步逻辑抽出

新增：

- `src/agent/session-sync.ts`

效果：

- task/background 事件差异逻辑不再直接堆在 `session.ts` 末尾

### 3. Runtime 依赖更清楚

- `runtime.ts` 和 `tool-registry.ts` 直接依赖 `context.ts`

## 这次没有动

- HTTP 协议
- 数据库结构
- 前端事件协议
- session 主循环语义

