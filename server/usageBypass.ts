/** Identity fields used to bypass plan usage limits (owner / admin). */
export type UsageBypassIdentity = {
  openId?: string | null;
  email?: string | null;
  role?: string | null;
};

/** Owner, DB admin role, ADMIN_EMAIL match, or LOCAL_DEV_UNLIMITED_USAGE in development — no monthly caps. */
export function hasUnlimitedUsage(identity: UsageBypassIdentity): boolean {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.LOCAL_DEV_UNLIMITED_USAGE?.trim() === "1"
  ) {
    return true;
  }

  const ownerOpenId = process.env.OWNER_OPEN_ID?.trim();
  if (ownerOpenId && identity.openId === ownerOpenId) return true;

  if (identity.role === "admin") return true;

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const email = identity.email?.trim().toLowerCase();
  if (adminEmail && email && email === adminEmail) return true;

  return false;
}

export const UNLIMITED_USAGE_LIMIT = 999_999;

export function unlimitedUsageResult(): {
  allowed: boolean;
  limit: number;
  used: number;
} {
  return { allowed: true, limit: UNLIMITED_USAGE_LIMIT, used: 0 };
}
