/**
 * Server-side authorization for social profiles and personalization.
 *
 * Follows the existing assert*InWorkspace pattern (see server/assertIdeaInWorkspace.ts):
 * - The workspace ALWAYS comes from ctx.workspaceId, which
 *   server/_core/workspaceContext.ts resolves only after checking membership.
 *   Client-sent workspace ids are never trusted.
 * - Anything outside the caller's workspace returns NOT_FOUND (no hint that it exists).
 *
 * These helpers take already-loaded rows so they can be unit tested now.
 * The DB loaders that call them arrive with the migration (tables do not exist yet).
 * The database adds a second layer: composite foreign keys make cross-workspace
 * rows impossible even if a server bug skipped these checks.
 */
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";

export type PersonalizationCtx = Pick<
  TrpcContext,
  "workspaceId" | "workspaceRole"
> & {
  user: { id: number } | null;
};

export type ProfileOwnership = {
  id: string;
  workspaceId: string;
  deletedAt: Date | null;
};

export type ProfileChildOwnership = {
  id: string;
  workspaceId: string;
  socialProfileId: string;
};

function notFound(what: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
}

function requireCtx(ctx: PersonalizationCtx): {
  workspaceId: string;
  userId: number;
  role: string;
} {
  if (!ctx.user)
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in." });
  if (!ctx.workspaceId || !ctx.workspaceRole) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Workspace context is missing for this user.",
    });
  }
  return {
    workspaceId: ctx.workspaceId,
    userId: ctx.user.id,
    role: ctx.workspaceRole,
  };
}

/** The profile exists, is live, and belongs to the caller's active workspace. */
export function assertSocialProfileInWorkspace<P extends ProfileOwnership>(
  profile: P | null | undefined,
  ctx: PersonalizationCtx
): P {
  const { workspaceId } = requireCtx(ctx);
  if (
    !profile ||
    profile.workspaceId !== workspaceId ||
    profile.deletedAt !== null
  ) {
    notFound("Profile");
  }
  return profile;
}

/**
 * An item, analysis run or progress row belongs to this (already authorized)
 * profile AND to its workspace. Used for every read and write of child rows,
 * including the superseded item of an edit (supersedesItemId has no DB FK).
 */
export function assertChildOfProfile<C extends ProfileChildOwnership>(
  child: C | null | undefined,
  profile: ProfileOwnership,
  what: "Item" | "Analysis" | "Progress"
): C {
  if (
    !child ||
    child.socialProfileId !== profile.id ||
    child.workspaceId !== profile.workspaceId
  ) {
    notFound(what);
  }
  return child;
}

/**
 * Removing a profile deletes its strategy from view for every member, so only
 * the workspace owner may do it (same rule as other workspace-wide settings,
 * see requireWorkspaceOwner in server/routers/workspacesRouter.ts).
 * Adding, selecting and editing are open to every member.
 */
export function assertCanRemoveSocialProfile(ctx: PersonalizationCtx): void {
  const { role } = requireCtx(ctx);
  if (role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only workspace owners can remove a profile.",
    });
  }
}

/**
 * Row to upsert when a member switches profile. Workspace and user come from
 * the server context, never from the request.
 */
export function buildActiveSelection(
  profile: ProfileOwnership,
  ctx: PersonalizationCtx
): { workspaceId: string; userId: number; socialProfileId: string } {
  const live = assertSocialProfileInWorkspace(profile, ctx);
  const { workspaceId, userId } = requireCtx(ctx);
  return { workspaceId, userId, socialProfileId: live.id };
}

/**
 * Removing a profile, in one transaction, in this order:
 * 1. delete every active selection pointing at it (all members)
 * 2. soft delete the profile
 * Its history (runs, items) is kept. Readers also ignore stale selections
 * (resolveActiveProfileId), so even a half-applied change never exposes it.
 */
export function planProfileDeactivation(
  profile: ProfileOwnership,
  ctx: PersonalizationCtx
): {
  workspaceId: string;
  socialProfileId: string;
  steps: readonly ["delete_active_selections", "soft_delete_profile"];
} {
  assertCanRemoveSocialProfile(ctx);
  const live = assertSocialProfileInWorkspace(profile, ctx);
  return {
    workspaceId: live.workspaceId,
    socialProfileId: live.id,
    steps: ["delete_active_selections", "soft_delete_profile"] as const,
  };
}
