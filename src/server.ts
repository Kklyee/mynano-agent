import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { join } from "node:path";
import { createAgent, createDefaultResearchAgentConfig } from "./agent";
import { auth, ensureAuthSchema } from "./auth";
import { ConversationService } from "./services/conversation-service";
import { createConversationStore } from "./services/conversation-store";

type SessionPayload = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type AppEnv = {
  Variables: {
    session: SessionPayload["session"];
    user: SessionPayload["user"];
  };
};

const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const isLocalDevOrigin = (origin: string) => LOCAL_DEV_ORIGIN_PATTERN.test(origin);

const getAllowedOrigins = () => {
  const configured = process.env.CORS_ORIGIN
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  return ["http://localhost:3000", "http://127.0.0.1:3000"];
};

const allowedOrigins = getAllowedOrigins();
const app = new Hono<AppEnv>();
const conversationService = new ConversationService(
  await createConversationStore(
    process.env.CONVERSATION_DB_PATH ?? join(process.cwd(), "data", "conversations.sqlite"),
  ),
);

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return allowedOrigins[0] ?? "";
      }

      if (isLocalDevOrigin(origin)) {
        return origin;
      }

      return allowedOrigins.includes(origin) ? origin : "";
    },
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

await ensureAuthSchema();

const agent = await createAgent(createDefaultResearchAgentConfig());

const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json(
      {
        error: "Authentication required",
      },
      401,
    );
  }

  c.set("session", session.session);
  c.set("user", session.user);
  await next();
};

app.all("/api/auth", (c) => auth.handler(c.req.raw));
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) =>
  c.json({
    status: "ok",
    message: "AI Agent Server is running",
  }),
);

app.get("/api/me", requireAuth, (c) =>
  c.json({
    user: c.get("user"),
    session: c.get("session"),
  }),
);

app.get("/api/conversations", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({
    conversations: conversationService.listConversations(user.id),
  });
});

app.post("/api/conversations", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req
    .json<{ title?: string }>()
    .catch(() => ({}) as { title?: string });
  const conversation = conversationService.createConversation({
    userId: user.id,
    title: body.title,
  });

  return c.json({ conversation });
});

app.get("/api/conversations/:id", requireAuth, (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");

  try {
    const detail = conversationService.getConversationDetail({
      userId: user.id,
      conversationId,
    });
    return c.json(detail);
  } catch {
    return c.json({ error: "Conversation not found" }, 404);
  }
});

app.post("/api/conversations/:id/messages", requireAuth, async (c) => {
  const { prompt } = await c.req.json<{ prompt?: string }>();

  if (!prompt?.trim()) {
    return c.json({ error: "Missing prompt" }, 400);
  }

  const user = c.get("user");
  const conversationId = c.req.param("id");
  let preparedRun;

  try {
    preparedRun = conversationService.prepareRun({
      userId: user.id,
      conversationId,
      prompt,
    });
  } catch {
    return c.json({ error: "Conversation not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    conversationService.updateConversationStatus(conversationId, "running");
    conversationService.recordUserMessage({
      conversationId,
      content: prompt.trim(),
    });

    const session = await agent.createSession({
      messages: preparedRun.history,
    });
    let latestAssistantMessageId: string | null = null;

    stream.onAbort(() => {
      console.log(`[${session.id}] Client disconnected (${user.email})`);
    });

    try {
      console.log(
        `[${session.id}] Starting conversation ${conversationId} for ${user.email}: ${prompt
          .slice(0, 50)
          .trim()}...`,
      );

      const eventStream = session.runStream(prompt);

      for await (const event of eventStream) {
        if (event.type === "message.appended" && event.role === "assistant") {
          latestAssistantMessageId = conversationService.recordAssistantMessage({
            conversationId,
            content: event.content,
            status: "complete",
          }).id;
        }

        if (event.type === "tool.called" && latestAssistantMessageId) {
          conversationService.recordToolCallStarted({
            conversationId,
            messageId: latestAssistantMessageId,
            name: event.name,
            args: event.args,
          });
        }

        if (event.type === "tool.completed") {
          conversationService.recordToolCallCompleted({
            conversationId,
            name: event.name,
            result: event.result,
          });
        }

        if (event.type === "task.created") {
          conversationService.recordTaskEvent({
            conversationId,
            taskId: event.taskId,
            subject: event.subject,
            status: "pending",
          });
        }

        if (event.type === "task.updated") {
          conversationService.recordTaskEvent({
            conversationId,
            taskId: event.taskId,
            status: event.status,
          });
        }

        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      }

      const finalState = session.getState();
      conversationService.updateConversationStatus(conversationId, "completed");
      await stream.writeSSE({
        event: "session.completed",
        data: JSON.stringify({
          output: finalState.messages.at(-1)?.content,
          steps: finalState.step,
          conversationId,
        }),
      });

      console.log(
        `[${session.id}] Conversation ${conversationId} completed for ${user.email} (${finalState.step} steps)`,
      );
    } catch (error) {
      conversationService.updateConversationStatus(conversationId, "failed");
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[${session.id}] Error for ${user.email}:`, errorMessage);

      await stream.writeSSE({
        event: "session.failed",
        data: JSON.stringify({ error: errorMessage, conversationId }),
      });
    }
  });
});

app.post("/chat", requireAuth, async (c) => {
  const { prompt } = await c.req.json<{ prompt?: string }>();

  if (!prompt?.trim()) {
    return c.json({ error: "Missing prompt" }, 400);
  }

  const user = c.get("user");

  return streamSSE(c, async (stream) => {
    const session = await agent.createSession();

    stream.onAbort(() => {
      console.log(`[${session.id}] Client disconnected (${user.email})`);
    });

    try {
      console.log(
        `[${session.id}] Starting conversation for ${user.email}: ${prompt
          .slice(0, 50)
          .trim()}...`,
      );

      const eventStream = session.runStream(prompt);

      for await (const event of eventStream) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      }

      const finalState = session.getState();
      await stream.writeSSE({
        event: "session.completed",
        data: JSON.stringify({
          output: finalState.messages.at(-1)?.content,
          steps: finalState.step,
        }),
      });

      console.log(
        `[${session.id}] Conversation completed for ${user.email} (${finalState.step} steps)`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[${session.id}] Error for ${user.email}:`, errorMessage);

      await stream.writeSSE({
        event: "session.failed",
        data: JSON.stringify({ error: errorMessage }),
      });
    }
  });
});

const port = Number(process.env.PORT ?? 3001);
console.log(`AI Agent Server running on http://localhost:${port}`);
console.log(`Better Auth mounted at http://localhost:${port}/api/auth`);
console.log("POST /chat requires an authenticated session");

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 0,
};
