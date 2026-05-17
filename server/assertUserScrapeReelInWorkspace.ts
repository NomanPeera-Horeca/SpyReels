import { TRPCError } from "@trpc/server";
import type { Reel } from "../drizzle/schema";
import { getReelById } from "./db";
import type { TrpcContext } from "./_core/context";

type WorkspaceCtx = Pick<TrpcContext, "workspaceId">;

/** Ensures a user-scraped reel exists and belongs to the caller's active workspace. */
export async function assertUserScrapeReelInWorkspace(
  reelId: number,
  ctx: WorkspaceCtx
): Promise<Reel> {
  const reel = await getReelById(reelId);
  if (!reel || reel.workspaceId !== ctx.workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Reel not found" });
  }
  return reel;
}
