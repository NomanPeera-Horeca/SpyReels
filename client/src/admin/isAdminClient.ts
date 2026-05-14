export function isAdminPanelClient(user: { email?: string | null } | null): boolean {
  if (!user?.email) return false;
  const expected = import.meta.env.VITE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!expected) return false;
  return user.email.trim().toLowerCase() === expected;
}
