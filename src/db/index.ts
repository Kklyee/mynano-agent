import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index.js"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required")

const client = postgres(url)
export const db = drizzle(client, { schema })
