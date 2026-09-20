import dotenv from "dotenv";

// File-relative so it resolves to the repo-root .env regardless of cwd.
// No-op on Vercel (no .env file there; platform env applies instead).
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default(""),
  AUTH_SECRET: z.string().default("dev-secret-change-me"),
  AUTH_GOOGLE_ID: z.string().default(""),
  AUTH_GOOGLE_SECRET: z.string().default(""),
  GCAL_CLIENT_ID: z.string().default(""),
  GCAL_CLIENT_SECRET: z.string().default(""),
  DATA_ENCRYPTION_KEY: z.string().default(""),
  ADMIN_EMAILS: z.string().default(""),
  APP_URL: z.string().default("http://localhost:8787"),
  API_PORT: z.coerce.number().default(8787),
});

export const env = envSchema.parse(process.env);

/** Lowercased, trimmed allowlist. Empty set = nobody may sign in. */
export const adminEmails: Set<string> = new Set(
  env.ADMIN_EMAILS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
