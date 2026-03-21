# Design: PostgreSQL + Drizzle ORM + Layered Architecture

**Date:** 2026-03-21
**Status:** Approved

## Overview

Migrate the conversation persistence layer from SQLite (raw SQL strings) to PostgreSQL with Drizzle ORM, and restructure the codebase into a clean layered architecture: `handler → service → repository → db`.

## Goals

- Replace SQLite + raw SQL strings with PostgreSQL + Drizzle ORM
- Migrate `better-auth` to the same PostgreSQL database
- Establish clear layer boundaries: handler, service, repository, db
- Split all HTTP routes from `server.ts` into domain-specific handler files
- Remove dual-runtime SQLite compatibility code (bun:sqlite vs node:sqlite)
- All service and repository methods are async (Promise-based)

## Directory Structure

```
src/
├── server.ts                        # Hono app setup, mount all routers, init db
├── auth.ts                          # better-auth + Drizzle PG adapter
│
├── db/
│   ├── index.ts                     # postgres.js connection + drizzle() singleton
│   ├── schema/
│   │   ├── conversations.ts         # all conversation-related tables (7 tables)
│   │   └── index.ts                 # re-export all schemas
│   └── migrations/                  # drizzle-kit generated SQL migration files
│
├── handlers/
│   ├── auth.ts                      # /api/auth/* routes + /api/me
│   ├── conversations.ts             # /api/conversations CRUD + SSE stream
│   └── chat.ts                      # /chat legacy stateless route
│
├── services/
│   └── conversation-service.ts      # business logic (ownership checks, prepareRun, etc.)
│
├── repositories/
│   └── conversation-repository.ts   # all DB operations via Drizzle query builder
│
├── app/            # unchanged (agent-loop.ts)
├── agent/          # unchanged
├── runtime/        # conversation-task-manager.ts and conversation-background-manager.ts modified (await additions only)
├── tools/          # unchanged
└── types/          # unchanged
```

### Files to Create

- `src/db/index.ts` — postgres.js + drizzle singleton, DATABASE_URL validation
- `src/db/schema/conversations.ts` — Drizzle pgTable definitions for all 7 conversation tables
- `src/db/schema/index.ts` — re-exports
- `drizzle.config.ts` — drizzle-kit configuration (project root)
- `src/handlers/auth.ts` — auth routes
- `src/handlers/conversations.ts` — conversation CRUD + SSE stream routes
- `src/handlers/chat.ts` — legacy /chat route
- `src/repositories/conversation-repository.ts` — Drizzle-based DB access

### Files to Modify

- `src/server.ts` — remove inline route definitions + remove `createConversationStore` instantiation + remove `ensureAuthSchema()` call; mount handler routers; init `db` from `db/index.ts`
- `src/auth.ts` — replace `new Database(authDbPath)` + better-auth SQLite config with `drizzleAdapter(db, { provider: "pg" })`; remove `getMigrations` / `ensureAuthSchema`
- `src/services/conversation-service.ts` — all methods become `async`, return `Promise<T>`; remove `close()` method
- `src/runtime/conversation-task-manager.ts` — add `await` to service calls (see Async Contract section)
- `src/runtime/conversation-background-manager.ts` — add `await` to service calls (see Async Contract section)
- `package.json` — add drizzle-orm, postgres; add drizzle-kit to devDependencies

### Files to Delete

- `src/db/queries.ts` — SQL strings moved into repository methods
- `src/db/schema.ts` — replaced by Drizzle schema definitions
- `src/stores/conversation-store.ts` — replaced by repository + db/index.ts

## Layer Responsibilities

### Handler (`src/handlers/*.ts`)

- Parse request params, query, body
- Enforce authentication via `requireAuth` middleware
- Call service methods
- Format HTTP responses and SSE streams
- No business logic, no direct DB access

### Service (`src/services/conversation-service.ts`)

- Enforce business rules: user ownership checks, data validation
- Orchestrate multiple repository calls when needed
- `prepareRun`: load conversation + message history + next sequence for agent session
- All methods are `async`, return `Promise<T>`
- No `close()` method — connection lifecycle handled at DB layer
- No HTTP concerns, no direct DB access

### Repository (`src/repositories/conversation-repository.ts`)

