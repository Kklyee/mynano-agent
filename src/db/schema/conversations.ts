import {
  pgTable,
  text,
  integer,
  index,
  primaryKey,
} from "drizzle-orm/pg-core"

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
  (t) => [
    index("conversation_messages_conversation_sequence_idx").on(
      t.conversationId,
      t.sequence,
    ),
  ],
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
  (t) => [
    index("conversation_tool_calls_conversation_sequence_idx").on(
      t.conversationId,
      t.sequence,
    ),
  ],
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
    index("conversation_tasks_conversation_updated_idx").on(
      t.conversationId,
      t.updatedAt,
      t.taskId,
    ),
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
  (t) => [
    index("conversation_task_events_conversation_sequence_idx").on(
      t.conversationId,
      t.sequence,
    ),
  ],
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
    index("conversation_background_tasks_conversation_started_idx").on(
      t.conversationId,
      t.startedAt,
    ),
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
  (t) => [
    index("conversation_background_events_conversation_sequence_idx").on(
      t.conversationId,
      t.sequence,
    ),
  ],
)
