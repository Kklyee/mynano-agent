import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db/index.js"

const DEFAULT_AUTH_SECRET = "mini-agent-better-auth-development-secret-please-change"
const LOCAL_DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

const isLocalDevOrigin = (origin: string) => LOCAL_DEV_ORIGIN_PATTERN.test(origin)

const getServerPort = () => process.env.PORT ?? "3001"

const getAuthBaseUrl = () =>
  process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? `http://localhost:${getServerPort()}`

const getConfiguredTrustedOrigins = () => {
  const configured = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  return configured ?? []
}

export const auth = betterAuth({
  appName: "Mini Agent",
  secret: process.env.BETTER_AUTH_SECRET ?? DEFAULT_AUTH_SECRET,
  baseURL: getAuthBaseUrl(),
  basePath: "/api/auth",
  database: drizzleAdapter(db, { provider: "pg" }),
  trustedOrigins: async (request) => {
    const configured = getConfiguredTrustedOrigins()
    const requestOrigin = request?.headers.get("origin")

    if (requestOrigin && isLocalDevOrigin(requestOrigin)) {
      return [...configured, requestOrigin]
    }

    if (configured.length > 0) {
      return configured
    }

    return ["http://localhost:3000", "http://127.0.0.1:3000"]
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
})
