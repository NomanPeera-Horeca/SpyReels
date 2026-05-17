import { TRPCError } from "@trpc/server";
import type { ScriptIdea } from "../drizzle/schema";
import { getScriptIdeaById } from "./db";
import type { TrpcContext } from "./_core/context";

type WorkspaceCtx = Pick<TrpcContext, "workspaceId">;

/** Ensures a script idea exists and belongs to the caller's active workspace. */
export async function assertIdeaInWorkspace(
  ideaId: number,
  ctx: WorkspaceCtx
): Promise<ScriptIdea> {
  const idea = await getScriptIdeaById(ideaId);
  if (!idea || idea.workspaceId !== ctx.workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
  }
  return idea;
}
