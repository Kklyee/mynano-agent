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

## Directory Structure

```
src/
├── server.ts                        # Hono app setup, mount all routers
├── auth.ts                          # better-auth + Drizzle PG adapter
│
├── db/
│   ├── index.ts                     # postgres.js connection + drizzle() singleton
│   ├── schema/
│   │   ├── auth.ts                  # better-auth tables (users, sessions, accounts)
│   │   ├── conversations.ts         # all conversation-related tables
│   │   └── index.ts                 # re-export all schemas
│   └── migrations/                  # drizzle-kit generated SQL migration files
│
├── handlers/
│   ├── auth.ts                      # /api/auth/* routes
│   ├── conversations.ts             # /api/conversations CRUD + SSE stream
│   └── chat.ts                      # /chat legacy stateless route
│
├── services/
│   └── conversation-service.ts      # business logic (ownership checks, prepareRun, etc.)
│
├── repositories/
│   └── conversation-repository.ts   # all DB operations via Drizzle query builder
│
├── agent/          # unchanged
├── runtime/        # unchanged
├── tools/          # unchanged
└── types/          # unchanged
```

### Files to Delete

- `db/queries.ts` — SQL strings moved into repository methods
- `db/schema.ts` — replaced by Drizzle schema definitions
- `stores/conversation-store.ts` — replaced by `repositories/conversation-repository.ts`

## Layer Responsibilities

### Handler (`handlers/*.ts`)

- Parse request params, query, body
- Enforce authentication via `requireAuth` middleware
- Call service methods
- Format HTTP responses and SSE streams
- No business logic, no direct DB access

### Service (`services/conversation-service.ts`)

- Enforce business rules: user ownership checks, data validation
- Orchestrate multiple repository calls when needed
- `prepareRun`: load conversation + message history + next sequence for agent session
- No HTTP concerns, no direct DB access

### Repository (`repositories/conversation-repository.ts`)

- Pure DB operations, no business logic
- One method per CRUD operation
- Uses Drizzle query builder for all queries
- Complex queries (e.g. `nextSequence` UNION ALL, `listConversations` with EXISTS subqueries) use Drizzle `sql` raw template tag
- Injected with `db` instance (testable)

### DB (`db/index.ts` + `db/schema/`)

- Single `postgres(DATABASE_URL)` connection via postgres.js
- Single `drizzle(client)` instance exported as `db`
- Schema definitions using Drizzle `pgTable` helpers
- Migrations managed by `drizzle-kit`

## Data Flow

```
HTTP Request
    │
    ▼
Handler (handlers/*.ts)
  parse req → call service → format response
    │
    ▼
Service (services/conversation-service.ts)
  business rules → ownership checks → orchestrate
    │
    ▼
Repository (repositories/conversation-repository.ts)
  Drizzle query builder → typed results
    │
    ▼
DB (db/index.ts)
  drizzle(postgres(DATABASE_URL))
```

## Drizzle Schema

### `db/schema/conversations.ts`

All 7 tables defined using `pgTable`:

- `conversations` — metadata (id, user_id, title, status, message_count, timestamps)
- `conversation_messages` — messages (id, conversation_id, role, content, sequence, status, created_at)
- `conversation_tool_calls` — tool invocations (id, message_id, name, args_json, result_text, status, sequence, timestamps)
- `conversation_tasks` — agent task graph (conversation_id + task_id composite PK, subject, description, status, owner, blocked_by_json)
- `conversation_task_events` — append-only task status timeline (id, task_id, status, sequence)
- `conversation_background_tasks` — background shell commands (conversation_id + task_id composite PK, command, summary, status, timestamps, exit_code)
- `conversation_background_events` — append-only background task timeline (id, task_id, status, sequence)

Indexes preserved from current schema (user+updated_at, conversation+sequence).

### `db/schema/auth.ts`

Uses `better-auth`'s official Drizzle schema helpers — no manual table definitions required.

