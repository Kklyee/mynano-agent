import { Hono } from "hono"
import { cors } from "hono/cors"
import { createAgent, createDefaultResearchAgentConfig } from "./agent/index.js"
import { db } from "./db/index.js"
import { authHandler } from "./handlers/auth.js"
import { createChatHandler } from "./handlers/chat.js"
import { createConversationsHandler } from "./handlers/conversations.js"
import { ConversationRepository } from "./repositories/conversation-repository.js"
import { ConversationService } from "./services/conversation-service.js"

const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

const isLocalDevOrigin = (origin: string) => LOCAL_DEV_ORIGIN_PATTERN.test(origin)

const getAllowedOrigins = () => {
  const configured = process.env.CORS_ORIGIN?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (configured && configured.length > 0) {
    return configured
  }

  return ["http://localhost:3000", "http://127.0.0.1:3000"]
}

const allowedOrigins = getAllowedOrigins()
const app = new Hono()

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return allowedOrigins[0] ?? ""
      }

      if (isLocalDevOrigin(origin)) {
        return origin
      }

      return allowedOrigins.includes(origin) ? origin : ""
    },
    allowMethods: ["POST", "GET", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
)

const repo = new ConversationRepository(db)
const conversationService = new ConversationService(repo)

const agent = await createAgent({
  ...createDefaultResearchAgentConfig(),
  conversationService,
})

app.get("/", (c) =>
  c.json({
    status: "ok",
    message: "AI Agent Server is running",
  }),
)

app.route("/", authHandler)
app.route("/", createConversationsHandler(conversationService, agent))
app.route("/", createChatHandler(agent))

const port = Number(process.env.PORT ?? 3001)
console.log(`AI Agent Server running on http://localhost:${port}`)
console.log(`Better Auth mounted at http://localhost:${port}/api/auth`)
console.log("POST /chat requires an authenticated session")

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 0,
}
