// Test-only fixtures. Unit tests never touch real secrets or databases.
// env.ts reads process.env at import; setup files run first, so this wins.
// DATABASE_URL is a dummy: getDb() constructs lazily without connecting, and
// dbAudit swallows the refused connection. Route-conformance tests only assert
// pre-DB behavior (401s), never query results.
process.env.DATA_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.AUTH_SECRET = "test-auth-secret-32-bytes-minimum!!";
process.env.APP_URL = "http://localhost:8787";
process.env.PROD_APP_URL = "";
process.env.API_KEY_DAILY_LIMIT = "2000";
