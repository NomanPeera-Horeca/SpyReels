/** Sidebar label from the signed-in role. Do not show raw backend values. */
export function studioSidebarRoleLabel(role: string | null | undefined): string {
  return role === "admin" ? "Admin" : "Member";
}
