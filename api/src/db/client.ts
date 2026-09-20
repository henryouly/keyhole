import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as appSchema from "./app-schema.js";
import * as authSchema from "./auth-schema.js";
import { env } from "../lib/env.js";

const schema = { ...authSchema, ...appSchema };

let cached: ReturnType<typeof buildDb> | null = null;

function buildDb() {
  const sql = neon(env.DATABASE_URL);
  return drizzle(sql, { schema });
}

/**
 * Lazy Neon client. Throws a clear error when DATABASE_URL is missing so the
 * API can boot (health checks, tests) without a live database.
 */
export function getDb() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  cached ??= buildDb();
  return cached;
}

export type Db = ReturnType<typeof getDb>;
