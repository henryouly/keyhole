import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { env } from "../lib/env.js";

// drizzle-kit migrate/push take the WebSocket driver path, which fails in
// this environment. This script applies the same drizzle/ SQL migrations
// over plain HTTPS instead. NOTE: the HTTP driver has no transactions, so a
// failed migration does not roll back — re-run after fixing the cause.
const sql = neon(env.DATABASE_URL);
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "drizzle" });
console.log("migrations applied");
