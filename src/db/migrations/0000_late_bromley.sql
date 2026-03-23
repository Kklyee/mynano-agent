CREATE TABLE "conversation_background_events" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"task_id" text NOT NULL,
	"command" text,
	"summary" text,
	"status" text NOT NULL,
	"sequence" integer NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_background_tasks" (
	"conversation_id" text NOT NULL,
	"task_id" text NOT NULL,
	"command" text,
	"summary" text,
	"status" text NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text,
	"exit_code" integer,
	CONSTRAINT "conversation_background_tasks_conversation_id_task_id_pk" PRIMARY KEY("conversation_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sequence" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_task_events" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"task_id" integer NOT NULL,
	"subject" text,
	"status" text NOT NULL,
	"sequence" integer NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_tasks" (
	"conversation_id" text NOT NULL,
	"task_id" integer NOT NULL,
	"subject" text,
	"description" text,
	"status" text NOT NULL,
	"owner" text,
	"blocked_by_json" text DEFAULT '[]' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "conversation_tasks_conversation_id_task_id_pk" PRIMARY KEY("conversation_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"name" text NOT NULL,
	"args_json" text,
	"result_text" text,
	"status" text NOT NULL,
	"sequence" integer NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"summary" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"last_message_at" text
);
--> statement-breakpoint
CREATE INDEX "conversation_background_events_conversation_sequence_idx" ON "conversation_background_events" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_background_tasks_conversation_started_idx" ON "conversation_background_tasks" USING btree ("conversation_id","started_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_sequence_idx" ON "conversation_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_task_events_conversation_sequence_idx" ON "conversation_task_events" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_tasks_conversation_updated_idx" ON "conversation_tasks" USING btree ("conversation_id","updated_at","task_id");--> statement-breakpoint
CREATE INDEX "conversation_tool_calls_conversation_sequence_idx" ON "conversation_tool_calls" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at");