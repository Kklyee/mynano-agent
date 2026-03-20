import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  PersistedBackgroundStatus,
  PersistedConversation,
  PersistedConversationBackgroundEvent,
  PersistedConversationBackgroundTask,
  PersistedConversationMessage,
  PersistedConversationStatus,
  PersistedConversationTask,
  PersistedConversationTaskEvent,
  PersistedConversationToolCall,
  PersistedMessageRole,
  PersistedMessageStatus,
  PersistedTaskStatus,
  PersistedToolStatus,
} from "./conversation-types";

type CreateConversationInput = {
  userId: string;
  title: string;
};

type AppendMessageInput = {
  conversationId: string;
  role: PersistedMessageRole;
  content: string;
  sequence: number;
  status: PersistedMessageStatus;
  createdAt?: string;
};

type AppendToolCallInput = {
  conversationId: string;
  messageId: string;
  name: string;
  argsJson: string | null;
  resultText: string | null;
  status: PersistedToolStatus;
  sequence: number;
  startedAt: string;
  completedAt?: string | null;
};

type UpsertTaskInput = {
  conversationId: string;
  taskId: number;
  subject?: string | null;
  description?: string | null;
  status: PersistedTaskStatus;
  owner?: string | null;
  blockedBy?: number[];
  createdAt?: string;
  updatedAt: string;
};

type AppendTaskEventInput = {
  conversationId: string;
  taskId: number;
  subject: string | null;
  status: string;
  sequence: number;
  updatedAt: string;
};

type UpsertBackgroundTaskInput = {
  conversationId: string;
  taskId: string;
  command?: string | null;
  summary?: string | null;
  status: PersistedBackgroundStatus;
  startedAt?: string;
  completedAt?: string | null;
  exitCode?: number | null;
};

type AppendBackgroundEventInput = {
  conversationId: string;
  taskId: string;
  command: string | null;
  summary: string | null;
  status: PersistedBackgroundStatus;
  sequence: number;
  updatedAt: string;
};

type Statement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};

const parseBlockedBy = (value: unknown): number[] => {
  if (typeof value !== "string" || !value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => Number(item)).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
};

const toConversation = (row: Record<string, unknown>): PersistedConversation => ({
  id: String(row.id),
  userId: String(row.user_id),
  title: String(row.title),
  status: String(row.status) as PersistedConversationStatus,
  summary: row.summary === null ? null : String(row.summary),
  messageCount: Number(row.message_count),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  lastMessageAt: row.last_message_at === null ? null : String(row.last_message_at),
});

const toMessage = (row: Record<string, unknown>): PersistedConversationMessage => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  role: String(row.role) as PersistedMessageRole,
  content: String(row.content),
  sequence: Number(row.sequence),
  status: String(row.status) as PersistedMessageStatus,
  createdAt: String(row.created_at),
});

const toToolCall = (row: Record<string, unknown>): PersistedConversationToolCall => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  messageId: String(row.message_id),
  name: String(row.name),
  argsJson: row.args_json === null ? null : String(row.args_json),
  resultText: row.result_text === null ? null : String(row.result_text),
  status: String(row.status) as PersistedToolStatus,
  sequence: Number(row.sequence),
  startedAt: String(row.started_at),
  completedAt: row.completed_at === null ? null : String(row.completed_at),
});

const toTask = (row: Record<string, unknown>): PersistedConversationTask => ({
  conversationId: String(row.conversation_id),
  taskId: Number(row.task_id),
  subject: row.subject === null ? null : String(row.subject),
  description: row.description === null ? null : String(row.description),
  status: String(row.status) as PersistedTaskStatus,
  owner: row.owner === null ? null : String(row.owner),
  blockedBy: parseBlockedBy(row.blocked_by_json),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const toTaskEvent = (row: Record<string, unknown>): PersistedConversationTaskEvent => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  taskId: Number(row.task_id),
  subject: row.subject === null ? null : String(row.subject),
  status: String(row.status),
  sequence: Number(row.sequence),
  updatedAt: String(row.updated_at),
});

