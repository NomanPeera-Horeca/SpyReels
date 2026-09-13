import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { users, workspaceMembers, workspaces } from "../drizzle/schema";
import type { SavedScript, ScriptTag } from "../drizzle/schema";
import { scriptDisplayTitle } from "../shared/scriptDisplayTitle";
import {
  assignTagToScript,
  createSavedScript,
  createScriptVersion,
  ensureDefaultTags,
  findOrCreateScriptTagInWorkspace,
  getDb,
  getTagsForScript,
  workspaceHasScriptForRecreated,
  workspaceHasScriptForReel,
} from "./db";
import { assertScriptInWorkspace } from "./assertScriptInWorkspace";
import type { TrpcContext } from "./_core/context";

export function workspaceDisplayName(name: string, isPersonal: boolean): string {
  return isPersonal ? "Personal" : name;
}

export async function enrichScriptsWithSendMeta<T extends SavedScript>(
  scripts: T[]
): Promise<
  (T & {
    sentFromWorkspaceName: string | null;
    sentByUserName: string | null;
  })[]
> {
  const sourceWorkspaceIds = [
    ...new Set(
      scripts.map(s => s.sourceWorkspaceId).filter((id): id is string => Boolean(id))
    ),
  ];
  const senderUserIds = [
    ...new Set(
      scripts.map(s => s.sentByUserId).filter((id): id is number => typeof id === "number")
    ),
  ];

  const db = await getDb();
  if (!db) {
    return scripts.map(s => ({
      ...s,
      title: scriptDisplayTitle(s.title, s.content),
      sentFromWorkspaceName: null,
      sentByUserName: null,
    }));
  }

  const workspaceNameById = new Map<string, string>();
  if (sourceWorkspaceIds.length > 0) {
    const workspaceRows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        isPersonal: workspaces.isPersonal,
      })
      .from(workspaces)
      .where(inArray(workspaces.id, sourceWorkspaceIds));
    for (const row of workspaceRows) {
      workspaceNameById.set(
        row.id,
        workspaceDisplayName(row.name, Boolean(row.isPersonal))
      );
    }
  }

  const senderNameById = new Map<number, string>();
  if (senderUserIds.length > 0) {
    const senderRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, senderUserIds));
    for (const row of senderRows) {
      senderNameById.set(
        row.id,
        row.name?.trim() || row.email?.trim() || "Someone"
      );
    }
  }

  return scripts.map(script => ({
    ...script,
    title: scriptDisplayTitle(script.title, script.content),
    sentFromWorkspaceName: script.sourceWorkspaceId
      ? workspaceNameById.get(script.sourceWorkspaceId) ?? null
      : null,
    sentByUserName:
      script.sentByUserId != null
        ? senderNameById.get(script.sentByUserId) ?? null
        : null,
  }));
}

async function copyTagsToWorkspace(
  sourceTags: ScriptTag[],
  newScriptId: number,
  targetWorkspaceId: string,
  userId: number
): Promise<void> {
  for (const tag of sourceTags) {
    const targetTagId = await findOrCreateScriptTagInWorkspace(
      targetWorkspaceId,
      userId,
      tag.name,
      tag.color
    );
    await assignTagToScript(newScriptId, targetTagId);
  }
}

export async function sendScriptToWorkspace(
  ctx: Pick<TrpcContext, "user" | "workspaceId">,
  input: { scriptId: number; targetWorkspaceId: string; note?: string }
): Promise<{ newScriptId: number; targetWorkspaceName: string }> {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.workspaceId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Active workspace required",
    });
  }

  if (input.targetWorkspaceId === ctx.workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot send a script to the workspace you are already in.",
    });
  }

  const sourceScript = await assertScriptInWorkspace(input.scriptId, ctx);
  if (sourceScript.userId !== ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only send scripts you own.",
    });
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }

  const [targetMembership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.targetWorkspaceId),
        eq(workspaceMembers.userId, ctx.user.id),
        isNull(workspaces.deletedAt)
      )
    )
    .limit(1);

  if (!targetMembership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of the target workspace.",
    });
  }

  const [targetWorkspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      isPersonal: workspaces.isPersonal,
    })
    .from(workspaces)
    .where(eq(workspaces.id, input.targetWorkspaceId))
    .limit(1);

  if (!targetWorkspace) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Target workspace not found." });
  }

  const [sourceWorkspace] = await db
    .select({
      name: workspaces.name,
      isPersonal: workspaces.isPersonal,
    })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId))
    .limit(1);

  const sourceTags = await getTagsForScript(sourceScript.id);
  await ensureDefaultTags(input.targetWorkspaceId, ctx.user.id);

  let copyReelId = sourceScript.reelId;
  if (copyReelId != null) {
    const reelTaken = await workspaceHasScriptForReel(
      input.targetWorkspaceId,
      ctx.user.id,
      copyReelId
    );
    if (reelTaken) copyReelId = null;
  }

  let copyRecreatedScriptId = sourceScript.recreatedScriptId;
  if (copyRecreatedScriptId != null) {
    const recreatedTaken = await workspaceHasScriptForRecreated(
      input.targetWorkspaceId,
      ctx.user.id,
      copyRecreatedScriptId
    );
    if (recreatedTaken) copyRecreatedScriptId = null;
  }

  const senderName =
    ctx.user.name?.trim() || ctx.user.email?.trim() || "Someone";
  const sourceLabel = sourceWorkspace
    ? workspaceDisplayName(sourceWorkspace.name, Boolean(sourceWorkspace.isPersonal))
    : "another workspace";
  const attributionLine = `Sent from ${sourceLabel} by ${senderName}`;

  const copyNotes = [attributionLine, input.note?.trim(), sourceScript.notes?.trim()]
    .filter(Boolean)
    .join("\n\n");

  const newScriptId = await createSavedScript({
    userId: ctx.user.id,
    workspaceId: input.targetWorkspaceId,
    reelId: copyReelId,
    recreatedScriptId: copyRecreatedScriptId,
    title: sourceScript.title,
    content: sourceScript.content,
    originalContent: sourceScript.originalContent ?? sourceScript.content,
    sourceHandle: sourceScript.sourceHandle,
    gradeLevel: sourceScript.gradeLevel,
    wordCount: sourceScript.wordCount,
    postDate: sourceScript.postDate,
    postTime: sourceScript.postTime,
    notes: copyNotes || null,
    status: sourceScript.status,
    generatedCaption: sourceScript.generatedCaption,
    generatedHashtags: sourceScript.generatedHashtags,
    captionStyle: sourceScript.captionStyle,
    sourceWorkspaceId: ctx.workspaceId,
    sourceScriptId: sourceScript.id,
    sentByUserId: ctx.user.id,
    sentAt: new Date(),
    senderNote: input.note?.trim() || null,
  });

  await createScriptVersion({
    scriptId: newScriptId,
    workspaceId: input.targetWorkspaceId,
    content: sourceScript.content,
    versionNumber: 1,
    changeType: "initial",
    changeDescription: attributionLine,
  });

  await copyTagsToWorkspace(
    sourceTags,
    newScriptId,
    input.targetWorkspaceId,
    ctx.user.id
  );

  return {
    newScriptId,
    targetWorkspaceName: workspaceDisplayName(
      targetWorkspace.name,
      Boolean(targetWorkspace.isPersonal)
    ),
  };
}
