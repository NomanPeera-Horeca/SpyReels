import { TRPCError } from "@trpc/server";
import { randomBytes, randomUUID } from "crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getUserSubscription } from "../stripe/stripe-service";
import type { PlanId } from "../stripe/products";

const APP_URL = (process.env.APP_URL ?? "https://spyreels.ai").replace(/\/$/, "");

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const requireWorkspaceOwner = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.workspaceRole !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only workspace owners can perform this action.",
    });
  }
  return next({ ctx });
});

export const workspacesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        logoUrl: workspaces.logoUrl,
        plan: workspaces.plan,
        isPersonal: workspaces.isPersonal,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(eq(workspaceMembers.userId, ctx.user.id), isNull(workspaces.deletedAt))
      )
      .orderBy(desc(workspaces.isPersonal), asc(workspaces.name));

    return rows;
  }),

  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [row] = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        logoUrl: workspaces.logoUrl,
        plan: workspaces.plan,
        isPersonal: workspaces.isPersonal,
        ownerUserId: workspaces.ownerUserId,
        includedSeats: workspaces.includedSeats,
        role: workspaceMembers.role,
      })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaces.id, ctx.workspaceId),
          eq(workspaceMembers.userId, ctx.user.id),
          isNull(workspaces.deletedAt)
        )
      )
      .limit(1);

    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found." });
    }

    return row;
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const workspaceId = randomUUID();
      const sub = await getUserSubscription(ctx.user.id);
      const plan = (sub.plan ?? "free") as PlanId;

      await db.insert(workspaces).values({
        id: workspaceId,
        name: input.name.trim(),
        ownerUserId: ctx.user.id,
        plan,
        isPersonal: false,
        includedSeats: 1,
      });

      await db.insert(workspaceMembers).values({
        id: randomUUID(),
        workspaceId,
        userId: ctx.user.id,
        role: "owner",
        invitedByUserId: null,
      });

      return { workspaceId };
    }),

  invite: requireWorkspaceOwner
    .input(z.object({ email: z.string().email().max(320) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const invitedEmail = normalizeEmail(input.email);
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(workspaceInvitations).values({
        id: randomUUID(),
        workspaceId: ctx.workspaceId,
        invitedEmail,
        role: "member",
        token,
        invitedByUserId: ctx.user.id,
        expiresAt,
      });

      const acceptUrl = `${APP_URL}/invitations/accept/${token}`;
      return { token, acceptUrl };
    }),

  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const userEmail = ctx.user.email ? normalizeEmail(ctx.user.email) : null;
      if (!userEmail) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Your account must have an email address to accept an invitation.",
        });
      }

      const [invitation] = await db
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.token, input.token.trim()))
        .limit(1);

      if (!invitation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      }

      if (invitation.acceptedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation has already been accepted." });
      }

      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation has expired." });
      }

      if (normalizeEmail(invitation.invitedEmail) !== userEmail) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation was sent to a different email address.",
        });
      }

      const [existingMember] = await db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, invitation.workspaceId),
            eq(workspaceMembers.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (existingMember) {
        await db
          .update(workspaceInvitations)
          .set({ acceptedAt: new Date() })
          .where(eq(workspaceInvitations.id, invitation.id));

        return { workspaceId: invitation.workspaceId, alreadyMember: true };
      }

      await db.insert(workspaceMembers).values({
        id: randomUUID(),
        workspaceId: invitation.workspaceId,
        userId: ctx.user.id,
        role: invitation.role,
        invitedByUserId: invitation.invitedByUserId,
      });

      await db
        .update(workspaceInvitations)
        .set({ acceptedAt: new Date() })
        .where(eq(workspaceInvitations.id, invitation.id));

      return { workspaceId: invitation.workspaceId, alreadyMember: false };
    }),

  listMembers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const rows = await db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
      .orderBy(workspaceMembers.joinedAt);

    return rows;
  }),

  removeMember: requireWorkspaceOwner
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [target] = await db
        .select({ id: workspaceMembers.id, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            eq(workspaceMembers.userId, input.userId)
          )
        )
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found in this workspace." });
      }

      const [ownerCountRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            eq(workspaceMembers.role, "owner")
          )
        );

      const ownerCount = Number(ownerCountRow?.count ?? 0);

      if (target.role === "owner" && ownerCount <= 1) {
        const message =
          input.userId === ctx.user.id
            ? "You cannot remove yourself while you are the only owner."
            : "Cannot remove the last owner of the workspace.";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }

      await db
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            eq(workspaceMembers.userId, input.userId)
          )
        );

      return { removed: true };
    }),
});
