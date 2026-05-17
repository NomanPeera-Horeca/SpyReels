import { TRPCError } from "@trpc/server";
import type { SavedScript } from "../drizzle/schema";
import { getSavedScript } from "./db";
import type { TrpcContext } from "./_core/context";

type WorkspaceCtx = Pick<TrpcContext, "workspaceId">;

/** Ensures a saved script exists and belongs to the caller's active workspace. */
export async function assertScriptInWorkspace(
  scriptId: number,
  ctx: WorkspaceCtx
): Promise<SavedScript> {
  const script = await getSavedScript(scriptId);
  if (!script || script.workspaceId !== ctx.workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
  }
  return script;
}
