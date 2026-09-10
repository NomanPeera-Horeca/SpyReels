import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { formatTrpcValidationMessage, formatZodIssuesForUser } from "@shared/trpcValidationErrors";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TrpcContext } from "./context";
import { assertAdminEmailUser } from "../middleware/requireAdmin";
import { captureServerException } from "../analytics/posthogErrors";
import { posthogDistinctIdForUser } from "../analytics/posthogServer";
import { alertOwnerThrottled } from "../monitoring/alerts";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    if (error.cause instanceof ZodError) {
      return {
        ...shape,
        message: formatZodIssuesForUser(error.cause.issues),
      };
    }

    // Report genuine server failures to PostHog Error Tracking; skip expected client errors.
    if (error.code === "INTERNAL_SERVER_ERROR") {
      captureServerException(
        error.cause instanceof Error ? error.cause : error,
        { trpcCode: error.code, message: shape.message ?? undefined },
        ctx?.user ? posthogDistinctIdForUser(ctx.user.id) : undefined
      );
      alertOwnerThrottled({
        kind: "trpc",
        message: shape.message ?? "TRPC internal server error",
        error: error.cause,
      });
    }

    const friendly = formatTrpcValidationMessage(shape.message);
    if (friendly !== shape.message) {
      return {
        ...shape,
        message: friendly,
      };
    }

    return shape;
  },
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
