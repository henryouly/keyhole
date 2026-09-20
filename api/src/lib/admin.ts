/** Pure admin-allowlist helpers. Framework-free so they are unit-testable. */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdminEmail(
  email: string | null | undefined,
  allowlist: Set<string>,
): boolean {
  if (!email) return false;
  return allowlist.has(normalizeEmail(email));
}

/**
 * Gate for better-auth user creation. Returns true when the user may be
 * created. Non-allowlisted Google logins are rejected before a user row
 * (and therefore a session) can exist.
 */
export function decideUserCreate(
  email: string | null | undefined,
  allowlist: Set<string>,
): boolean {
  return isAdminEmail(email, allowlist);
}
