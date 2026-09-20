import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getDb } from "../db/client.js";
import * as authSchema from "../db/auth-schema.js";
import { adminEmails, env } from "./env.js";
import { decideUserCreate } from "./admin.js";

export const auth = betterAuth({
  secret: env.AUTH_SECRET,
  baseURL: env.APP_URL,
  database: env.DATABASE_URL
    ? drizzleAdapter(getDb(), { provider: "pg", schema: authSchema })
    : // Local dev / tests without Neon. Sessions are ephemeral.
      memoryAdapter({}),
  socialProviders: {
    google: {
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    },
  },
  onAPIError: {
    // OAuth failures redirect here with ?error=... instead of better-auth's
    // built-in /api/auth/error page. The dashboard renders a friendly message.
    errorURL: `${env.APP_URL}/`,
  },
  databaseHooks: {
    user: {
      create: {
        // Single-user gate: only allowlisted emails may create a user row.
        // Without a user row there is no session, so non-allowlisted
        // Google logins are blocked here. tRPC re-checks per request.
        before: async (user) => {
          if (!decideUserCreate(user.email, adminEmails)) {
            return false;
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