- Pure DB operations, no business logic
- One method per CRUD operation, all `async`
- Uses Drizzle query builder for all queries
- Complex queries (e.g. `getNextSequence` UNION ALL, `listConversations` with EXISTS subqueries) use Drizzle `sql` raw template tag
- Receives `db` instance via constructor (testable)

### DB (`src/db/index.ts` + `src/db/schema/`)

- Validates `DATABASE_URL` env var at startup — throws if missing
- Single `postgres(DATABASE_URL)` connection pool via postgres.js
- Single `drizzle(client)` instance exported as `db`
- Schema definitions using Drizzle `pgTable` helpers
- Migrations managed by `drizzle-kit generate` + `drizzle-kit migrate`
- No `close()` needed — postgres.js pool cleans up on process exit

## Data Flow

```
HTTP Request
    │
    ▼
Handler (src/handlers/*.ts)
  parse req → call service → format response
    │
    ▼
Service (src/services/conversation-service.ts)
  async business rules → ownership checks → orchestrate
    │
    ▼
Repository (src/repositories/conversation-repository.ts)
  Drizzle query builder → typed results
    │
    ▼
DB (src/db/index.ts)
  drizzle(postgres(DATABASE_URL))
```

## Server Bootstrap Change

Current `src/server.ts` startup:
```ts
const store = await createConversationStore(path)   // ← REMOVE
await ensureAuthSchema()                             // ← REMOVE
```

New startup:
```ts
import { db } from "./db/index.ts"                  // ← ADD (validates DATABASE_URL, creates pool)
// no schema bootstrap needed — handled by drizzle-kit migrate (run once, not at startup)
```

## Auth Migration

Replace `src/auth.ts` SQLite setup:
```ts
// REMOVE
const authDatabase = new Database(authDbPath, { create: true })
betterAuth({ database: authDatabase })
```

New setup:
```ts
import { db } from "./db/index.ts"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  // ... rest of config unchanged
})
```

Auth table creation: run `bunx better-auth migrate` once to create better-auth tables in PostgreSQL. Auth tables are **not** managed by drizzle-kit — they are managed exclusively by better-auth's own migration command. No `src/db/schema/auth.ts` file is needed.

## Async Contract

`ConversationService` methods currently return synchronously. After this refactor they return `Promise<T>`. The two runtime files that call the service must add `await` at specific callsites:

### `src/runtime/conversation-task-manager.ts`

```ts
// BEFORE:
const taskId = this.conversationService.getNextTaskId(...)
const persisted = this.conversationService.upsertTask(...)
return this.toTask(persisted, ...)

// AFTER:
const taskId = await this.conversationService.getNextTaskId(...)
const persisted = await this.conversationService.upsertTask(...)
return this.toTask(persisted, ...)
```

All calls to `conversationService` in this file: `getNextTaskId`, `upsertTask`, `listTasks`, `getTask` — all need `await`.

### `src/runtime/conversation-background-manager.ts`

All calls to `conversationService` in this file: `upsertBackgroundTask`, `listBackgroundTasks`, `getBackgroundTask` — all need `await`.

Note: `appendTaskEvent` and `appendBackgroundEvent` are called from *within* `ConversationService` itself (internal calls) — they do not appear in the runtime files and require no callsite changes.

## Drizzle Schema

### `src/db/schema/conversations.ts`

All 7 tables defined using `pgTable`. No foreign key CASCADE constraints — `deleteConversation` in the repository manually deletes child rows in dependency order before deleting the parent:

Delete order for `deleteConversation(id)`:
1. `conversation_background_events` WHERE conversation_id = id
2. `conversation_task_events` WHERE conversation_id = id
3. `conversation_background_tasks` WHERE conversation_id = id
4. `conversation_tasks` WHERE conversation_id = id
5. `conversation_tool_calls` WHERE conversation_id = id
6. `conversation_messages` WHERE conversation_id = id
7. `conversations` WHERE id = id

Tables and columns:

**`conversations`**
| column | type | constraints |
|---|---|---|
| id | text | PRIMARY KEY |
| user_id | text | NOT NULL |
| title | text | NOT NULL |
| status | text | NOT NULL |
| summary | text | nullable |
| message_count | integer | NOT NULL DEFAULT 0 |
| created_at | text | NOT NULL |
| updated_at | text | NOT NULL |
| last_message_at | text | nullable |

