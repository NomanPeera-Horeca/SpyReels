import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { savedScripts, scriptShareLinks } from "../drizzle/schema";
import type { SavedScript, ScriptShareLink } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { assertScriptInWorkspace } from "./assertScriptInWorkspace";
import { getDb, getSavedScript } from "./db";

const APP_URL = (process.env.APP_URL ?? "https://spyreels.ai").replace(/\/$/, "");

export function buildShareUrl(token: string): string {
  return `${APP_URL}/s/${token}`;
}

async function assertScriptOwnedByUser(
  scriptId: number,
  ctx: Pick<TrpcContext, "workspaceId" | "user">
): Promise<SavedScript> {
  const script = await assertScriptInWorkspace(scriptId, ctx);
  if (!ctx.user || script.userId !== ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only manage share links for your own scripts.",
    });
  }
  return script;
}

export async function getActiveShareLinkForScript(
  scriptId: number
): Promise<ScriptShareLink | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select()
    .from(scriptShareLinks)
    .where(
      and(eq(scriptShareLinks.scriptId, scriptId), isNull(scriptShareLinks.revokedAt))
    )
    .orderBy(desc(scriptShareLinks.createdAt))
    .limit(1);

  return row;
}

export async function createShareLinkForScript(
  ctx: Pick<TrpcContext, "workspaceId" | "user">,
  scriptId: number
): Promise<{ token: string; url: string }> {
  if (!ctx.workspaceId || !ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  await assertScriptOwnedByUser(scriptId, ctx);

  const existing = await getActiveShareLinkForScript(scriptId);
  if (existing) {
    return { token: existing.token, url: buildShareUrl(existing.token) };
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }

  const token = randomBytes(16).toString("hex");

  await db.insert(scriptShareLinks).values({
    token,
    scriptId,
    workspaceId: ctx.workspaceId,
    createdByUserId: ctx.user.id,
    viewCount: 0,
  });

  return { token, url: buildShareUrl(token) };
}

export async function revokeShareLinkForScript(
  ctx: Pick<TrpcContext, "workspaceId" | "user">,
  scriptId: number
): Promise<{ success: true }> {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  await assertScriptOwnedByUser(scriptId, ctx);

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }

  await db
    .update(scriptShareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(scriptShareLinks.scriptId, scriptId), isNull(scriptShareLinks.revokedAt))
    );

  return { success: true };
}

export async function getShareLinkInfoForScript(
  ctx: Pick<TrpcContext, "workspaceId" | "user">,
  scriptId: number
): Promise<{
  token: string;
  url: string;
  viewCount: number;
  lastViewedAt: Date | null;
  isActive: boolean;
} | null> {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  await assertScriptOwnedByUser(scriptId, ctx);

  const [latest] = await (async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(scriptShareLinks)
      .where(eq(scriptShareLinks.scriptId, scriptId))
      .orderBy(desc(scriptShareLinks.createdAt))
      .limit(1);
  })();

  if (!latest) return null;

  const isActive = latest.revokedAt == null;

  return {
    token: latest.token,
    url: buildShareUrl(latest.token),
    viewCount: latest.viewCount,
    lastViewedAt: latest.lastViewedAt,
    isActive,
  };
}

export type PublicSharedScriptPayload = {
  title: string;
  content: string;
  sourceHandle: string | null;
};

export async function recordPublicShareView(
  token: string
): Promise<PublicSharedScriptPayload | null> {
  const db = await getDb();
  if (!db) return null;

  const [link] = await db
    .select()
    .from(scriptShareLinks)
    .where(
      and(eq(scriptShareLinks.token, token.trim()), isNull(scriptShareLinks.revokedAt))
    )
    .limit(1);

  if (!link) return null;

  await db
    .update(scriptShareLinks)
    .set({
      viewCount: link.viewCount + 1,
      lastViewedAt: new Date(),
    })
    .where(eq(scriptShareLinks.id, link.id));

  const script = await getSavedScript(link.scriptId);
  if (!script) return null;

  return {
    title: script.title,
    content: script.content,
    sourceHandle: script.sourceHandle,
  };
}
