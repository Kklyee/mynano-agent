import { Hono, type MiddlewareHandler } from "hono"
import { streamSSE } from "hono/streaming"
import { auth } from "../lib/auth.ts"

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

export function createChatHandler(
  agent: Awaited<ReturnType<typeof import("../agent/index.js").createAgent>>,
) {
  const app = new Hono<AppEnv>()

  app.post("/chat", requireAuth, async (c) => {
    const { prompt } = await c.req.json<{ prompt?: string }>()

    if (!prompt?.trim()) {
      return c.json({ error: "Missing prompt" }, 400)
    }

    const user = c.get("user")

    return streamSSE(c, async (stream) => {
      const session = await agent.createSession()

      stream.onAbort(() => {
        console.log(`[${session.id}] Client disconnected (${user.email})`)
      })

      try {
        console.log(
          `[${session.id}] Starting conversation for ${user.email}: ${prompt.slice(0, 50).trim()}...`,
        )

        const eventStream = session.runStream(prompt)

        for await (const event of eventStream) {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          })
        }

        const finalState = session.getState()
        await stream.writeSSE({
          event: "session.completed",
          data: JSON.stringify({
            output: finalState.messages.at(-1)?.content,
            steps: finalState.step,
          }),
        })

        console.log(
          `[${session.id}] Conversation completed for ${user.email} (${finalState.step} steps)`,
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        console.error(`[${session.id}] Error for ${user.email}:`, errorMessage)

        await stream.writeSSE({
          event: "session.failed",
          data: JSON.stringify({ error: errorMessage }),
        })
      }
    })
  })

  return app
}
