import { Hono } from "hono"
import { auth } from "../auth.js"

type SessionPayload = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>
type AppEnv = {
  Variables: {
    session: SessionPayload["session"]
    user: SessionPayload["user"]
  }
}

const authHandler = new Hono<AppEnv>()

authHandler.all("/api/auth", (c) => auth.handler(c.req.raw))
authHandler.all("/api/auth/*", (c) => auth.handler(c.req.raw))

authHandler.get("/api/me", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) {
    return c.json({ error: "Authentication required" }, 401)
  }
  return c.json({ user: session.user, session: session.session })
})

export { authHandler }
