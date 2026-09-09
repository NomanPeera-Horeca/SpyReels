import { z } from "zod";
import {
  createScriptTag,
  deleteScriptTag,
  ensureDefaultTags,
  getScriptTagsByWorkspace,
  updateScriptTag,
} from "../db";
import { assertTagInWorkspace } from "../assertTagInWorkspace";
import { protectedProcedure, router } from "../_core/trpc";

export const tagsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureDefaultTags(ctx.workspaceId, ctx.user.id);
    return getScriptTagsByWorkspace(ctx.workspaceId);
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), color: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const id = await createScriptTag({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        name: input.name,
        color: input.color,
        isDefault: 0,
        sortOrder: 99,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), color: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertTagInWorkspace(input.id, ctx);
      const updateData: Parameters<typeof updateScriptTag>[1] = {};
      if (input.name) updateData.name = input.name;
      if (input.color) updateData.color = input.color;
      await updateScriptTag(input.id, updateData);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertTagInWorkspace(input.id, ctx);
      await deleteScriptTag(input.id);
      return { success: true };
    }),
});