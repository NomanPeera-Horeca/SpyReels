import { TRPCError } from "@trpc/server";
import type { ScriptTag } from "../drizzle/schema";
import { getScriptTagById } from "./db";
import type { TrpcContext } from "./_core/context";

type WorkspaceCtx = Pick<TrpcContext, "workspaceId">;

/** Ensures a script tag exists and belongs to the caller's active workspace. */
export async function assertTagInWorkspace(
  tagId: number,
  ctx: WorkspaceCtx
): Promise<ScriptTag> {
  const tag = await getScriptTagById(tagId);
  if (!tag || tag.workspaceId !== ctx.workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
  }
  return tag;
}
