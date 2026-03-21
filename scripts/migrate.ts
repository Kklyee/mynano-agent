/**
 * Run all database migrations via drizzle-kit.
 * Both conversation tables and auth tables (user/session/account/verification)
 * are managed by drizzle-kit.
 *
 * Usage: npx drizzle-kit generate && npx drizzle-kit migrate
 *   or run this script directly (requires DATABASE_URL in env):
 *        node --experimental-strip-types scripts/migrate.ts
 */

import { migrate } from "drizzle-orm/postgres-js/migrator"
import { db } from "../src/db/index.js"

console.log("→ Running drizzle migrations...")
await migrate(db, { migrationsFolder: "./src/db/migrations" })
console.log("✓ All migrations done")
process.exit(0)
