// Test-only fixtures. Unit tests never touch real secrets or databases.
// env.ts reads process.env at import; setup files run first, so this wins.
process.env.DATA_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.ADMIN_EMAILS = "admin@example.com";