const toBackgroundTask = (row: Record<string, unknown>): PersistedConversationBackgroundTask => ({
  conversationId: String(row.conversation_id),
  taskId: String(row.task_id),
  command: row.command === null ? null : String(row.command),
  summary: row.summary === null ? null : String(row.summary),
  status: String(row.status) as PersistedBackgroundStatus,
  startedAt: String(row.started_at),
  completedAt: row.completed_at === null ? null : String(row.completed_at),
  exitCode: row.exit_code === null ? null : Number(row.exit_code),
});

const toBackgroundEvent = (row: Record<string, unknown>): PersistedConversationBackgroundEvent => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  taskId: String(row.task_id),
  command: row.command === null ? null : String(row.command),
  summary: row.summary === null ? null : String(row.summary),
  status: String(row.status) as PersistedBackgroundStatus,
  sequence: Number(row.sequence),
  updatedAt: String(row.updated_at),
});

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createTimestamp() {
  return new Date().toISOString();
}

async function openDatabase(databasePath: string): Promise<SqliteDatabase> {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  if ("Bun" in globalThis) {
    const moduleName = "bun:sqlite";
    const sqliteModule = (await import(moduleName)) as {
      Database: new (
        path: string,
        options?: {
          create?: boolean;
        },
      ) => {
        exec(sql: string): void;
        query(sql: string): {
          run(...params: unknown[]): unknown;
          get(...params: unknown[]): unknown;
          all(...params: unknown[]): unknown[];
        };
        close(): void;
      };
    };
    const database = new sqliteModule.Database(databasePath, { create: true });

    return {
      exec(sql: string) {
        database.exec(sql);
      },
      prepare(sql: string): Statement {
        const query = database.query(sql);
        return {
          run: (...params) => query.run(...params),
          get: (...params) => query.get(...params),
          all: (...params) => query.all(...params),
        };
      },
      close() {
        database.close();
      },
    };
  }

  const sqliteModule = await import("node:sqlite");
  const database = new sqliteModule.DatabaseSync(databasePath);

  return {
    exec(sql: string) {
      database.exec(sql);
    },
    prepare(sql: string): Statement {
      const statement = database.prepare(sql);
      return {
        run: (...params) => statement.run(...(params as any[])),
        get: (...params) => statement.get(...(params as any[])),
        all: (...params) => statement.all(...(params as any[])),
      };
    },
    close() {
      database.close();
    },
  };
}

