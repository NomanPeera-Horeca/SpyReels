import { and, eq, isNull } from "drizzle-orm";
import { workspaceMembers, workspaces } from "../../drizzle/schema";
import { getDb } from "../db";
import { getPersonalWorkspaceId } from "../personalWorkspace";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseWorkspaceIdHeader(
  header: string | string[] | undefined
): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || !UUID_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Resolve active workspace for an authenticated user.
 * Requested id is used only when the user is a member of a non-deleted workspace.
 */
export async function resolveWorkspaceContext(
  userId: number,
  requestedWorkspaceId: string | null
): Promise<{ workspaceId: string; workspaceRole: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (requestedWorkspaceId) {
    const [membership] = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, requestedWorkspaceId),
          eq(workspaceMembers.userId, userId),
          isNull(workspaces.deletedAt)
        )
      )
      .limit(1);

    if (membership) {
      return {
        workspaceId: membership.workspaceId,
        workspaceRole: membership.role,
      };
    }
  }

  const workspaceId = await getPersonalWorkspaceId(userId);

  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  return {
    workspaceId,
    workspaceRole: member?.role ?? "owner",
  };
}
