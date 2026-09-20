import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import superjson from "superjson";
import { connectedAccounts } from "../db/app-schema.js";
import { getDb } from "../db/client.js";
import { auth } from "../lib/auth.js";
import { adminEmails } from "../lib/env.js";
import { isAdminEmail } from "../lib/admin.js";
import { PROVIDER_ID } from "../lib/google.js";
import { disconnectProvider } from "../rest/oauth.js";

export async function createContext(opts: { req: Request }) {
  const session = await auth.api.getSession({ headers: opts.req.headers });
  return { session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Defense in depth behind the better-auth create-gate: every admin procedure
 * re-checks the session email against ADMIN_EMAILS.
 */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  const email = ctx.session?.user?.email ?? null;
  if (!isAdminEmail(email, adminEmails)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Not signed in as an allowed admin",
    });
  }
  return next({ ctx: { ...ctx, adminEmail: email as string } });
});

export const appRouter = router({
  viewer: router({
    me: adminProcedure.query(({ ctx }) => ({
      email: ctx.adminEmail,
      name: ctx.session!.user.name,
    })),
  }),
  // Metadata only — tokens never leave the server.
  connection: router({
    status: adminProcedure.query(async ({ ctx }) => {
      const userId = ctx.session!.user.id;
      const rows = await getDb()
        .select({
          provider: connectedAccounts.provider,
          accountEmail: connectedAccounts.accountEmail,
          scopes: connectedAccounts.scopes,
          expiresAt: connectedAccounts.expiresAt,
        })
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.userId, userId),
            eq(connectedAccounts.provider, PROVIDER_ID),
          ),
        )
        .limit(1);
      if (rows.length === 0) return { connected: false as const };
      return { connected: true as const, ...rows[0] };
    }),
    disconnect: adminProcedure.mutation(async ({ ctx }) => {
      await disconnectProvider(ctx.session!.user.id);
      return { ok: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
