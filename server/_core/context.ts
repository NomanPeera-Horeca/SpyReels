import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import {
  parseWorkspaceIdHeader,
  resolveWorkspaceContext,
} from "./workspaceContext";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** Active workspace; null when unauthenticated. */
  workspaceId: string | null;
  /** Role in active workspace; null when unauthenticated. */
  workspaceRole: string | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  let workspaceId: string | null = null;
  let workspaceRole: string | null = null;

  if (user) {
    const requestedWorkspaceId = parseWorkspaceIdHeader(
      opts.req.headers["x-workspace-id"]
    );
    const resolved = await resolveWorkspaceContext(user.id, requestedWorkspaceId);
    workspaceId = resolved.workspaceId;
    workspaceRole = resolved.workspaceRole;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    workspaceId,
    workspaceRole,
  };
}