**`conversation_messages`**
| column | type | constraints |
|---|---|---|
| id | text | PRIMARY KEY |
| conversation_id | text | NOT NULL |
| role | text | NOT NULL |
| content | text | NOT NULL |
| sequence | integer | NOT NULL |
| status | text | NOT NULL |
| created_at | text | NOT NULL |

**`conversation_tool_calls`**
| column | type | constraints |
|---|---|---|
| id | text | PRIMARY KEY |
| conversation_id | text | NOT NULL |
| message_id | text | NOT NULL |
| name | text | NOT NULL |
| args_json | text | nullable |
| result_text | text | nullable |
| status | text | NOT NULL |
| sequence | integer | NOT NULL |
| started_at | text | NOT NULL |
| completed_at | text | nullable |

**`conversation_tasks`**
| column | type | constraints |
|---|---|---|
| conversation_id | text | NOT NULL |
| task_id | integer | NOT NULL |
| subject | text | nullable |
| description | text | nullable |
| status | text | NOT NULL |
| owner | text | nullable |
| blocked_by_json | text | NOT NULL DEFAULT '[]' |
| created_at | text | NOT NULL |
| updated_at | text | NOT NULL |
| PRIMARY KEY | (conversation_id, task_id) | composite |

**`conversation_task_events`**
| column | type | constraints |
|---|---|---|
| id | text | PRIMARY KEY |
| conversation_id | text | NOT NULL |
| task_id | integer | NOT NULL |
| subject | text | nullable |
| status | text | NOT NULL |
| sequence | integer | NOT NULL |
| updated_at | text | NOT NULL |

**`conversation_background_tasks`**
| column | type | constraints |
|---|---|---|
| conversation_id | text | NOT NULL |
| task_id | text | NOT NULL |
| command | text | nullable |
| summary | text | nullable |
| status | text | NOT NULL |
| started_at | text | NOT NULL |
| completed_at | text | nullable |
| exit_code | integer | nullable |
| PRIMARY KEY | (conversation_id, task_id) | composite |

**`conversation_background_events`**
| column | type | constraints |
|---|---|---|
| id | text | PRIMARY KEY |
| conversation_id | text | NOT NULL |
| task_id | text | NOT NULL |
| command | text | nullable |
| summary | text | nullable |
| status | text | NOT NULL |
| sequence | integer | NOT NULL |
| updated_at | text | NOT NULL |

Indexes:
- `conversations(user_id, updated_at DESC)`
- `conversation_messages(conversation_id, sequence ASC)`
- `conversation_tool_calls(conversation_id, sequence ASC)`
- `conversation_tasks(conversation_id, updated_at DESC, task_id DESC)`
- `conversation_task_events(conversation_id, sequence ASC)`
- `conversation_background_tasks(conversation_id, started_at ASC)`
- `conversation_background_events(conversation_id, sequence ASC)`

## Repository Interface with Input Types

