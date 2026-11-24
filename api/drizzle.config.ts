import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load repo-root .env (matching api/src/lib/env.ts) under both ESM and CJS loaders.
const dir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dir, "../.env") });

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/auth-schema.ts", "./src/db/app-schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    // generate/diff run offline; migrate/push/studio need the real URL.
    url: process.env.DATABASE_URL || "postgresql://localhost:5432/keyhole",
  },
});
