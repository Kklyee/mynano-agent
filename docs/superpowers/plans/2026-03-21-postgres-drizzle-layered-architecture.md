# PostgreSQL + Drizzle ORM + Layered Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from SQLite + raw SQL to PostgreSQL + Drizzle ORM with a clean handler→service→repository→db architecture.

**Architecture:** DB layer uses postgres.js + Drizzle ORM with typed schema. Repository handles all DB access. Service holds business logic. Handlers handle HTTP. better-auth switches to Drizzle PG adapter.

**Tech Stack:** Bun, Hono, Drizzle ORM (`^0.41.0`), postgres.js (`^3.4.5`), drizzle-kit (`^0.30.0`), better-auth, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-21-postgres-drizzle-layered-architecture-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `drizzle.config.ts` | Create | drizzle-kit config |
| `src/db/schema/conversations.ts` | Create | 7 pgTable definitions |
| `src/db/schema/index.ts` | Create | re-export schemas |
| `src/db/index.ts` | Create | DATABASE_URL validation + drizzle singleton |
| `src/repositories/conversation-repository.ts` | Create | All DB ops via Drizzle |
| `src/auth.ts` | Modify | SQLite → drizzleAdapter(db, { provider: "pg" }) |
| `src/services/conversation-service.ts` | Modify | sync → async, use repository |
| `src/runtime/conversation-task-manager.ts` | Modify | add await to service calls |
| `src/runtime/conversation-background-manager.ts` | Modify | add await to service calls |
| `src/handlers/auth.ts` | Create | /api/auth/* + /api/me routes |
| `src/handlers/conversations.ts` | Create | /api/conversations routes + SSE |
| `src/handlers/chat.ts` | Create | /chat legacy route |
| `src/server.ts` | Modify | mount routers, remove SQLite bootstrap |
| `package.json` | Modify | add drizzle-orm, postgres, drizzle-kit |
| `src/db/queries.ts` | Delete | replaced by repository |
| `src/db/schema.ts` | Delete | replaced by Drizzle schema |
| `src/stores/conversation-store.ts` | Delete | replaced by repository |
| `src/types/conversation.ts` | No change | already defines all needed types (ConversationDetail, PreparedConversationRun, Persisted* types) |
| `src/agent/index.ts` | No change | exports createAgent and createAgentConfig used by server.ts |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd /home/kk/dev/agents/mynano-agent
bun add drizzle-orm postgres
bun add -d drizzle-kit
```

Expected: `package.json` updated with drizzle-orm, postgres, drizzle-kit.

- [ ] **Step 2: Verify package.json has correct entries**

Check that `package.json` contains:
```json
"drizzle-orm": "...",
"postgres": "..."
```
and devDependencies contains `"drizzle-kit": "..."`.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add drizzle-orm, postgres, drizzle-kit dependencies"
```

---

## Task 2: Create drizzle.config.ts

**Files:**
- Create: `drizzle.config.ts`

- [ ] **Step 1: Create config file**

Create `/home/kk/dev/agents/mynano-agent/drizzle.config.ts`:
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

- [ ] **Step 2: Commit**

```bash
git add drizzle.config.ts
git commit -m "chore: add drizzle.config.ts"
```

---

## Task 3: Create Drizzle Schema

**Files:**
- Create: `src/db/schema/conversations.ts`
- Create: `src/db/schema/index.ts`

- [ ] **Step 1: Create conversations schema**

Create `src/db/schema/conversations.ts`:
```ts
import { index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core"

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    summary: text("summary"),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastMessageAt: text("last_message_at"),
  },
  (t) => [index("conversations_user_updated_idx").on(t.userId, t.updatedAt)],
)

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    sequence: integer("sequence").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("conversation_messages_conversation_sequence_idx").on(t.conversationId, t.sequence)],
)

export const conversationToolCalls = pgTable(
  "conversation_tool_calls",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id").notNull(),
    name: text("name").notNull(),
    argsJson: text("args_json"),
    resultText: text("result_text"),
    status: text("status").notNull(),
    sequence: integer("sequence").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (t) => [index("conversation_tool_calls_conversation_sequence_idx").on(t.conversationId, t.sequence)],
)

export const conversationTasks = pgTable(
  "conversation_tasks",
  {
    conversationId: text("conversation_id").notNull(),
    taskId: integer("task_id").notNull(),
    subject: text("subject"),
    description: text("description"),
    status: text("status").notNull(),
    owner: text("owner"),
    blockedByJson: text("blocked_by_json").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.taskId] }),
    index("conversation_tasks_conversation_updated_idx").on(t.conversationId, t.updatedAt, t.taskId),
  ],
)

export const conversationTaskEvents = pgTable(
  "conversation_task_events",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    taskId: integer("task_id").notNull(),
    subject: text("subject"),
    status: text("status").notNull(),
    sequence: integer("sequence").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("conversation_task_events_conversation_sequence_idx").on(t.conversationId, t.sequence)],
)

export const conversationBackgroundTasks = pgTable(
  "conversation_background_tasks",
  {
    conversationId: text("conversation_id").notNull(),
    taskId: text("task_id").notNull(),
    command: text("command"),
    summary: text("summary"),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    exitCode: integer("exit_code"),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.taskId] }),
    index("conversation_background_tasks_conversation_started_idx").on(t.conversationId, t.startedAt),
  ],
)

export const conversationBackgroundEvents = pgTable(
  "conversation_background_events",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    taskId: text("task_id").notNull(),
    command: text("command"),
    summary: text("summary"),
    status: text("status").notNull(),
    sequence: integer("sequence").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("conversation_background_events_conversation_sequence_idx").on(t.conversationId, t.sequence)],
)
```

- [ ] **Step 2: Create schema index**

Create `src/db/schema/index.ts`:
```ts
export * from "./conversations"
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/
git commit -m "feat: add drizzle schema for conversation tables"
```

---

## Task 4: Create DB Connection

**Files:**
- Create: `src/db/index.ts`

- [ ] **Step 1: Create db/index.ts**

Create `src/db/index.ts`:
```ts
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index.js"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required")

const client = postgres(url)
export const db = drizzle(client, { schema })
```

- [ ] **Step 2: Commit**

```bash
git add src/db/index.ts
git commit -m "feat: add drizzle db connection singleton"
```

---

## Task 5: Create Conversation Repository

**Files:**
- Create: `src/repositories/conversation-repository.ts`

This replaces `src/stores/conversation-store.ts`. All SQL logic moves here as Drizzle queries.

- [ ] **Step 1: Create the repository**

Create `src/repositories/conversation-repository.ts`:
```ts
import { eq, and, sql, desc, asc, exists } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as schema from "../db/schema/index.js"
import {
  conversations, conversationMessages, conversationToolCalls,
  conversationTasks, conversationTaskEvents,
  conversationBackgroundTasks, conversationBackgroundEvents,
} from "../db/schema/conversations.js"
import type {
  PersistedBackgroundStatus, PersistedConversation, PersistedConversationBackgroundEvent,
  PersistedConversationBackgroundTask, PersistedConversationMessage, PersistedConversationStatus,
  PersistedConversationTask, PersistedConversationTaskEvent, PersistedConversationToolCall,
  PersistedMessageRole, PersistedMessageStatus, PersistedTaskStatus, PersistedToolStatus,
} from "../types/conversation.js"

type Db = PostgresJsDatabase<typeof schema>

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function now() {
  return new Date().toISOString()
}

const parseBlockedBy = (value: string | null): number[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []
  } catch {
    return []
  }
}

export class ConversationRepository {
  constructor(private readonly db: Db) {}

  async createConversation(input: {
    userId: string; title: string; createdAt?: string; updatedAt?: string
  }): Promise<PersistedConversation> {
    const id = createId("conv")
    const ts = now()
    await this.db.insert(conversations).values({
      id, userId: input.userId, title: input.title, status: "idle",
      messageCount: 0, createdAt: input.createdAt ?? ts, updatedAt: input.updatedAt ?? ts,
    })
    return (await this.getConversation(id))!
  }

  async getConversation(id: string): Promise<PersistedConversation | null> {
    const row = await this.db.query.conversations.findFirst({ where: eq(conversations.id, id) })
    if (!row) return null
    return this.toConversation(row)
  }

  async listConversations(userId: string): Promise<PersistedConversation[]> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          exists(
            this.db.select({ one: sql`1` }).from(conversationMessages)
              .where(and(eq(conversationMessages.conversationId, conversations.id), eq(conversationMessages.role, "user")))
          ),
          exists(
            this.db.select({ one: sql`1` }).from(conversationMessages)
              .where(and(eq(conversationMessages.conversationId, conversations.id), eq(conversationMessages.role, "assistant")))
          ),
        )
      )
      .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt))
    return rows.map(this.toConversation)
  }

  async touchConversation(id: string, opts: {
    updatedAt: string; lastMessageAt: string; messageCountDelta: number; newTitle?: string
  }): Promise<void> {
    await this.db
      .update(conversations)
      .set({
        updatedAt: opts.updatedAt,
        lastMessageAt: opts.lastMessageAt,
        messageCount: sql`${conversations.messageCount} + ${opts.messageCountDelta}`,
        title: opts.newTitle
          ? sql`CASE WHEN (${conversations.title} = 'New Conversation' OR ${conversations.title} = '') THEN ${opts.newTitle} ELSE ${conversations.title} END`
          : conversations.title,
      })
      .where(eq(conversations.id, id))
  }

  async updateConversationStatus(id: string, status: PersistedConversationStatus): Promise<void> {
    await this.db.update(conversations).set({ status, updatedAt: now() }).where(eq(conversations.id, id))
  }

  async deleteConversation(id: string): Promise<void> {
    await this.db.delete(conversationBackgroundEvents).where(eq(conversationBackgroundEvents.conversationId, id))
    await this.db.delete(conversationTaskEvents).where(eq(conversationTaskEvents.conversationId, id))
    await this.db.delete(conversationBackgroundTasks).where(eq(conversationBackgroundTasks.conversationId, id))
    await this.db.delete(conversationTasks).where(eq(conversationTasks.conversationId, id))
    await this.db.delete(conversationToolCalls).where(eq(conversationToolCalls.conversationId, id))
    await this.db.delete(conversationMessages).where(eq(conversationMessages.conversationId, id))
    await this.db.delete(conversations).where(eq(conversations.id, id))
  }

  async appendMessage(input: {
    conversationId: string; role: PersistedMessageRole; content: string
    sequence: number; status: PersistedMessageStatus; createdAt?: string
  }): Promise<PersistedConversationMessage> {
    const id = createId("msg")
    const ts = input.createdAt ?? now()
    await this.db.insert(conversationMessages).values({
      id, conversationId: input.conversationId, role: input.role, content: input.content,
      sequence: input.sequence, status: input.status, createdAt: ts,
    })
    return { id, conversationId: input.conversationId, role: input.role as PersistedMessageRole,
      content: input.content, sequence: input.sequence, status: input.status as PersistedMessageStatus, createdAt: ts }
  }

  async listMessages(conversationId: string): Promise<PersistedConversationMessage[]> {
    const rows = await this.db.select().from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(asc(conversationMessages.sequence), asc(conversationMessages.createdAt))
    return rows.map(r => ({
      id: r.id, conversationId: r.conversationId, role: r.role as PersistedMessageRole,
      content: r.content, sequence: r.sequence, status: r.status as PersistedMessageStatus, createdAt: r.createdAt,
    }))
  }

  async appendToolCall(input: {
    conversationId: string; messageId: string; name: string; argsJson?: string | null
    resultText?: string | null; status: PersistedToolStatus; sequence: number; startedAt: string; completedAt?: string | null
  }): Promise<PersistedConversationToolCall> {
    const id = createId("tc")
    await this.db.insert(conversationToolCalls).values({
      id, conversationId: input.conversationId, messageId: input.messageId,
      name: input.name, argsJson: input.argsJson ?? null, resultText: input.resultText ?? null,
      status: input.status, sequence: input.sequence, startedAt: input.startedAt, completedAt: input.completedAt ?? null,
    })
    return { id, conversationId: input.conversationId, messageId: input.messageId, name: input.name,
      argsJson: input.argsJson ?? null, resultText: input.resultText ?? null, status: input.status as PersistedToolStatus,
      sequence: input.sequence, startedAt: input.startedAt, completedAt: input.completedAt ?? null }
  }

  async completeLatestToolCall(conversationId: string, name: string, result: string, completedAt: string): Promise<void> {
    const latest = await this.db.select({ id: conversationToolCalls.id })
      .from(conversationToolCalls)
      .where(and(
        eq(conversationToolCalls.conversationId, conversationId),
        eq(conversationToolCalls.name, name),
        eq(conversationToolCalls.status, "running"),
      ))
      .orderBy(desc(conversationToolCalls.sequence))
      .limit(1)
    if (!latest[0]) return
    await this.db.update(conversationToolCalls)
      .set({ resultText: result, status: "completed", completedAt })
      .where(eq(conversationToolCalls.id, latest[0].id))
  }

  async listToolCalls(conversationId: string): Promise<PersistedConversationToolCall[]> {
    const rows = await this.db.select().from(conversationToolCalls)
      .where(eq(conversationToolCalls.conversationId, conversationId))
      .orderBy(asc(conversationToolCalls.sequence), asc(conversationToolCalls.startedAt))
    return rows.map(r => ({
      id: r.id, conversationId: r.conversationId, messageId: r.messageId, name: r.name,
      argsJson: r.argsJson, resultText: r.resultText, status: r.status as PersistedToolStatus,
      sequence: r.sequence, startedAt: r.startedAt, completedAt: r.completedAt,
    }))
  }

  async upsertTask(input: {
    conversationId: string; taskId: number; subject?: string | null; description?: string | null
    status: PersistedTaskStatus; owner?: string | null; blockedBy?: number[]; createdAt?: string; updatedAt: string
  }): Promise<PersistedConversationTask> {
    const blockedByJson = JSON.stringify(input.blockedBy ?? [])
    const ts = now()
    await this.db.insert(conversationTasks)
      .values({
        conversationId: input.conversationId, taskId: input.taskId,
        subject: input.subject ?? null, description: input.description ?? null,
        status: input.status, owner: input.owner ?? null,
        blockedByJson, createdAt: input.createdAt ?? ts, updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: [conversationTasks.conversationId, conversationTasks.taskId],
        set: {
          subject: sql`COALESCE(excluded.subject, ${conversationTasks.subject})`,
          description: sql`COALESCE(excluded.description, ${conversationTasks.description})`,
          status: input.status,
          owner: sql`COALESCE(excluded.owner, ${conversationTasks.owner})`,
          blockedByJson,
          updatedAt: input.updatedAt,
        },
      })
    return (await this.getTask(input.conversationId, input.taskId))!
  }

  async getTask(conversationId: string, taskId: number): Promise<PersistedConversationTask | null> {
    const row = await this.db.query.conversationTasks.findFirst({
      where: and(eq(conversationTasks.conversationId, conversationId), eq(conversationTasks.taskId, taskId)),
    })
    if (!row) return null
    return this.toTask(row)
  }

  async listTasks(conversationId: string): Promise<PersistedConversationTask[]> {
    const rows = await this.db.select().from(conversationTasks)
      .where(eq(conversationTasks.conversationId, conversationId))
      .orderBy(asc(conversationTasks.updatedAt), asc(conversationTasks.taskId))
    return rows.map(r => this.toTask(r))
  }

  async appendTaskEvent(input: {
    id?: string; conversationId: string; taskId: number; subject?: string | null
    status: string; sequence: number; updatedAt: string
  }): Promise<PersistedConversationTaskEvent> {
    const id = input.id ?? createId("te")
    await this.db.insert(conversationTaskEvents).values({
      id, conversationId: input.conversationId, taskId: input.taskId,
      subject: input.subject ?? null, status: input.status,
      sequence: input.sequence, updatedAt: input.updatedAt,
    })
    return { id, conversationId: input.conversationId, taskId: input.taskId,
      subject: input.subject ?? null, status: input.status, sequence: input.sequence, updatedAt: input.updatedAt }
  }

  async listTaskEvents(conversationId: string): Promise<PersistedConversationTaskEvent[]> {
    const rows = await this.db.select().from(conversationTaskEvents)
      .where(eq(conversationTaskEvents.conversationId, conversationId))
      .orderBy(asc(conversationTaskEvents.sequence), asc(conversationTaskEvents.updatedAt))
    return rows.map(r => ({ id: r.id, conversationId: r.conversationId, taskId: r.taskId,
      subject: r.subject, status: r.status, sequence: r.sequence, updatedAt: r.updatedAt }))
  }

  async upsertBackgroundTask(input: {
    conversationId: string; taskId: string; command?: string | null; summary?: string | null
    status: PersistedBackgroundStatus; startedAt?: string; completedAt?: string | null; exitCode?: number | null
  }): Promise<PersistedConversationBackgroundTask> {
    const ts = now()
    await this.db.insert(conversationBackgroundTasks)
      .values({
        conversationId: input.conversationId, taskId: input.taskId,
        command: input.command ?? null, summary: input.summary ?? null,
        status: input.status, startedAt: input.startedAt ?? ts,
        completedAt: input.completedAt ?? null, exitCode: input.exitCode ?? null,
      })
      .onConflictDoUpdate({
        target: [conversationBackgroundTasks.conversationId, conversationBackgroundTasks.taskId],
        set: {
          command: sql`COALESCE(excluded.command, ${conversationBackgroundTasks.command})`,
          summary: sql`COALESCE(excluded.summary, ${conversationBackgroundTasks.summary})`,
          status: input.status,
          startedAt: sql`COALESCE(${conversationBackgroundTasks.startedAt}, excluded.started_at)`,
          completedAt: sql`COALESCE(excluded.completed_at, ${conversationBackgroundTasks.completedAt})`,
          exitCode: sql`COALESCE(excluded.exit_code, ${conversationBackgroundTasks.exitCode})`,
        },
      })
    return (await this.getBackgroundTask(input.conversationId, input.taskId))!
  }

  async getBackgroundTask(conversationId: string, taskId: string): Promise<PersistedConversationBackgroundTask | null> {
    const row = await this.db.query.conversationBackgroundTasks.findFirst({
      where: and(
        eq(conversationBackgroundTasks.conversationId, conversationId),
        eq(conversationBackgroundTasks.taskId, taskId),
      ),
    })
    if (!row) return null
    return this.toBackgroundTask(row)
  }

  async listBackgroundTasks(conversationId: string): Promise<PersistedConversationBackgroundTask[]> {
    const rows = await this.db.select().from(conversationBackgroundTasks)
      .where(eq(conversationBackgroundTasks.conversationId, conversationId))
      .orderBy(asc(conversationBackgroundTasks.startedAt), asc(conversationBackgroundTasks.taskId))
    return rows.map(r => this.toBackgroundTask(r))
  }

  async appendBackgroundEvent(input: {
    id?: string; conversationId: string; taskId: string; command?: string | null
    summary?: string | null; status: PersistedBackgroundStatus; sequence: number; updatedAt: string
  }): Promise<PersistedConversationBackgroundEvent> {
    const id = input.id ?? createId("be")
    await this.db.insert(conversationBackgroundEvents).values({
      id, conversationId: input.conversationId, taskId: input.taskId,
      command: input.command ?? null, summary: input.summary ?? null,
      status: input.status, sequence: input.sequence, updatedAt: input.updatedAt,
    })
    return { id, conversationId: input.conversationId, taskId: input.taskId,
      command: input.command ?? null, summary: input.summary ?? null,
      status: input.status as PersistedBackgroundStatus, sequence: input.sequence, updatedAt: input.updatedAt }
  }

  async listBackgroundEvents(conversationId: string): Promise<PersistedConversationBackgroundEvent[]> {
    const rows = await this.db.select().from(conversationBackgroundEvents)
      .where(eq(conversationBackgroundEvents.conversationId, conversationId))
      .orderBy(asc(conversationBackgroundEvents.sequence), asc(conversationBackgroundEvents.updatedAt))
    return rows.map(r => ({
      id: r.id, conversationId: r.conversationId, taskId: r.taskId,
      command: r.command, summary: r.summary,
      status: r.status as PersistedBackgroundStatus, sequence: r.sequence, updatedAt: r.updatedAt,
    }))
  }

  async getNextSequence(conversationId: string): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT MAX(sequence) AS max_seq FROM (
        SELECT sequence FROM conversation_messages WHERE conversation_id = ${conversationId}
        UNION ALL
        SELECT sequence FROM conversation_tool_calls WHERE conversation_id = ${conversationId}
        UNION ALL
        SELECT sequence FROM conversation_task_events WHERE conversation_id = ${conversationId}
        UNION ALL
        SELECT sequence FROM conversation_background_events WHERE conversation_id = ${conversationId}
      ) t
    `)
    const maxSeq = (result[0] as any)?.max_seq
    return maxSeq == null ? 1 : Number(maxSeq) + 1
  }

  async getNextTaskId(conversationId: string): Promise<number> {
    const result = await this.db
      .select({ maxId: sql<number>`MAX(task_id)` })
      .from(conversationTasks)
      .where(eq(conversationTasks.conversationId, conversationId))
    const maxId = result[0]?.maxId
    return maxId == null ? 1 : Number(maxId) + 1
  }

  private toConversation(row: typeof conversations.$inferSelect): PersistedConversation {
    return {
      id: row.id, userId: row.userId, title: row.title,
      status: row.status as PersistedConversationStatus,
      summary: row.summary ?? null, messageCount: row.messageCount,
      createdAt: row.createdAt, updatedAt: row.updatedAt, lastMessageAt: row.lastMessageAt ?? null,
    }
  }

  private toTask(row: typeof conversationTasks.$inferSelect): PersistedConversationTask {
    return {
      conversationId: row.conversationId, taskId: row.taskId,
      subject: row.subject ?? null, description: row.description ?? null,
      status: row.status as PersistedTaskStatus, owner: row.owner ?? null,
      blockedBy: parseBlockedBy(row.blockedByJson),
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    }
  }

  private toBackgroundTask(row: typeof conversationBackgroundTasks.$inferSelect): PersistedConversationBackgroundTask {
    return {
      conversationId: row.conversationId, taskId: row.taskId,
      command: row.command ?? null, summary: row.summary ?? null,
      status: row.status as PersistedBackgroundStatus,
      startedAt: row.startedAt, completedAt: row.completedAt ?? null,
      exitCode: row.exitCode ?? null,
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/repositories/
git commit -m "feat: add ConversationRepository with Drizzle"
```

---

## Task 6: Update auth.ts

**Files:**
- Modify: `src/auth.ts`

- [ ] **Step 1: Rewrite auth.ts to use Drizzle PG adapter**

Replace the entire content of `src/auth.ts` with:
```ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db/index.js"

const DEFAULT_AUTH_SECRET = "mini-agent-better-auth-development-secret-please-change"
const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

const isLocalDevOrigin = (origin: string) => LOCAL_DEV_ORIGIN_PATTERN.test(origin)
const getServerPort = () => process.env.PORT ?? "3001"
const getAuthBaseUrl = () => process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? `http://localhost:${getServerPort()}`

const getConfiguredTrustedOrigins = () => {
  const configured = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  return configured ?? []
}

export const auth = betterAuth({
  appName: "Mini Agent",
  secret: process.env.BETTER_AUTH_SECRET ?? DEFAULT_AUTH_SECRET,
  baseURL: getAuthBaseUrl(),
  basePath: "/api/auth",
  database: drizzleAdapter(db, { provider: "pg" }),
  trustedOrigins: async (request) => {
    const configured = getConfiguredTrustedOrigins()
    const requestOrigin = request?.headers.get("origin")
    if (requestOrigin && isLocalDevOrigin(requestOrigin)) {
      return [...configured, requestOrigin]
    }
    if (configured.length > 0) return configured
    return ["http://localhost:3000", "http://127.0.0.1:3000"]
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
})
```

Note: `ensureAuthSchema` export is removed. better-auth tables are managed by `bunx better-auth migrate`.

- [ ] **Step 2: Commit**

```bash
git add src/auth.ts
git commit -m "feat: migrate auth to drizzle PG adapter"
```

---

## Task 7: Update ConversationService (async + repository)

**Files:**
- Modify: `src/services/conversation-service.ts`

- [ ] **Step 1: Rewrite service to use repository and be fully async**

Replace the entire content of `src/services/conversation-service.ts` with:
```ts
import type { ConversationRepository } from "../repositories/conversation-repository.js"
import type {
  ConversationDetail, PersistedBackgroundStatus, PersistedConversation,
  PersistedConversationBackgroundTask, PersistedConversationMessage,
  PersistedConversationStatus, PersistedConversationTask, PersistedMessageStatus,
  PersistedTaskStatus, PreparedConversationRun,
} from "../types/conversation.js"

type CreateConversationInput = { userId: string; title?: string }
type GetConversationInput = { userId: string; conversationId: string }
type PrepareRunInput = GetConversationInput & { prompt: string }
type RecordMessageInput = { conversationId: string; content: string }
type RecordAssistantMessageInput = RecordMessageInput & { status: PersistedMessageStatus }
type RecordToolCallStartedInput = { conversationId: string; messageId: string; name: string; args: unknown }
type RecordToolCallCompletedInput = { conversationId: string; name: string; result: string }
type UpsertTaskInput = {
  conversationId: string; taskId: number; subject?: string; description?: string
  status: PersistedTaskStatus; owner?: string; blockedBy?: number[]
}
type RecordTaskEventInput = { conversationId: string; taskId: number; subject?: string; status: string }
type UpsertBackgroundTaskInput = {
  conversationId: string; taskId: string; command?: string; summary?: string
  status: PersistedBackgroundStatus; completedAt?: string | null; exitCode?: number | null
}
type RecordBackgroundEventInput = {
  conversationId: string; taskId: string; command?: string; summary?: string; status: PersistedBackgroundStatus
}

export class ConversationService {
  constructor(private readonly repo: ConversationRepository) {}

  async updateConversationStatus(conversationId: string, status: PersistedConversationStatus) {
    await this.repo.updateConversationStatus(conversationId, status)
  }

  async createConversation(input: CreateConversationInput): Promise<PersistedConversation> {
    return this.repo.createConversation({ userId: input.userId, title: input.title?.trim() || "New Conversation" })
  }

  async listConversations(userId: string): Promise<PersistedConversation[]> {
    return this.repo.listConversations(userId)
  }

  async deleteConversation(input: GetConversationInput): Promise<void> {
    await this.requireOwnedConversation(input)
    await this.repo.deleteConversation(input.conversationId)
  }

  async getConversationDetail(input: GetConversationInput): Promise<ConversationDetail> {
    const conversation = await this.requireOwnedConversation(input)
    return {
      conversation,
      messages: await this.repo.listMessages(conversation.id),
      tools: await this.repo.listToolCalls(conversation.id),
      tasks: await this.repo.listTasks(conversation.id),
      taskEvents: await this.repo.listTaskEvents(conversation.id),
      backgroundTasks: await this.repo.listBackgroundTasks(conversation.id),
      backgroundEvents: await this.repo.listBackgroundEvents(conversation.id),
    }
  }

  async prepareRun(input: PrepareRunInput): Promise<PreparedConversationRun> {
    const conversation = await this.requireOwnedConversation(input)
    const messages = await this.repo.listMessages(conversation.id)
    return {
      conversation,
      history: messages
        .filter((m) => m.role !== "tool")
        .map((m) => ({ role: m.role, content: m.content })),
      nextSequence: await this.repo.getNextSequence(conversation.id),
    }
  }

  async getNextTaskId(conversationId: string): Promise<number> {
    return this.repo.getNextTaskId(conversationId)
  }

  async getTask(conversationId: string, taskId: number): Promise<PersistedConversationTask | null> {
    return this.repo.getTask(conversationId, taskId)
  }

  async listTasks(conversationId: string): Promise<PersistedConversationTask[]> {
    return this.repo.listTasks(conversationId)
  }

  async getBackgroundTask(conversationId: string, taskId: string): Promise<PersistedConversationBackgroundTask | null> {
    return this.repo.getBackgroundTask(conversationId, taskId)
  }

  async listBackgroundTasks(conversationId: string): Promise<PersistedConversationBackgroundTask[]> {
    return this.repo.listBackgroundTasks(conversationId)
  }

  async recordUserMessage(input: RecordMessageInput): Promise<PersistedConversationMessage> {
    const sequence = await this.repo.getNextSequence(input.conversationId)
    const msg = await this.repo.appendMessage({
      conversationId: input.conversationId, role: "user",
      content: input.content, sequence, status: "complete",
    })
    await this.repo.touchConversation(input.conversationId, {
      updatedAt: msg.createdAt, lastMessageAt: msg.createdAt,
      messageCountDelta: 1, newTitle: input.content.trim().slice(0, 80),
    })
    return msg
  }

  async recordAssistantMessage(input: RecordAssistantMessageInput): Promise<PersistedConversationMessage> {
    const sequence = await this.repo.getNextSequence(input.conversationId)
    return this.repo.appendMessage({
      conversationId: input.conversationId, role: "assistant",
      content: input.content, sequence, status: input.status,
    })
  }

  async recordToolCallStarted(input: RecordToolCallStartedInput) {
    const sequence = await this.repo.getNextSequence(input.conversationId)
    return this.repo.appendToolCall({
      conversationId: input.conversationId, messageId: input.messageId,
      name: input.name, argsJson: JSON.stringify(input.args),
      status: "running", sequence, startedAt: new Date().toISOString(),
    })
  }

  async recordToolCallCompleted(input: RecordToolCallCompletedInput) {
    return this.repo.completeLatestToolCall(
      input.conversationId, input.name, input.result, new Date().toISOString()
    )
  }

  async upsertTask(input: UpsertTaskInput): Promise<PersistedConversationTask> {
    return this.repo.upsertTask({
      conversationId: input.conversationId, taskId: input.taskId,
      subject: input.subject ?? null, description: input.description ?? null,
      status: input.status, owner: input.owner ?? null,
      blockedBy: input.blockedBy ?? [], updatedAt: new Date().toISOString(),
    })
  }

  async recordTaskEvent(input: RecordTaskEventInput) {
    const updatedAt = new Date().toISOString()
    const sequence = await this.repo.getNextSequence(input.conversationId)
    const existing = await this.repo.getTask(input.conversationId, input.taskId)
    if (!existing) {
      await this.repo.upsertTask({
        conversationId: input.conversationId, taskId: input.taskId,
        subject: input.subject ?? null, description: null,
        status: normalizeTaskStatus(input.status), owner: null, blockedBy: [], updatedAt,
      })
    }
    return this.repo.appendTaskEvent({
      conversationId: input.conversationId, taskId: input.taskId,
      subject: input.subject ?? null, status: input.status, sequence, updatedAt,
    })
  }

  async upsertBackgroundTask(input: UpsertBackgroundTaskInput): Promise<PersistedConversationBackgroundTask> {
    return this.repo.upsertBackgroundTask({
      conversationId: input.conversationId, taskId: input.taskId,
      command: input.command ?? null, summary: input.summary ?? null,
      status: input.status, completedAt: input.completedAt ?? null, exitCode: input.exitCode ?? null,
    })
  }

  async recordBackgroundEvent(input: RecordBackgroundEventInput) {
    const updatedAt = new Date().toISOString()
    const sequence = await this.repo.getNextSequence(input.conversationId)
    const existing = await this.repo.getBackgroundTask(input.conversationId, input.taskId)
    if (!existing) {
      await this.repo.upsertBackgroundTask({
        conversationId: input.conversationId, taskId: input.taskId,
        command: input.command ?? null, summary: input.summary ?? null, status: input.status,
      })
    }
    return this.repo.appendBackgroundEvent({
      conversationId: input.conversationId, taskId: input.taskId,
      command: input.command ?? null, summary: input.summary ?? null,
      status: input.status, sequence, updatedAt,
    })
  }

  private async requireOwnedConversation(input: GetConversationInput): Promise<PersistedConversation> {
    const conversation = await this.repo.getConversation(input.conversationId)
    if (!conversation || conversation.userId !== input.userId) {
      throw new Error("Conversation not found")
    }
    return conversation
  }
}

function normalizeTaskStatus(status: string): PersistedTaskStatus {
  switch (status) {
    case "in_progress": case "completed": case "blocked": return status
    default: return "pending"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/conversation-service.ts
git commit -m "feat: make ConversationService async, use ConversationRepository"
```

---

## Task 8: Update Runtime Files (complete rewrites)

**Files:**
- Modify: `src/runtime/conversation-task-manager.ts`
- Modify: `src/runtime/conversation-background-manager.ts`

- [ ] **Step 1: Rewrite conversation-task-manager.ts**

Replace the entire content of `src/runtime/conversation-task-manager.ts` with:
```ts
import type { ConversationService } from "../services/conversation-service.js"
import type { PersistedConversationTask } from "../types/conversation.js"
import type { Task, TaskManagerContract, TaskStatus } from "../types/index.js"

export class ConversationTaskManager implements TaskManagerContract {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly conversationId: string,
  ) {}

  async create(subject: string, description = "", blockedBy: number[] = []): Promise<Task> {
    for (const dependencyId of blockedBy) {
      const dependency = await this.get(dependencyId)
      if (!dependency) throw new Error(`Dependency task ${dependencyId} not found`)
    }
    const id = await this.conversationService.getNextTaskId(this.conversationId)
    const persistedTask = await this.conversationService.upsertTask({
      conversationId: this.conversationId,
      taskId: id,
      subject,
      description,
      status: blockedBy.length > 0 ? "blocked" : "pending",
      blockedBy,
    })
    return this.toTask(persistedTask, await this.conversationService.listTasks(this.conversationId))
  }

  async update(
    taskId: number,
    updates: Partial<Pick<Task, "status" | "owner" | "blockedBy" | "description">>,
  ): Promise<Task> {
    const existing = await this.conversationService.getTask(this.conversationId, taskId)
    if (!existing) throw new Error(`Task ${taskId} not found`)
    const blockedBy = updates.blockedBy ?? existing.blockedBy
    const nextStatus = this.resolveNextStatus(existing.status, updates.status, blockedBy)
    const persistedTask = await this.conversationService.upsertTask({
      conversationId: this.conversationId,
      taskId,
      subject: existing.subject ?? undefined,
      description: updates.description ?? existing.description ?? undefined,
      status: nextStatus,
      owner: updates.owner ?? existing.owner ?? undefined,
      blockedBy,
    })
    if (nextStatus === "completed") {
      await this.unblockDependents(taskId)
    }
    return this.toTask(persistedTask, await this.conversationService.listTasks(this.conversationId))
  }

  async get(taskId: number): Promise<Task | null> {
    const persistedTask = await this.conversationService.getTask(this.conversationId, taskId)
    if (!persistedTask) return null
    return this.toTask(persistedTask, await this.conversationService.listTasks(this.conversationId))
  }

  async listAll(): Promise<Task[]> {
    const persistedTasks = await this.conversationService.listTasks(this.conversationId)
    return persistedTasks.map((task) => this.toTask(task, persistedTasks))
  }

  async getReadyTasks(): Promise<Task[]> {
    const tasks = await this.listAll()
    return tasks.filter((task) => task.status === "pending" && task.blockedBy.length === 0)
  }

  async getBlockedTasks(): Promise<Task[]> {
    const tasks = await this.listAll()
    return tasks.filter((task) => task.status === "blocked")
  }

  async getInProgressTasks(): Promise<Task[]> {
    const tasks = await this.listAll()
    return tasks.filter((task) => task.status === "in_progress")
  }

  renderTasks(tasks: Task[]): string {
    if (tasks.length === 0) return "No tasks available."
    return tasks
      .map((task) => {
        const statusEmoji = { pending: "⏳", in_progress: "🔨", completed: "✅", blocked: "🚫" }[task.status]
        const deps = task.blockedBy.length > 0 ? ` (blocked by ${task.blockedBy.join(", ")})` : ""
        const owner = task.owner ? ` (@${task.owner})` : ""
        return `[${statusEmoji}] #${task.id}: ${task.subject}${deps}${owner}`
      })
      .join("\n")
  }

  private async unblockDependents(completedTaskId: number): Promise<void> {
    const persistedTasks = await this.conversationService.listTasks(this.conversationId)
    for (const dependent of persistedTasks.filter((task) => task.blockedBy.includes(completedTaskId))) {
      const nextBlockedBy = dependent.blockedBy.filter((taskId) => taskId !== completedTaskId)
      await this.conversationService.upsertTask({
        conversationId: this.conversationId,
        taskId: dependent.taskId,
        subject: dependent.subject ?? undefined,
        description: dependent.description ?? undefined,
        status: nextBlockedBy.length === 0 && dependent.status === "blocked" ? "pending" : dependent.status,
        owner: dependent.owner ?? undefined,
        blockedBy: nextBlockedBy,
      })
    }
  }

  private resolveNextStatus(
    currentStatus: TaskStatus,
    explicitStatus: TaskStatus | undefined,
    blockedBy: number[],
  ): TaskStatus {
    if (blockedBy.length > 0) return "blocked"
    if (explicitStatus && explicitStatus !== "blocked") return explicitStatus
    return currentStatus === "blocked" ? "pending" : currentStatus
  }

  private toTask(task: PersistedConversationTask, allTasks: PersistedConversationTask[]): Task {
    return {
      id: task.taskId,
      subject: task.subject ?? `Task #${task.taskId}`,
      description: task.description ?? "",
      status: task.status,
      owner: task.owner ?? undefined,
      blockedBy: [...task.blockedBy],
      blocks: allTasks
        .filter((candidate) => candidate.blockedBy.includes(task.taskId))
        .map((candidate) => candidate.taskId),
      createdAt: new Date(task.createdAt).getTime(),
      updatedAt: new Date(task.updatedAt).getTime(),
    }
  }
}
```

- [ ] **Step 2: Rewrite conversation-background-manager.ts**

Replace the entire content of `src/runtime/conversation-background-manager.ts` with:
```ts
import { execaCommand } from "execa"
import type { ConversationService } from "../services/conversation-service.js"
import type { BackgroundManagerContract, BackgroundNotification, BackgroundTask, BackgroundTaskStatus } from "../types/index.js"

type BackgroundExecutionResult = { exitCode: number; stdout: string; stderr: string }
export type BackgroundExecutor = (command: string, cwd: string) => Promise<BackgroundExecutionResult>

const defaultBackgroundExecutor: BackgroundExecutor = async (command, cwd) => {
  const result = await execaCommand(command, { cwd, shell: true, reject: false })
  return { exitCode: result.exitCode ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

export class ConversationBackgroundManager implements BackgroundManagerContract {
  private readonly tasks = new Map<string, BackgroundTask>()
  private notificationQueue: BackgroundNotification[] = []
  private nextId = 1

  constructor(
    private readonly conversationService: ConversationService,
    private readonly conversationId: string,
    private readonly executor: BackgroundExecutor = defaultBackgroundExecutor,
  ) {}

  async run(command: string, cwd: string): Promise<BackgroundTask> {
    const taskId = `bg_${this.nextId++}`
    const task: BackgroundTask = { id: taskId, command, cwd, status: "running", startedAt: Date.now() }
    await this.conversationService.upsertBackgroundTask({
      conversationId: this.conversationId, taskId, command, status: "running",
    })
    await this.conversationService.recordBackgroundEvent({
      conversationId: this.conversationId, taskId, command, status: "running",
    })
    this.tasks.set(taskId, task)
    void this.execute(taskId, command, cwd)
    return { ...task }
  }

  check(taskId: string): BackgroundTask | null {
    const task = this.tasks.get(taskId)
    return task ? { ...task } : null
  }

  list(): BackgroundTask[] {
    return [...this.tasks.values()].map((task) => ({ ...task }))
  }

  drainNotifications(): BackgroundNotification[] {
    const notifications = [...this.notificationQueue]
    this.notificationQueue = []
    return notifications
  }

  private async execute(taskId: string, command: string, cwd: string): Promise<void> {
    try {
      const result = await this.executor(command, cwd)
      await this.finishTask(taskId, {
        status: result.exitCode === 0 ? "completed" : "failed",
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      })
    } catch (error: any) {
      await this.finishTask(taskId, {
        status: "failed",
        error: error?.message ?? String(error),
        stderr: error?.stderr ?? "",
      })
    }
  }

  private async finishTask(
    taskId: string,
    updates: {
      status: Exclude<BackgroundTaskStatus, "running">
      exitCode?: number; stdout?: string; stderr?: string; error?: string
    },
  ): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.status = updates.status
    task.completedAt = Date.now()
    task.exitCode = updates.exitCode
    task.stdout = updates.stdout
    task.stderr = updates.stderr
    task.error = updates.error
    await this.conversationService.upsertBackgroundTask({
      conversationId: this.conversationId, taskId,
      status: updates.status,
      completedAt: new Date().toISOString(),
      exitCode: updates.exitCode ?? null,
    })
    await this.conversationService.recordBackgroundEvent({
      conversationId: this.conversationId, taskId,
      command: task.command, status: updates.status,
    })
    this.notificationQueue.push({
      taskId, status: updates.status, command: task.command,
      message: renderCompletionMessage(task),
    })
  }
}

function renderCompletionMessage(task: BackgroundTask): string {
  const stdoutPreview = task.stdout?.trim().slice(0, 300)
  const stderrPreview = task.stderr?.trim().slice(0, 300)
  const parts: string[] = [`Background task ${task.id} ${task.status}`, `Command: ${task.command}`]
  if (task.exitCode !== undefined) parts.push(`Exit code: ${task.exitCode}`)
  if (task.error) parts.push(`Error: ${task.error}`)
  if (stdoutPreview) parts.push(`Stdout:\n${stdoutPreview}`)
  if (stderrPreview) parts.push(`Stderr:\n${stderrPreview}`)
  return parts.join("\n")
}
```

- [ ] **Step 3: Commit**

```bash
git add src/runtime/conversation-task-manager.ts src/runtime/conversation-background-manager.ts
git commit -m "fix: await async ConversationService calls in runtime managers"
```

---

## Task 9: Create Handlers

**Files:**
- Create: `src/handlers/auth.ts`
- Create: `src/handlers/conversations.ts`
- Create: `src/handlers/chat.ts`

- [ ] **Step 1: Create auth handler**

Create `src/handlers/auth.ts`:
```ts
import { Hono } from "hono"
import { auth } from "../auth.js"
import type { AppEnv } from "../server.js"

export const authHandler = new Hono<AppEnv>()

authHandler.all("/api/auth", (c) => auth.handler(c.req.raw))
authHandler.all("/api/auth/*", (c) => auth.handler(c.req.raw))
authHandler.get("/api/me", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: "Not authenticated" }, 401)
  return c.json({ user: session.user, session: session.session })
})
```

- [ ] **Step 2: Create conversations handler**

Create `src/handlers/conversations.ts`:
```ts
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { AppEnv } from "../server.js"
import type { ConversationService } from "../services/conversation-service.js"
import type { Agent } from "../agent/index.js"

export function createConversationsHandler(service: ConversationService, agent: Agent) {
  const app = new Hono<AppEnv>()

  app.get("/api/conversations", async (c) => {
    const user = c.get("user")
    return c.json({ conversations: await service.listConversations(user.id) })
  })

  app.post("/api/conversations", async (c) => {
    const user = c.get("user")
    const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string })
    const conversation = await service.createConversation({ userId: user.id, title: body.title })
    return c.json({ conversation })
  })

  app.delete("/api/conversations/:id", async (c) => {
    const user = c.get("user")
    const conversationId = c.req.param("id")
    try {
      await service.deleteConversation({ userId: user.id, conversationId })
      return c.json({ success: true })
    } catch {
      return c.json({ error: "Conversation not found" }, 404)
    }
  })

  app.get("/api/conversations/:id", async (c) => {
    const user = c.get("user")
    const conversationId = c.req.param("id")
    try {
      const detail = await service.getConversationDetail({ userId: user.id, conversationId })
      return c.json(detail)
    } catch {
      return c.json({ error: "Conversation not found" }, 404)
    }
  })

  app.post("/api/conversations/:id/messages", async (c) => {
    const { prompt } = await c.req.json<{ prompt?: string }>()
    if (!prompt?.trim()) return c.json({ error: "Missing prompt" }, 400)

    const user = c.get("user")
    const conversationId = c.req.param("id")
    let preparedRun
    try {
      preparedRun = await service.prepareRun({ userId: user.id, conversationId, prompt })
    } catch {
      return c.json({ error: "Conversation not found" }, 404)
    }

    return streamSSE(c, async (stream) => {
      await service.updateConversationStatus(conversationId, "running")
      await service.recordUserMessage({ conversationId, content: prompt.trim() })

      const session = await agent.createSession({ conversationId, messages: preparedRun.history })
      let latestAssistantMessageId: string | null = null

      stream.onAbort(() => console.log(`[${session.id}] Client disconnected (${user.email})`))

      try {
        console.log(`[${session.id}] Starting conversation ${conversationId} for ${user.email}: ${prompt.slice(0, 50).trim()}...`)

        for await (const event of session.runStream(prompt)) {
          if (event.type === "message.appended" && event.role === "assistant") {
            latestAssistantMessageId = (await service.recordAssistantMessage({
              conversationId, content: event.content, status: "complete",
            })).id
          }
          if (event.type === "tool.called" && latestAssistantMessageId) {
            await service.recordToolCallStarted({ conversationId, messageId: latestAssistantMessageId, name: event.name, args: event.args })
          }
          if (event.type === "tool.completed") {
            await service.recordToolCallCompleted({ conversationId, name: event.name, result: event.result })
          }
          if (event.type === "task.created") {
            await service.upsertTask({ conversationId, taskId: event.taskId, subject: event.subject, status: "pending", blockedBy: [] })
            await service.recordTaskEvent({ conversationId, taskId: event.taskId, subject: event.subject, status: "pending" })
          }
          if (event.type === "task.updated") {
            await service.upsertTask({ conversationId, taskId: event.taskId, status: event.status as any })
            await service.recordTaskEvent({ conversationId, taskId: event.taskId, status: event.status })
          }
          if (event.type === "background.started" || event.type === "background.updated") {
            const bgTask = session.getState().backgroundTasks.find((t) => t.id === event.taskId)
            await service.upsertBackgroundTask({
              conversationId, taskId: event.taskId, command: bgTask?.command,
              summary: bgTask?.command?.trim().split(/\s+/).slice(0, 4).join(" "),
              status: event.status as any,
              completedAt: bgTask?.completedAt ? new Date(bgTask.completedAt).toISOString() : null,
              exitCode: bgTask?.exitCode ?? null,
            })
            await service.recordBackgroundEvent({
              conversationId, taskId: event.taskId, command: bgTask?.command,
              summary: bgTask?.command?.trim().split(/\s+/).slice(0, 4).join(" "),
              status: event.status as any,
            })
          }
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
          if (event.type === "session.failed") throw new Error(event.error)
        }

        const finalState = session.getState()
        await service.updateConversationStatus(conversationId, "completed")
        await stream.writeSSE({
          event: "session.completed",
          data: JSON.stringify({ output: finalState.messages.at(-1)?.content, steps: finalState.step, conversationId }),
        })
        console.log(`[${session.id}] Conversation ${conversationId} completed for ${user.email} (${finalState.step} steps)`)
      } catch (error) {
        await service.updateConversationStatus(conversationId, "failed")
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error(`[${session.id}] Error for ${user.email}:`, errorMessage)
        await stream.writeSSE({ event: "session.failed", data: JSON.stringify({ error: errorMessage, conversationId }) })
      }
    })
  })

  return app
}
```

- [ ] **Step 3: Create chat handler**

Create `src/handlers/chat.ts`:
```ts
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { AppEnv } from "../server.js"
import type { Agent } from "../agent/index.js"

export function createChatHandler(agent: Agent) {
  const app = new Hono<AppEnv>()

  app.post("/chat", async (c) => {
    const { prompt } = await c.req.json<{ prompt?: string }>()
    if (!prompt?.trim()) return c.json({ error: "Missing prompt" }, 400)

    const user = c.get("user")
    return streamSSE(c, async (stream) => {
      const session = await agent.createSession()
      stream.onAbort(() => console.log(`[${session.id}] Client disconnected (${user.email})`))

      try {
        console.log(`[${session.id}] Starting conversation for ${user.email}: ${prompt.slice(0, 50).trim()}...`)
        for await (const event of session.runStream(prompt)) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
        }
        const finalState = session.getState()
        await stream.writeSSE({
          event: "session.completed",
          data: JSON.stringify({ output: finalState.messages.at(-1)?.content, steps: finalState.step }),
        })
        console.log(`[${session.id}] Conversation completed for ${user.email} (${finalState.step} steps)`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error(`[${session.id}] Error for ${user.email}:`, errorMessage)
        await stream.writeSSE({ event: "session.failed", data: JSON.stringify({ error: errorMessage }) })
      }
    })
  })

  return app
}
```

- [ ] **Step 4: Commit**

```bash
git add src/handlers/
git commit -m "feat: add auth, conversations, and chat handlers"
```

---

## Task 10: Rewrite server.ts

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Rewrite server.ts**

Replace the entire content of `src/server.ts` with:
```ts
import { Hono, type MiddlewareHandler } from "hono"
import { cors } from "hono/cors"
import { auth } from "./auth.js"
import { db } from "./db/index.js"
import { createAgent, createAgentConfig } from "./agent/index.js"
import { ConversationRepository } from "./repositories/conversation-repository.js"
import { ConversationService } from "./services/conversation-service.js"
import { authHandler } from "./handlers/auth.js"
import { createConversationsHandler } from "./handlers/conversations.js"
import { createChatHandler } from "./handlers/chat.js"

export type SessionPayload = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>
export type AppEnv = {
  Variables: {
    session: SessionPayload["session"]
    user: SessionPayload["user"]
  }
}

const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
const isLocalDevOrigin = (origin: string) => LOCAL_DEV_ORIGIN_PATTERN.test(origin)
const getAllowedOrigins = () => {
  const configured = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean)
  if (configured && configured.length > 0) return configured
  return ["http://localhost:3000", "http://127.0.0.1:3000"]
}

const allowedOrigins = getAllowedOrigins()
const app = new Hono<AppEnv>()

app.use("*", cors({
  origin: (origin) => {
    if (!origin) return allowedOrigins[0] ?? ""
    if (isLocalDevOrigin(origin)) return origin
    return allowedOrigins.includes(origin) ? origin : ""
  },
  allowMethods: ["POST", "GET", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}))

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: "Authentication required" }, 401)
  c.set("session", session.session)
  c.set("user", session.user)
  await next()
}

const repo = new ConversationRepository(db)
const conversationService = new ConversationService(repo)
const agent = await createAgent({
  ...createAgentConfig(),
  conversationService,
})

app.get("/", (c) => c.json({ status: "ok", message: "AI Agent Server is running" }))
app.route("/", authHandler)
app.use("/api/conversations*", requireAuth)
app.use("/chat", requireAuth)
app.route("/", createConversationsHandler(conversationService, agent))
app.route("/", createChatHandler(agent))

const port = Number(process.env.PORT ?? 3001)
console.log(`AI Agent Server running on http://localhost:${port}`)
console.log(`Better Auth mounted at http://localhost:${port}/api/auth`)

export default { port, fetch: app.fetch, idleTimeout: 0 }
```

- [ ] **Step 2: Commit**

```bash
git add src/server.ts
git commit -m "feat: rewrite server.ts with clean handler routing, remove SQLite bootstrap"
```

---

## Task 11: Delete Old Files

**Files:**
- Delete: `src/db/queries.ts`
- Delete: `src/db/schema.ts`
- Delete: `src/stores/conversation-store.ts`

- [ ] **Step 1: Delete old files**

```bash
cd /home/kk/dev/agents/mynano-agent
rm src/db/queries.ts src/db/schema.ts
rm src/stores/conversation-store.ts
rmdir src/stores 2>/dev/null || true
```

- [ ] **Step 2: Verify no remaining imports of deleted files**

```bash
grep -r "conversation-store\|db/queries\|db/schema" src/ --include="*.ts"
```

Expected: no output (zero matches).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old SQLite store, raw query, and schema files"
```

---

## Task 12: Typecheck

**Files:** (all)

- [ ] **Step 1: Run typecheck**

```bash
cd /home/kk/dev/agents/mynano-agent
bun run typecheck
```

Expected: zero TypeScript errors.

If errors are found: fix them before proceeding. Common issues:
- Missing `await` on async service calls in handlers
- Import path issues (`.ts` vs `.js` extensions)
- Type mismatches on `PersistedTaskStatus` or `PersistedBackgroundStatus`

- [ ] **Step 2: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve typecheck errors after layered architecture migration"
```

---

## Task 13: Run Migrations

- [ ] **Step 1: Ensure PostgreSQL is running and DATABASE_URL is set**

```bash
export DATABASE_URL=postgresql://postgres:password@localhost:5432/mynano
```

Adjust user/password/host to your local PostgreSQL setup.

- [ ] **Step 2: Generate drizzle-kit migrations**

```bash
cd /home/kk/dev/agents/mynano-agent
DATABASE_URL=$DATABASE_URL bunx drizzle-kit generate
```

Expected: migration SQL file created in `src/db/migrations/`.

- [ ] **Step 3: Apply migrations**

```bash
DATABASE_URL=$DATABASE_URL bunx drizzle-kit migrate
```

Expected: `conversations` and related tables created in PostgreSQL.

- [ ] **Step 4: Run better-auth migration**

```bash
DATABASE_URL=$DATABASE_URL bunx better-auth migrate
```

Expected: `user`, `session`, `account`, `verification` tables created in PostgreSQL.

- [ ] **Step 5: Commit generated migrations**

```bash
git add src/db/migrations/
git commit -m "chore: add initial drizzle migration for conversation tables"
```

---

## Task 14: Smoke Test

- [ ] **Step 1: Start the server**

```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/mynano bun run dev
```

Expected: server starts on port 3001, no errors in console.

- [ ] **Step 2: Test health endpoint**

```bash
curl http://localhost:3001/
```

Expected: `{"status":"ok","message":"AI Agent Server is running"}`

- [ ] **Step 3: Test auth signup**

```bash
curl -X POST http://localhost:3001/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","name":"Test"}'
```

Expected: `{"token":"...","user":{...}}`

- [ ] **Step 4: Verify conversation tables exist in PostgreSQL**

Connect to your PostgreSQL DB and confirm tables: `conversations`, `conversation_messages`, `conversation_tool_calls`, `conversation_tasks`, `conversation_task_events`, `conversation_background_tasks`, `conversation_background_events`, `user`, `session`.

---

## Final Summary Document

After all tasks are complete, create a short change summary at `docs/changes-2026-03-21-pg-migration.md` listing:
- All files created
- All files modified
- All files deleted
- How to run the server with the new DATABASE_URL env var