```ts
// Input types
interface NewConversation {
  id: string; userId: string; title: string; status: string
  createdAt: string; updatedAt: string
}

interface TouchOpts {
  updatedAt: string; lastMessageAt: string
  messageCountDelta: number   // added to current message_count
  newTitle?: string           // applied only if current title is "New Conversation" or ""
}

interface NewMessage {
  id: string; conversationId: string; role: string; content: string
  sequence: number; status: string; createdAt: string
}

interface NewToolCall {
  id: string; conversationId: string; messageId: string; name: string
  argsJson?: string; resultText?: string; status: string
  sequence: number; startedAt: string; completedAt?: string
}

interface UpsertTask {
  conversationId: string; taskId: number; subject?: string; description?: string
  status: string; owner?: string; blockedByJson: string
  createdAt: string; updatedAt: string
}

interface NewTaskEvent {
  id: string; conversationId: string; taskId: number; subject?: string
  status: string; sequence: number; updatedAt: string
}

interface UpsertBackgroundTask {
  conversationId: string; taskId: string; command?: string; summary?: string
  status: string; startedAt: string; completedAt?: string; exitCode?: number
}

interface NewBackgroundEvent {
  id: string; conversationId: string; taskId: string; command?: string
  summary?: string; status: string; sequence: number; updatedAt: string
}

// Repository interface
interface ConversationRepository {
  createConversation(data: NewConversation): Promise<void>
  getConversation(id: string): Promise<Conversation | null>
  listConversations(userId: string): Promise<Conversation[]>
  touchConversation(id: string, opts: TouchOpts): Promise<void>
  updateConversationStatus(id: string, status: string): Promise<void>
  deleteConversation(id: string): Promise<void>

  appendMessage(data: NewMessage): Promise<void>
  listMessages(conversationId: string): Promise<Message[]>
  deleteConversationMessages(conversationId: string): Promise<void>

  appendToolCall(data: NewToolCall): Promise<void>
  completeLatestToolCall(conversationId: string, name: string, result: string, completedAt: string): Promise<void>
  listToolCalls(conversationId: string): Promise<ToolCall[]>
  deleteConversationToolCalls(conversationId: string): Promise<void>

  upsertTask(data: UpsertTask): Promise<void>
  listTasks(conversationId: string): Promise<Task[]>
  getTask(conversationId: string, taskId: number): Promise<Task | null>
  deleteConversationTasks(conversationId: string): Promise<void>

  appendTaskEvent(data: NewTaskEvent): Promise<void>
  listTaskEvents(conversationId: string): Promise<TaskEvent[]>
  deleteConversationTaskEvents(conversationId: string): Promise<void>

  upsertBackgroundTask(data: UpsertBackgroundTask): Promise<void>
  listBackgroundTasks(conversationId: string): Promise<BackgroundTask[]>
  getBackgroundTask(conversationId: string, taskId: string): Promise<BackgroundTask | null>
  deleteConversationBackgroundTasks(conversationId: string): Promise<void>

  appendBackgroundEvent(data: NewBackgroundEvent): Promise<void>
  listBackgroundEvents(conversationId: string): Promise<BackgroundEvent[]>
  deleteConversationBackgroundEvents(conversationId: string): Promise<void>

  getNextSequence(conversationId: string): Promise<number>
  getNextTaskId(conversationId: string): Promise<number>
}
```

## Handler Structure

### `src/handlers/conversations.ts`

```
GET    /api/conversations              → service.listConversations(userId)
POST   /api/conversations              → service.createConversation(userId, title?)
GET    /api/conversations/:id          → service.getConversationDetail(userId, id)
DELETE /api/conversations/:id          → service.deleteConversation(userId, id)
POST   /api/conversations/:id/messages → service.prepareRun(userId, id, prompt) + agent stream
```

### `src/handlers/auth.ts`

```
ALL  /api/auth      → better-auth handler
ALL  /api/auth/*    → better-auth handler
GET  /api/me        → return current user/session
```

### `src/handlers/chat.ts`

```
POST /chat          → legacy stateless agent run (no conversation persistence)
```

## `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

## `src/db/index.ts`

```ts
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index.ts"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required")

const client = postgres(url)
export const db = drizzle(client, { schema })
```

## Dependencies

```json
dependencies: {
  "drizzle-orm": "^0.41.0",
  "postgres": "^3.4.5"
}

devDependencies: {
  "drizzle-kit": "^0.30.0"
}
```

## Environment Variables

```
DATABASE_URL=postgresql://user:password@localhost:5432/mynano
```

Replaces:
- `AUTH_DB_PATH` (SQLite auth)
- `CONVERSATION_DB_PATH` (SQLite conversations)

## Migration Strategy

1. Define `src/db/schema/conversations.ts` with all 7 tables
2. Run `drizzle-kit generate` → produces SQL in `src/db/migrations/`
3. Run `drizzle-kit migrate` → applies to PostgreSQL
4. Run `bunx better-auth migrate` → creates better-auth tables (users, sessions, accounts, verifications)
5. No data migration needed — development environment, fresh DB

## What Does Not Change

- `src/agent/` — all agent logic unchanged
- `src/app/agent-loop.ts` — unchanged
- `src/tools/` — tool definitions unchanged
- `src/types/` — public types unchanged
- Agent session lifecycle and SSE streaming logic unchanged
- `src/runtime/` logic unchanged — only `await` additions at service callsites
