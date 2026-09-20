import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

/** Keyhole app tables. Google data-connect tokens are encrypted blobs. */
export const connectedAccounts = pgTable("connected_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("google-calendar"),
  accountEmail: text("account_email"),
  accessEnc: text("access_enc").notNull(),
  refreshEnc: text("refresh_enc").notNull(),
  expiresAt: timestamp("expires_at"),
  scopes: text("scopes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Public prefix shown in UI/logs, e.g. kh_live_ab12. Never the secret. */
  prefix: text("prefix").notNull().unique(),
  /** SHA-256 hex of the full key. The secret itself is never stored. */
  hash: text("hash").notNull().unique(),
  scopes: text("scopes").array().notNull().default([]),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  dailyCount: integer("daily_count").notNull().default(0),
  dailyWindow: timestamp("daily_window"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    apiKeyPrefix: text("api_key_prefix"),
    method: text("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    ms: integer("ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_at_idx").on(t.createdAt)],
);