## Repository Interface

```ts
interface ConversationRepository {
  // Conversations
  createConversation(data: NewConversation): Promise<Conversation>
  getConversation(id: string): Promise<Conversation | null>
  listConversations(userId: string): Promise<Conversation[]>
  touchConversation(id: string, opts: TouchOpts): Promise<void>
  updateConversationStatus(id: string, status: string): Promise<void>
  deleteConversation(id: string): Promise<void>

  // Messages
  appendMessage(data: NewMessage): Promise<void>
  listMessages(conversationId: string): Promise<Message[]>
  deleteConversationMessages(conversationId: string): Promise<void>

  // Tool calls
  appendToolCall(data: NewToolCall): Promise<void>
  completeLatestToolCall(conversationId: string, name: string, result: string): Promise<void>
  listToolCalls(conversationId: string): Promise<ToolCall[]>
  deleteConversationToolCalls(conversationId: string): Promise<void>

  // Tasks
  upsertTask(data: UpsertTask): Promise<void>
  listTasks(conversationId: string): Promise<Task[]>
  getTask(conversationId: string, taskId: number): Promise<Task | null>
  deleteConversationTasks(conversationId: string): Promise<void>

  // Task events
  appendTaskEvent(data: NewTaskEvent): Promise<void>
  listTaskEvents(conversationId: string): Promise<TaskEvent[]>
  deleteConversationTaskEvents(conversationId: string): Promise<void>

  // Background tasks
  upsertBackgroundTask(data: UpsertBackgroundTask): Promise<void>
  listBackgroundTasks(conversationId: string): Promise<BackgroundTask[]>
  getBackgroundTask(conversationId: string, taskId: string): Promise<BackgroundTask | null>
  deleteConversationBackgroundTasks(conversationId: string): Promise<void>

  // Background events
  appendBackgroundEvent(data: NewBackgroundEvent): Promise<void>
  listBackgroundEvents(conversationId: string): Promise<BackgroundEvent[]>
  deleteConversationBackgroundEvents(conversationId: string): Promise<void>

  // Sequences
  getNextSequence(conversationId: string): Promise<number>
  getNextTaskId(conversationId: string): Promise<number>
}
```

## Handler Structure

### `handlers/conversations.ts`

```
GET    /api/conversations           → service.listConversations
POST   /api/conversations           → service.createConversation
GET    /api/conversations/:id       → service.getConversationDetail
DELETE /api/conversations/:id       → service.deleteConversation
POST   /api/conversations/:id/messages → service.prepareRun + agent stream
```

### `handlers/auth.ts`

```
ALL  /api/auth      → better-auth handler
ALL  /api/auth/*    → better-auth handler
GET  /api/me        → return current user/session
```

### `handlers/chat.ts`

```
POST /chat          → legacy stateless agent run (no conversation persistence)
```

## Dependencies to Add

```json
{
  "drizzle-orm": "latest",
  "postgres": "latest"
}
```

```json
devDependencies: {
  "drizzle-kit": "latest"
}
```

`drizzle.config.ts` at project root for drizzle-kit configuration.

## Environment Variables

```
DATABASE_URL=postgresql://user:password@localhost:5432/mynano
```

Replaces current:
- `AUTH_DB_PATH` (SQLite auth)
- `CONVERSATION_DB_PATH` (SQLite conversations)

## Migration Strategy

1. Define Drizzle schemas (conversations + auth)
2. Run `drizzle-kit generate` to produce migration SQL
3. Run `drizzle-kit migrate` to apply to PostgreSQL
4. No data migration needed (development environment, fresh DB acceptable)

## What Does Not Change

- `agent/` — all agent logic unchanged
- `runtime/` — task managers and background managers unchanged (they call `ConversationService`, not the store directly)
- `tools/` — tool definitions unchanged
- `types/` — public types unchanged
- Agent session lifecycle and SSE streaming logic unchanged