export async function createConversationStore(databasePath: string) {
  const database = await openDatabase(databasePath);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT
    );

    CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
      ON conversations (user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS conversation_messages_conversation_sequence_idx
      ON conversation_messages (conversation_id, sequence ASC);

    CREATE TABLE IF NOT EXISTS conversation_tool_calls (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      name TEXT NOT NULL,
      args_json TEXT,
      result_text TEXT,
      status TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS conversation_tool_calls_conversation_sequence_idx
      ON conversation_tool_calls (conversation_id, sequence ASC);

    CREATE TABLE IF NOT EXISTS conversation_tasks (
      conversation_id TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      subject TEXT,
      description TEXT,
      status TEXT NOT NULL,
      owner TEXT,
      blocked_by_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, task_id)
    );

    CREATE INDEX IF NOT EXISTS conversation_tasks_conversation_updated_idx
      ON conversation_tasks (conversation_id, updated_at DESC, task_id DESC);

    CREATE TABLE IF NOT EXISTS conversation_task_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      subject TEXT,
      status TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS conversation_task_events_conversation_sequence_idx
      ON conversation_task_events (conversation_id, sequence ASC);

    CREATE TABLE IF NOT EXISTS conversation_background_tasks (
      conversation_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      command TEXT,
      summary TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      exit_code INTEGER,
      PRIMARY KEY (conversation_id, task_id)
    );

    CREATE INDEX IF NOT EXISTS conversation_background_tasks_conversation_started_idx
      ON conversation_background_tasks (conversation_id, started_at ASC);

    CREATE TABLE IF NOT EXISTS conversation_background_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      command TEXT,
      summary TEXT,
      status TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS conversation_background_events_conversation_sequence_idx
      ON conversation_background_events (conversation_id, sequence ASC);
  `);

  const createConversationStatement = database.prepare(`
    INSERT INTO conversations (
      id, user_id, title, status, summary, message_count, created_at, updated_at, last_message_at
    ) VALUES (
      ?, ?, ?, ?, NULL, 0, ?, ?, NULL
    )
  `);
  const selectConversationStatement = database.prepare(`
    SELECT *
    FROM conversations
    WHERE id = ?
  `);
  const listConversationStatement = database.prepare(`
    SELECT *
    FROM conversations
    WHERE user_id = ?
      AND EXISTS (
        SELECT 1
        FROM conversation_messages
        WHERE conversation_id = conversations.id AND role = 'user'
      )
      AND EXISTS (
        SELECT 1
        FROM conversation_messages
        WHERE conversation_id = conversations.id AND role = 'assistant'
      )
    ORDER BY updated_at DESC, created_at DESC
  `);
  const appendMessageStatement = database.prepare(`
    INSERT INTO conversation_messages (
      id, conversation_id, role, content, sequence, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const listMessagesStatement = database.prepare(`
    SELECT *
    FROM conversation_messages
    WHERE conversation_id = ?
    ORDER BY sequence ASC, created_at ASC
  `);
  const appendToolCallStatement = database.prepare(`
    INSERT INTO conversation_tool_calls (
      id, conversation_id, message_id, name, args_json, result_text, status, sequence, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listToolCallsStatement = database.prepare(`
    SELECT *
    FROM conversation_tool_calls
    WHERE conversation_id = ?
    ORDER BY sequence ASC, started_at ASC
  `);
  const updateLatestToolCallStatement = database.prepare(`
    UPDATE conversation_tool_calls
    SET result_text = ?, status = ?, completed_at = ?
    WHERE id = (
      SELECT id
      FROM conversation_tool_calls
      WHERE conversation_id = ? AND name = ? AND status = 'running'
      ORDER BY sequence DESC
      LIMIT 1
    )
  `);
  const upsertTaskStatement = database.prepare(`
    INSERT INTO conversation_tasks (
      conversation_id, task_id, subject, description, status, owner, blocked_by_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id, task_id) DO UPDATE SET
      subject = COALESCE(excluded.subject, conversation_tasks.subject),
      description = COALESCE(excluded.description, conversation_tasks.description),
      status = excluded.status,
      owner = COALESCE(excluded.owner, conversation_tasks.owner),
      blocked_by_json = excluded.blocked_by_json,
      updated_at = excluded.updated_at
  `);
  const listTasksStatement = database.prepare(`
    SELECT *
    FROM conversation_tasks
    WHERE conversation_id = ?
    ORDER BY updated_at ASC, task_id ASC
  `);
  const getTaskStatement = database.prepare(`
    SELECT *
    FROM conversation_tasks
    WHERE conversation_id = ? AND task_id = ?
  `);
  const appendTaskEventStatement = database.prepare(`
    INSERT INTO conversation_task_events (
      id, conversation_id, task_id, subject, status, sequence, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const listTaskEventsStatement = database.prepare(`
    SELECT *
    FROM conversation_task_events
    WHERE conversation_id = ?
    ORDER BY sequence ASC, updated_at ASC
  `);
  const upsertBackgroundTaskStatement = database.prepare(`
    INSERT INTO conversation_background_tasks (
      conversation_id, task_id, command, summary, status, started_at, completed_at, exit_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id, task_id) DO UPDATE SET
      command = COALESCE(excluded.command, conversation_background_tasks.command),
      summary = COALESCE(excluded.summary, conversation_background_tasks.summary),
      status = excluded.status,
      started_at = COALESCE(conversation_background_tasks.started_at, excluded.started_at),
      completed_at = COALESCE(excluded.completed_at, conversation_background_tasks.completed_at),
      exit_code = COALESCE(excluded.exit_code, conversation_background_tasks.exit_code)
  `);
  const listBackgroundTasksStatement = database.prepare(`
    SELECT *
    FROM conversation_background_tasks
    WHERE conversation_id = ?
    ORDER BY started_at ASC, task_id ASC
  `);
  const getBackgroundTaskStatement = database.prepare(`
    SELECT *
    FROM conversation_background_tasks
    WHERE conversation_id = ? AND task_id = ?
  `);
  const appendBackgroundEventStatement = database.prepare(`
    INSERT INTO conversation_background_events (
      id, conversation_id, task_id, command, summary, status, sequence, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listBackgroundEventsStatement = database.prepare(`
    SELECT *
    FROM conversation_background_events
    WHERE conversation_id = ?
    ORDER BY sequence ASC, updated_at ASC
  `);
  const updateConversationTouchStatement = database.prepare(`
    UPDATE conversations
    SET
      updated_at = ?,
      last_message_at = ?,
      message_count = message_count + ?,
      title = CASE
        WHEN (title = 'New Conversation' OR title = '') AND ? != '' THEN ?
        ELSE title
      END
    WHERE id = ?
  `);
  const updateConversationStatusStatement = database.prepare(`
    UPDATE conversations
    SET status = ?, updated_at = ?
    WHERE id = ?
  `);
  const deleteConversationStatement = database.prepare(`
    DELETE FROM conversations WHERE id = ?
  `);
  const deleteConversationMessagesStatement = database.prepare(`
    DELETE FROM conversation_messages WHERE conversation_id = ?
  `);
  const deleteConversationToolCallsStatement = database.prepare(`
    DELETE FROM conversation_tool_calls WHERE conversation_id = ?
  `);
  const deleteConversationTasksStatement = database.prepare(`
    DELETE FROM conversation_tasks WHERE conversation_id = ?
  `);
  const deleteConversationTaskEventsStatement = database.prepare(`
    DELETE FROM conversation_task_events WHERE conversation_id = ?
  `);
  const deleteConversationBackgroundTasksStatement = database.prepare(`
    DELETE FROM conversation_background_tasks WHERE conversation_id = ?
  `);
  const deleteConversationBackgroundEventsStatement = database.prepare(`
    DELETE FROM conversation_background_events WHERE conversation_id = ?
  `);
  const nextSequenceStatement = database.prepare(`
    SELECT MAX(sequence) AS max_sequence
    FROM (
      SELECT sequence FROM conversation_messages WHERE conversation_id = ?
      UNION ALL
      SELECT sequence FROM conversation_tool_calls WHERE conversation_id = ?
      UNION ALL
      SELECT sequence FROM conversation_task_events WHERE conversation_id = ?
      UNION ALL
      SELECT sequence FROM conversation_background_events WHERE conversation_id = ?
    )
  `);
  const nextTaskIdStatement = database.prepare(`
    SELECT MAX(task_id) AS max_task_id
    FROM conversation_tasks
    WHERE conversation_id = ?
  `);

  return {
    createConversation(input: CreateConversationInput): PersistedConversation {
      const timestamp = createTimestamp();
      const id = createId("conversation");
      createConversationStatement.run(
        id,
        input.userId,
        input.title,
        "idle",
        timestamp,
        timestamp,
      );

      const row = selectConversationStatement.get(id) as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error(`Conversation ${id} was not created`);
      }

      return toConversation(row);
    },

    getConversation(conversationId: string): PersistedConversation | null {
      const row = selectConversationStatement.get(conversationId) as
        | Record<string, unknown>
        | undefined;
      return row ? toConversation(row) : null;
    },

    listConversations(userId: string): PersistedConversation[] {
      return listConversationStatement
        .all(userId)
        .map((row) => toConversation(row as Record<string, unknown>));
    },

    appendMessage(input: AppendMessageInput): PersistedConversationMessage {
      const timestamp = input.createdAt ?? createTimestamp();
      const id = createId("message");
      appendMessageStatement.run(
        id,
        input.conversationId,
        input.role,
        input.content,
        input.sequence,
        input.status,
        timestamp,
      );
      updateConversationTouchStatement.run(
        timestamp,
        timestamp,
        1,
        input.role === "user" ? input.content.slice(0, 80) : "",
        input.role === "user" ? input.content.slice(0, 80) : "",
        input.conversationId,
      );

      return {
        id,
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        sequence: input.sequence,
        status: input.status,
        createdAt: timestamp,
      };
    },

    listMessages(conversationId: string): PersistedConversationMessage[] {
      return listMessagesStatement
        .all(conversationId)
        .map((row) => toMessage(row as Record<string, unknown>));
    },

    appendToolCall(input: AppendToolCallInput): PersistedConversationToolCall {
      const id = createId("tool");
      appendToolCallStatement.run(
        id,
        input.conversationId,
        input.messageId,
        input.name,
        input.argsJson,
        input.resultText,
        input.status,
        input.sequence,
        input.startedAt,
        input.completedAt ?? null,
      );

      return {
        id,
        conversationId: input.conversationId,
        messageId: input.messageId,
        name: input.name,
        argsJson: input.argsJson,
        resultText: input.resultText,
        status: input.status,
        sequence: input.sequence,
        startedAt: input.startedAt,
        completedAt: input.completedAt ?? null,
      };
    },

    completeLatestToolCall(
      conversationId: string,
      name: string,
      resultText: string,
    ): PersistedConversationToolCall | null {
      const completedAt = createTimestamp();
      updateLatestToolCallStatement.run(
        resultText,
        "completed",
        completedAt,
        conversationId,
        name,
      );

      const latest = listToolCallsStatement
        .all(conversationId)
        .map((row) => toToolCall(row as Record<string, unknown>))
        .filter((toolCall) => toolCall.name === name)
        .at(-1);

      return latest ?? null;
    },

    listToolCalls(conversationId: string): PersistedConversationToolCall[] {
      return listToolCallsStatement
        .all(conversationId)
        .map((row) => toToolCall(row as Record<string, unknown>));
    },

    upsertTask(input: UpsertTaskInput): PersistedConversationTask {
      const existingRow = getTaskStatement.get(
        input.conversationId,
        input.taskId,
      ) as Record<string, unknown> | undefined;
      const existing = existingRow ? toTask(existingRow) : null;
      const createdAt = existing?.createdAt ?? input.createdAt ?? input.updatedAt;
      const blockedBy = JSON.stringify(input.blockedBy ?? existing?.blockedBy ?? []);

      upsertTaskStatement.run(
        input.conversationId,
        input.taskId,
        input.subject ?? existing?.subject ?? null,
        input.description ?? existing?.description ?? null,
        input.status,
        input.owner ?? existing?.owner ?? null,
        blockedBy,
        createdAt,
        input.updatedAt,
      );

      const row = getTaskStatement.get(input.conversationId, input.taskId) as Record<string, unknown>;
      return toTask(row);
    },

    getTask(conversationId: string, taskId: number): PersistedConversationTask | null {
      const row = getTaskStatement.get(conversationId, taskId) as Record<string, unknown> | undefined;
      return row ? toTask(row) : null;
    },

    listTasks(conversationId: string): PersistedConversationTask[] {
      return listTasksStatement
        .all(conversationId)
        .map((row) => toTask(row as Record<string, unknown>));
    },

    appendTaskEvent(input: AppendTaskEventInput): PersistedConversationTaskEvent {
      const id = createId("task_event");
      appendTaskEventStatement.run(
        id,
        input.conversationId,
        input.taskId,
        input.subject,
        input.status,
        input.sequence,
        input.updatedAt,
      );

      return {
        id,
        conversationId: input.conversationId,
        taskId: input.taskId,
        subject: input.subject,
        status: input.status,
        sequence: input.sequence,
        updatedAt: input.updatedAt,
      };
    },

    listTaskEvents(conversationId: string): PersistedConversationTaskEvent[] {
      return listTaskEventsStatement
        .all(conversationId)
        .map((row) => toTaskEvent(row as Record<string, unknown>));
    },

    getNextTaskId(conversationId: string): number {
      const row = nextTaskIdStatement.get(conversationId) as { max_task_id: number | null } | undefined;
      return (row?.max_task_id ?? 0) + 1;
    },

    upsertBackgroundTask(input: UpsertBackgroundTaskInput): PersistedConversationBackgroundTask {
      const existingRow = getBackgroundTaskStatement.get(
        input.conversationId,
        input.taskId,
      ) as Record<string, unknown> | undefined;
      const existing = existingRow ? toBackgroundTask(existingRow) : null;
      const startedAt = existing?.startedAt ?? input.startedAt ?? createTimestamp();
      const completedAt = input.completedAt ?? existing?.completedAt ?? null;
      const exitCode = input.exitCode ?? existing?.exitCode ?? null;

      upsertBackgroundTaskStatement.run(
        input.conversationId,
        input.taskId,
        input.command ?? existing?.command ?? null,
        input.summary ?? existing?.summary ?? null,
        input.status,
        startedAt,
        completedAt,
        exitCode,
      );

      const row = getBackgroundTaskStatement.get(
        input.conversationId,
        input.taskId,
      ) as Record<string, unknown>;
      return toBackgroundTask(row);
    },

    getBackgroundTask(
      conversationId: string,
      taskId: string,
    ): PersistedConversationBackgroundTask | null {
      const row = getBackgroundTaskStatement.get(
        conversationId,
        taskId,
      ) as Record<string, unknown> | undefined;
      return row ? toBackgroundTask(row) : null;
    },

    listBackgroundTasks(conversationId: string): PersistedConversationBackgroundTask[] {
      return listBackgroundTasksStatement
        .all(conversationId)
        .map((row) => toBackgroundTask(row as Record<string, unknown>));
    },

    appendBackgroundEvent(input: AppendBackgroundEventInput): PersistedConversationBackgroundEvent {
      const id = createId("background_event");
      appendBackgroundEventStatement.run(
        id,
        input.conversationId,
        input.taskId,
        input.command,
        input.summary,
        input.status,
        input.sequence,
        input.updatedAt,
      );

      return {
        id,
        conversationId: input.conversationId,
        taskId: input.taskId,
        command: input.command,
        summary: input.summary,
        status: input.status,
        sequence: input.sequence,
        updatedAt: input.updatedAt,
      };
    },

    listBackgroundEvents(conversationId: string): PersistedConversationBackgroundEvent[] {
      return listBackgroundEventsStatement
        .all(conversationId)
        .map((row) => toBackgroundEvent(row as Record<string, unknown>));
    },

    getNextSequence(conversationId: string): number {
      const row = nextSequenceStatement.get(
        conversationId,
        conversationId,
        conversationId,
        conversationId,
      ) as
        | {
            max_sequence: number | null;
          }
        | undefined;

      return (row?.max_sequence ?? -1) + 1;
    },

    updateConversationStatus(
      conversationId: string,
      status: PersistedConversationStatus,
    ) {
      updateConversationStatusStatement.run(
        status,
        createTimestamp(),
        conversationId,
      );
    },

    deleteConversation(conversationId: string): void {
      deleteConversationBackgroundEventsStatement.run(conversationId);
      deleteConversationBackgroundTasksStatement.run(conversationId);
      deleteConversationTaskEventsStatement.run(conversationId);
      deleteConversationTasksStatement.run(conversationId);
      deleteConversationToolCallsStatement.run(conversationId);
      deleteConversationMessagesStatement.run(conversationId);
      deleteConversationStatement.run(conversationId);
    },

    close() {
      database.close();
    },
  };
}

export type ConversationStore = Awaited<ReturnType<typeof createConversationStore>>;
