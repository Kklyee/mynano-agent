import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  PersistedConversation,
  PersistedConversationMessage,
  PersistedConversationTaskEvent,
  PersistedConversationToolCall,
  PersistedConversationStatus,
  PersistedMessageRole,
  PersistedMessageStatus,
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

type AppendTaskEventInput = {
  conversationId: string;
  taskId: number;
  subject: string | null;
  status: string;
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

const toTaskEvent = (row: Record<string, unknown>): PersistedConversationTaskEvent => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  taskId: Number(row.task_id),
  subject: row.subject === null ? null : String(row.subject),
  status: String(row.status),
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
  const nextSequenceStatement = database.prepare(`
    SELECT MAX(sequence) AS max_sequence
    FROM (
      SELECT sequence FROM conversation_messages WHERE conversation_id = ?
      UNION ALL
      SELECT sequence FROM conversation_tool_calls WHERE conversation_id = ?
      UNION ALL
      SELECT sequence FROM conversation_task_events WHERE conversation_id = ?
    )
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

    appendTaskEvent(input: AppendTaskEventInput): PersistedConversationTaskEvent {
      const id = createId("task");
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

    getNextSequence(conversationId: string): number {
      const row = nextSequenceStatement.get(
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

    close() {
      database.close();
    },
  };
}

export type ConversationStore = Awaited<ReturnType<typeof createConversationStore>>;
