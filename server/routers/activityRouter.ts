import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

export const activityRouter = router({
  recordHeartbeat: protectedProcedure
    .input(z.object({ seconds: z.number().min(1).max(120).default(60) }))
    .mutation(async ({ ctx, input }) => {
      const { addUserActiveSeconds } = await import("../userActivity");
      await addUserActiveSeconds(ctx.user.id, input.seconds);
      return { ok: true as const };
    }),
});