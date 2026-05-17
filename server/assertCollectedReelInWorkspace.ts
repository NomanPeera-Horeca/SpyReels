import { TRPCError } from "@trpc/server";
import type { CollectedReel } from "../drizzle/schema";
import { getCollectedReelById } from "./db";
import type { TrpcContext } from "./_core/context";

type WorkspaceCtx = Pick<TrpcContext, "workspaceId">;

/** Ensures a collected reel exists and belongs to the caller's active workspace. */
export async function assertCollectedReelInWorkspace(
  reelId: number,
  ctx: WorkspaceCtx
): Promise<CollectedReel> {
  const reel = await getCollectedReelById(reelId);
  if (!reel || reel.workspaceId !== ctx.workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Collected reel not found" });
  }
  return reel;
}
