import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "../lib/auth.js";
import { adminEmails } from "../lib/env.js";
import { isAdminEmail } from "../lib/admin.js";

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
});

export type AppRouter = typeof appRouter;
