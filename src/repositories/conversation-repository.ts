import { eq, and, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type * as schema from "../db/schema/index.js"
import {
  conversations,
  conversationMessages,
  conversationToolCalls,
  conversationTasks,
  conversationTaskEvents,
  conversationBackgroundTasks,
  conversationBackgroundEvents,
} from "../db/schema/conversations.js"
import type {
  PersistedConversation,
  PersistedConversationMessage,
  PersistedConversationToolCall,
  PersistedConversationTask,
  PersistedConversationTaskEvent,
  PersistedConversationBackgroundTask,
  PersistedConversationBackgroundEvent,
} from "../types/conversation.js"

type DB = PostgresJsDatabase<typeof schema>

interface NewConversation {
  id: string
  userId: string
  title: string
  status: string
  createdAt: string
  updatedAt: string
}

interface TouchOpts {
  updatedAt: string
  lastMessageAt: string
  messageCountDelta: number
  newTitle?: string
}

interface NewMessage {
  id: string
  conversationId: string
  role: string
  content: string
  sequence: number
  status: string
  createdAt: string
}

interface NewToolCall {
  id: string
  conversationId: string
  messageId: string
  name: string
  argsJson?: string
  resultText?: string
  status: string
  sequence: number
  startedAt: string
  completedAt?: string
}

interface UpsertTask {
  conversationId: string
  taskId: number
  subject?: string
  description?: string
  status: string
  owner?: string
  blockedByJson: string
  createdAt: string
  updatedAt: string
}

interface NewTaskEvent {
  id: string
  conversationId: string
  taskId: number
  subject?: string
  status: string
  sequence: number
  updatedAt: string
}

interface UpsertBackgroundTask {
  conversationId: string
  taskId: string
  command?: string
  summary?: string
  status: string
  startedAt: string
  completedAt?: string
  exitCode?: number
}

interface NewBackgroundEvent {
  id: string
  conversationId: string
  taskId: string
  command?: string
  summary?: string
  status: string
  sequence: number
  updatedAt: string
}

export class ConversationRepository {
  constructor(private db: DB) {}

  async createConversation(data: NewConversation): Promise<void> {
    await this.db.insert(conversations).values({
      id: data.id,
      userId: data.userId,
      title: data.title,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    })
  }

  async getConversation(id: string): Promise<PersistedConversation | null> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
    return (rows[0] as PersistedConversation) ?? null
  }

  async listConversations(userId: string): Promise<PersistedConversation[]> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          sql`EXISTS (
            SELECT 1 FROM conversation_messages
            WHERE conversation_id = ${conversations.id} AND role = 'user'
          )`,
          sql`EXISTS (
            SELECT 1 FROM conversation_messages
            WHERE conversation_id = ${conversations.id} AND role = 'assistant'
          )`,
        ),
      )
      .orderBy(sql`${conversations.updatedAt} DESC, ${conversations.createdAt} DESC`)
    return rows as PersistedConversation[]
  }

  async touchConversation(id: string, opts: TouchOpts): Promise<void> {
    await this.db
      .update(conversations)
      .set({
        updatedAt: opts.updatedAt,
        lastMessageAt: opts.lastMessageAt,
        messageCount: sql`${conversations.messageCount} + ${opts.messageCountDelta}`,
        title: sql`CASE
          WHEN (${conversations.title} = 'New Conversation' OR ${conversations.title} = '')
            AND ${opts.newTitle ?? ""} != ''
          THEN ${opts.newTitle ?? ""}
          ELSE ${conversations.title}
        END`,
      })
      .where(eq(conversations.id, id))
  }

  async updateConversationStatus(id: string, status: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, id))
  }

  async deleteConversation(id: string): Promise<void> {
    await this.db
      .delete(conversationBackgroundEvents)
      .where(eq(conversationBackgroundEvents.conversationId, id))
    await this.db
      .delete(conversationTaskEvents)
      .where(eq(conversationTaskEvents.conversationId, id))
    await this.db
      .delete(conversationBackgroundTasks)
      .where(eq(conversationBackgroundTasks.conversationId, id))
    await this.db
      .delete(conversationTasks)
      .where(eq(conversationTasks.conversationId, id))
    await this.db
      .delete(conversationToolCalls)
      .where(eq(conversationToolCalls.conversationId, id))
    await this.db
      .delete(conversationMessages)
      .where(eq(conversationMessages.conversationId, id))
    await this.db
      .delete(conversations)
      .where(eq(conversations.id, id))
  }

  async appendMessage(data: NewMessage): Promise<void> {
    await this.db.insert(conversationMessages).values({
      id: data.id,
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      sequence: data.sequence,
      status: data.status,
      createdAt: data.createdAt,
    })
  }

  async listMessages(conversationId: string): Promise<PersistedConversationMessage[]> {
    const rows = await this.db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(sql`${conversationMessages.sequence} ASC, ${conversationMessages.createdAt} ASC`)
    return rows as PersistedConversationMessage[]
  }

  async deleteConversationMessages(conversationId: string): Promise<void> {
    await this.db
      .delete(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
  }

  async appendToolCall(data: NewToolCall): Promise<void> {
    await this.db.insert(conversationToolCalls).values({
      id: data.id,
      conversationId: data.conversationId,
      messageId: data.messageId,
      name: data.name,
      argsJson: data.argsJson,
      resultText: data.resultText,
      status: data.status,
      sequence: data.sequence,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
    })
  }

  async completeLatestToolCall(
    conversationId: string,
    name: string,
    result: string,
    completedAt: string,
  ): Promise<void> {
    await this.db
      .update(conversationToolCalls)
      .set({ resultText: result, status: "completed", completedAt })
      .where(
        eq(
          conversationToolCalls.id,
          sql`(
            SELECT id FROM conversation_tool_calls
            WHERE conversation_id = ${conversationId}
              AND name = ${name}
              AND status = 'running'
            ORDER BY sequence DESC
            LIMIT 1
          )`,
        ),
      )
  }

  async listToolCalls(conversationId: string): Promise<PersistedConversationToolCall[]> {
    const rows = await this.db
      .select()
      .from(conversationToolCalls)
      .where(eq(conversationToolCalls.conversationId, conversationId))
      .orderBy(sql`${conversationToolCalls.sequence} ASC, ${conversationToolCalls.startedAt} ASC`)
    return rows as PersistedConversationToolCall[]
  }

  async deleteConversationToolCalls(conversationId: string): Promise<void> {
    await this.db
      .delete(conversationToolCalls)
      .where(eq(conversationToolCalls.conversationId, conversationId))
  }

  async upsertTask(data: UpsertTask): Promise<void> {
    await this.db
      .insert(conversationTasks)
      .values({
        conversationId: data.conversationId,
        taskId: data.taskId,
        subject: data.subject,
        description: data.description,
        status: data.status,
        owner: data.owner,
        blockedByJson: data.blockedByJson,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      })
      .onConflictDoUpdate({
        target: [conversationTasks.conversationId, conversationTasks.taskId],
        set: {
          subject: sql`COALESCE(excluded.subject, ${conversationTasks.subject})`,
          description: sql`COALESCE(excluded.description, ${conversationTasks.description})`,
          status: sql`excluded.status`,
          owner: sql`COALESCE(excluded.owner, ${conversationTasks.owner})`,
          blockedByJson: sql`excluded.blocked_by_json`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  async listTasks(conversationId: string): Promise<PersistedConversationTask[]> {
    const rows = await this.db
      .select()
      .from(conversationTasks)
      .where(eq(conversationTasks.conversationId, conversationId))
      .orderBy(sql`${conversationTasks.updatedAt} ASC, ${conversationTasks.taskId} ASC`)
    return rows as PersistedConversationTask[]
  }

  async getTask(conversationId: string, taskId: number): Promise<PersistedConversationTask | null> {
    const rows = await this.db
      .select()
      .from(conversationTasks)
      .where(
        and(
          eq(conversationTasks.conversationId, conversationId),
          eq(conversationTasks.taskId, taskId),
        ),
      )
    return (rows[0] as PersistedConversationTask) ?? null
  }

  async deleteConversationTasks(conversationId: string): Promise<void> {
    await this.db
      .delete(conversationTasks)
      .where(eq(conversationTasks.conversationId, conversationId))
  }

  async appendTaskEvent(data: NewTaskEvent): Promise<void> {
    await this.db.insert(conversationTaskEvents).values({
      id: data.id,
      conversationId: data.conversationId,
      taskId: data.taskId,
      subject: data.subject,
      status: data.status,
      sequence: data.sequence,
      updatedAt: data.updatedAt,
    })
  }

  async listTaskEvents(conversationId: string): Promise<PersistedConversationTaskEvent[]> {
    const rows = await this.db
      .select()
      .from(conversationTaskEvents)
      .where(eq(conversationTaskEvents.conversationId, conversationId))
      .orderBy(sql`${conversationTaskEvents.sequence} ASC, ${conversationTaskEvents.updatedAt} ASC`)
    return rows as PersistedConversationTaskEvent[]
  }

  async deleteConversationTaskEvents(conversationId: string): Promise<void> {
    await this.db
      .delete(conversationTaskEvents)
      .where(eq(conversationTaskEvents.conversationId, conversationId))
  }

  async upsertBackgroundTask(data: UpsertBackgroundTask): Promise<void> {
    await this.db
      .insert(conversationBackgroundTasks)
      .values({
        conversationId: data.conversationId,
        taskId: data.taskId,
        command: data.command,
        summary: data.summary,
        status: data.status,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        exitCode: data.exitCode,
      })
      .onConflictDoUpdate({
        target: [
          conversationBackgroundTasks.conversationId,
          conversationBackgroundTasks.taskId,
        ],
        set: {
          command: sql`COALESCE(excluded.command, ${conversationBackgroundTasks.command})`,
          summary: sql`COALESCE(excluded.summary, ${conversationBackgroundTasks.summary})`,
          status: sql`excluded.status`,
          startedAt: sql`COALESCE(${conversationBackgroundTasks.startedAt}, excluded.started_at)`,
          completedAt: sql`COALESCE(excluded.completed_at, ${conversationBackgroundTasks.completedAt})`,
          exitCode: sql`COALESCE(excluded.exit_code, ${conversationBackgroundTasks.exitCode})`,
        },
      })
  }

  async listBackgroundTasks(conversationId: string): Promise<PersistedConversationBackgroundTask[]> {
    const rows = await this.db
      .select()
      .from(conversationBackgroundTasks)
      .where(eq(conversationBackgroundTasks.conversationId, conversationId))
      .orderBy(
        sql`${conversationBackgroundTasks.startedAt} ASC, ${conversationBackgroundTasks.taskId} ASC`,
      )
    return rows as PersistedConversationBackgroundTask[]
  }

  async getBackgroundTask(
    conversationId: string,
    taskId: string,
  ): Promise<PersistedConversationBackgroundTask | null> {
    const rows = await this.db
      .select()
      .from(conversationBackgroundTasks)
      .where(
        and(
          eq(conversationBackgroundTasks.conversationId, conversationId),
          eq(conversationBackgroundTasks.taskId, taskId),
        ),
      )
    return (rows[0] as PersistedConversationBackgroundTask) ?? null
  }

  async deleteConversationBackgroundTasks(conversationId: string): Promise<void> {
    await this.db
      .delete(conversationBackgroundTasks)
      .where(eq(conversationBackgroundTasks.conversationId, conversationId))
  }

  async appendBackgroundEvent(data: NewBackgroundEvent): Promise<void> {
    await this.db.insert(conversationBackgroundEvents).values({
      id: data.id,
      conversationId: data.conversationId,
      taskId: data.taskId,
      command: data.command,
      summary: data.summary,
      status: data.status,
      sequence: data.sequence,
      updatedAt: data.updatedAt,
    })
  }

  async listBackgroundEvents(conversationId: string): Promise<PersistedConversationBackgroundEvent[]> {
    const rows = await this.db
      .select()
      .from(conversationBackgroundEvents)
      .where(eq(conversationBackgroundEvents.conversationId, conversationId))
      .orderBy(
        sql`${conversationBackgroundEvents.sequence} ASC, ${conversationBackgroundEvents.updatedAt} ASC`,
      )
    return rows as PersistedConversationBackgroundEvent[]
  }

  async deleteConversationBackgroundEvents(conversationId: string): Promise<void> {
    await this.db
      .delete(conversationBackgroundEvents)
      .where(eq(conversationBackgroundEvents.conversationId, conversationId))
  }

  async getNextSequence(conversationId: string): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT MAX(sequence) AS max_sequence
      FROM (
        SELECT sequence FROM conversation_messages WHERE conversation_id = ${conversationId}
        UNION ALL
        SELECT sequence FROM conversation_tool_calls WHERE conversation_id = ${conversationId}
        UNION ALL
        SELECT sequence FROM conversation_task_events WHERE conversation_id = ${conversationId}
        UNION ALL
        SELECT sequence FROM conversation_background_events WHERE conversation_id = ${conversationId}
      ) t
    `)
    const maxSeq = (result[0] as { max_sequence: number | null })?.max_sequence
    return (maxSeq ?? 0) + 1
  }

  async getNextTaskId(conversationId: string): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT MAX(task_id) AS max_task_id
      FROM conversation_tasks
      WHERE conversation_id = ${conversationId}
    `)
    const maxId = (result[0] as { max_task_id: number | null })?.max_task_id
    return (maxId ?? 0) + 1
  }
}
