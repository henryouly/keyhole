import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
// Type-only: erased at build, never bundles the api package at runtime.
import type { AppRouter } from "../../../api/src/trpc/router";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      transformer: superjson,
    }),
  ],
});
