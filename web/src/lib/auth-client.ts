import { createAuthClient } from "better-auth/react";

// Same-origin: /api/auth in prod, Vite proxy in dev.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
