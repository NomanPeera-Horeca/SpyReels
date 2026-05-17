import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { assertAdminEmailUser } from "../middleware/requireAdmin";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (!ctx.workspaceId || !ctx.workspaceRole) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Workspace context is missing for this user.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      workspaceId: ctx.workspaceId,
      workspaceRole: ctx.workspaceRole,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireAdminEmail = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  assertAdminEmailUser(ctx.user);
  return next({
    ctx: {
      ...ctx,
      user: ctx.user!,
    },
  });
});

/** Single-owner admin panel: must match `process.env.ADMIN_EMAIL` (404 for others). */
export const adminPanelProcedure = protectedProcedure.use(requireAdminEmail);

/** Owner automation (role === admin). Kept for notifyOwner; owner gets role via db upsert. */
export const ownerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
