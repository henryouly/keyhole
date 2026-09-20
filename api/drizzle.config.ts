import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/auth-schema.ts", "./src/db/app-schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    // generate/diff run offline; migrate/push/studio need the real URL.
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/keyhole",
  },
});
