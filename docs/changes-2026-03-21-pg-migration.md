# 变更摘要：PostgreSQL + Drizzle ORM 迁移

**日期：** 2026-03-21
**分支：** main

## 概览

将数据库从 SQLite（原生 SQL 字符串）迁移到 PostgreSQL + Drizzle ORM，同时将代码结构重组为清晰的分层架构：`handler → service → repository → db`。

---

## 新增文件

| 文件 | 说明 |
|---|---|
| `drizzle.config.ts` | drizzle-kit 配置（schema 路径、migrations 输出目录、DATABASE_URL） |
| `src/db/schema/conversations.ts` | 7 张表的 Drizzle pgTable 定义 |
| `src/db/schema/index.ts` | 重新导出 conversations schema |
| `src/db/index.ts` | postgres.js 连接池 + drizzle 单例，启动时校验 DATABASE_URL |
| `src/repositories/conversation-repository.ts` | 基于 Drizzle query builder 的所有数据库操作 |
| `src/handlers/auth.ts` | `/api/auth/*` 和 `/api/me` 路由 |
| `src/handlers/conversations.ts` | 会话 CRUD + SSE 消息流路由 |
| `src/handlers/chat.ts` | 无状态 `/chat` 遗留路由 |

---

## 修改文件

| 文件 | 变更内容 |
|---|---|
| `package.json` | 添加依赖：`drizzle-orm`, `postgres`；开发依赖：`drizzle-kit` |
| `src/auth.ts` | 移除 `bun:sqlite` + `ensureAuthSchema`，改用 `drizzleAdapter(db, { provider: "pg" })` |
| `src/services/conversation-service.ts` | 所有方法改为 `async`，依赖从 `ConversationStore` 改为 `ConversationRepository`，移除 `close()` 方法 |
| `src/runtime/conversation-task-manager.ts` | 所有 `conversationService.*` 调用添加 `await` |
| `src/runtime/conversation-background-manager.ts` | 所有 `conversationService.*` 调用添加 `await`，`finishTask` 改为 `async` |
| `src/server.ts` | 移除 SQLite bootstrap，改为初始化 Drizzle db、挂载三个 handler router |
| `src/agent/runtime.ts` | `conversationService` 参数改为可选 |
| `src/agent/create-agent.ts` | 将 `options.conversationService` 传入 `AgentRuntime` |

---

## 删除文件

| 文件 | 原因 |
|---|---|
| `src/db/queries.ts` | 原始 SQL 字符串，被 repository 方法替代 |
| `src/db/schema.ts` | SQLite `CREATE TABLE` 语句，被 Drizzle schema 替代 |
| `src/stores/conversation-store.ts` | SQLite store（含双运行时兼容代码），被 repository + db/index.ts 替代 |

---

## 架构变化

```
之前：
  server.ts (内联路由) → ConversationService → ConversationStore → SQLite

之后：
  server.ts (挂载路由)
    ├── handlers/auth.ts         → better-auth
    ├── handlers/conversations.ts → ConversationService → ConversationRepository → Drizzle/PG
    └── handlers/chat.ts         → Agent（无持久化）
```

---

## 环境变量变更

| 旧变量 | 新变量 |
|---|---|
| `AUTH_DB_PATH` (SQLite auth 文件路径) | 移除 |
| `CONVERSATION_DB_PATH` (SQLite 会话文件路径) | 移除 |
| — | `DATABASE_URL=postgresql://user:pass@host:5432/db` (新增，必填) |

---

## 初始化步骤（首次部署）

```bash
# 1. 生成 SQL migration 文件
bunx drizzle-kit generate

# 2. 应用 migration 到 PostgreSQL
bunx drizzle-kit migrate

# 3. 创建 better-auth 表（users, sessions, accounts, verifications）
bunx better-auth migrate
```

---

## 提交记录

```
46f125e fix: make AgentRuntime conversationService optional; pass from options
7b71a0b feat: rewrite server.ts to mount handler routers and use drizzle db
6f35c45 feat: add handler files for auth, conversations, and chat routes
838963b feat: add await to service calls in runtime managers
ea6cab3 feat: async ConversationService with ConversationRepository; fix blockedBy JSON mapping
4a024a6 feat: migrate auth to drizzle adapter with postgresql
5e6e240 feat: add ConversationRepository with drizzle query builder
438c022 feat: add drizzle db connection singleton
7fb80cb feat: add drizzle schema for conversation tables
0dc7054 feat: add drizzle-kit config
45036ce chore: add drizzle-orm, postgres, drizzle-kit dependencies
```
