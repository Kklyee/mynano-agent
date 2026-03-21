import { Hono, type MiddlewareHandler } from "hono"
import { streamSSE } from "hono/streaming"
import { auth } from "../auth.js"
import type { ConversationService } from "../services/conversation-service.js"

type SessionPayload = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>
type AppEnv = {
  Variables: {
    session: SessionPayload["session"]
    user: SessionPayload["user"]
  }
}

const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    return c.json({ error: "Authentication required" }, 401)
  }
  c.set("session", session.session)
  c.set("user", session.user)
  await next()
}

export function createConversationsHandler(
  conversationService: ConversationService,
  agent: Awaited<ReturnType<typeof import("../agent/index.js").createAgent>>,
) {
  const app = new Hono<AppEnv>()

  app.get("/api/conversations", requireAuth, async (c) => {
    const user = c.get("user")
    const conversations = await conversationService.listConversations(user.id)
    return c.json({ conversations })
  })

  app.post("/api/conversations", requireAuth, async (c) => {
    const user = c.get("user")
    const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string })
    const conversation = await conversationService.createConversation({
      userId: user.id,
      title: body.title,
    })
    return c.json({ conversation })
  })

  app.get("/api/conversations/:id", requireAuth, async (c) => {
    const user = c.get("user")
    const conversationId = c.req.param("id")
    try {
      const detail = await conversationService.getConversationDetail({
        userId: user.id,
        conversationId,
      })
      return c.json(detail)
    } catch {
      return c.json({ error: "Conversation not found" }, 404)
    }
  })

  app.delete("/api/conversations/:id", requireAuth, async (c) => {
    const user = c.get("user")
    const conversationId = c.req.param("id")
    try {
      await conversationService.deleteConversation({ userId: user.id, conversationId })
      return c.json({ success: true })
    } catch {
      return c.json({ error: "Conversation not found" }, 404)
    }
  })

  app.post("/api/conversations/:id/messages", requireAuth, async (c) => {
    const { prompt } = await c.req.json<{ prompt?: string }>()
    if (!prompt?.trim()) {
      return c.json({ error: "Missing prompt" }, 400)
    }

    const user = c.get("user")
    const conversationId = c.req.param("id")
    let preparedRun

    try {
      preparedRun = await conversationService.prepareRun({
        userId: user.id,
        conversationId,
        prompt,
      })
    } catch {
      return c.json({ error: "Conversation not found" }, 404)
    }

    return streamSSE(c, async (stream) => {
      await conversationService.updateConversationStatus(conversationId, "running")
      await conversationService.recordUserMessage({
        conversationId,
        content: prompt.trim(),
      })

      const session = await agent.createSession({
        conversationId,
        messages: preparedRun.history,
      })
      let latestAssistantMessageId: string | null = null

      stream.onAbort(() => {
        console.log(`[${session.id}] Client disconnected (${user.email})`)
      })

      try {
        console.log(
          `[${session.id}] Starting conversation ${conversationId} for ${user.email}: ${prompt.slice(0, 50).trim()}...`,
        )

        const eventStream = session.runStream(prompt)

        for await (const event of eventStream) {
          if (event.type === "message.appended" && event.role === "assistant") {
            const msg = await conversationService.recordAssistantMessage({
              conversationId,
              content: event.content,
              status: "complete",
            })
            latestAssistantMessageId = msg.id
          }

          if (event.type === "tool.called" && latestAssistantMessageId) {
            await conversationService.recordToolCallStarted({
              conversationId,
              messageId: latestAssistantMessageId,
              name: event.name,
              args: event.args,
            })
          }

          if (event.type === "tool.completed") {
            await conversationService.recordToolCallCompleted({
              conversationId,
              name: event.name,
              result: event.result,
            })
          }

          if (event.type === "task.created") {
            await conversationService.upsertTask({
              conversationId,
              taskId: event.taskId,
              subject: event.subject,
              status: "pending",
              blockedBy: [],
            })
            await conversationService.recordTaskEvent({
              conversationId,
              taskId: event.taskId,
              subject: event.subject,
              status: "pending",
            })
          }

          if (event.type === "task.updated") {
            await conversationService.upsertTask({
              conversationId,
              taskId: event.taskId,
              status: event.status as "pending" | "in_progress" | "completed" | "blocked",
            })
            await conversationService.recordTaskEvent({
              conversationId,
              taskId: event.taskId,
              status: event.status,
            })
          }

          if (event.type === "background.started" || event.type === "background.updated") {
            const backgroundTask = session
              .getState()
              .backgroundTasks.find((task) => task.id === event.taskId)

            await conversationService.upsertBackgroundTask({
              conversationId,
              taskId: event.taskId,
              command: backgroundTask?.command,
              summary: backgroundTask?.command?.trim().split(/\s+/).slice(0, 4).join(" "),
              status: event.status as "running" | "completed" | "failed",
              completedAt: backgroundTask?.completedAt
                ? new Date(backgroundTask.completedAt).toISOString()
                : null,
              exitCode: backgroundTask?.exitCode ?? null,
            })
            await conversationService.recordBackgroundEvent({
              conversationId,
              taskId: event.taskId,
              command: backgroundTask?.command,
              summary: backgroundTask?.command?.trim().split(/\s+/).slice(0, 4).join(" "),
              status: event.status as "running" | "completed" | "failed",
            })
          }

          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          })

          if (event.type === "session.failed") {
            throw new Error(event.error)
          }
        }

        const finalState = session.getState()
        await conversationService.updateConversationStatus(conversationId, "completed")
        await stream.writeSSE({
          event: "session.completed",
          data: JSON.stringify({
            output: finalState.messages.at(-1)?.content,
            steps: finalState.step,
            conversationId,
          }),
        })

        console.log(
          `[${session.id}] Conversation ${conversationId} completed for ${user.email} (${finalState.step} steps)`,
        )
      } catch (error) {
        await conversationService.updateConversationStatus(conversationId, "failed")
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error(`[${session.id}] Error for ${user.email}:`, errorMessage)

        await stream.writeSSE({
          event: "session.failed",
          data: JSON.stringify({ error: errorMessage, conversationId }),
        })
      }
    })
  })

  return app
}
