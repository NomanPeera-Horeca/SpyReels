import { TRPCError } from "@trpc/server";
import type { RecreatedScript } from "../drizzle/schema";
import { getRecreatedScript } from "./db";
import type { TrpcContext } from "./_core/context";

type WorkspaceCtx = Pick<TrpcContext, "workspaceId">;

/** Ensures a recreated script exists and belongs to the caller's active workspace. */
export async function assertRecreatedScriptInWorkspace(
  scriptId: number,
  ctx: WorkspaceCtx
): Promise<RecreatedScript> {
  const script = await getRecreatedScript(scriptId);
  if (!script || script.workspaceId !== ctx.workspaceId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
  }
  return script;
}
