import { TRPCError } from "@trpc/server";
import {
  createSavedScript,
  createScriptVersion,
  ensureDefaultTags,
  getLatestVersionNumber,
  getSavedScriptIdForRecreated,
  getSavedScriptIdForReel,
  updateSavedScript,
} from "./db";

export type RecreateForSavedScriptPromote = {
  id: number;
  status: string;
  generatedScript: string | null;
  topic: string | null;
  gradeLevel: string | null;
  reelId: number | null;
};

export type EnsureSavedScriptFromRecreateResult = {
  id: number;
  created: boolean;
  updated: boolean;
};

function remakeTitle(topic: string | null | undefined): string {
  const trimmed = String(topic ?? "").trim();
  if (trimmed && trimmed !== "SAME_TOPIC" && trimmed !== "Personalized") {
    return `Remake: ${trimmed.slice(0, 60)}`;
  }
  return "Remake script";
}

export function isDuplicateSavedScriptReelError(error: unknown): boolean {
  const withCause = error as { cause?: unknown; code?: string; sqlMessage?: string };
  const root = (withCause.cause ?? error) as { code?: string; sqlMessage?: string; message?: string };
  const code = root.code ?? withCause.code;
  const message = `${root.sqlMessage ?? ""} ${root.message ?? ""} ${String(error)}`;
  return code === "ER_DUP_ENTRY" && message.includes("uniq_saved_scripts_workspace_user_reel");
}

async function applyRemakeToExistingSavedScript(args: {
  scriptId: number;
  recreatedScriptId: number;
  content: string;
  gradeLevel: string | null;
  wordCount: number;
}): Promise<EnsureSavedScriptFromRecreateResult> {
  await updateSavedScript(args.scriptId, {
    content: args.content,
    recreatedScriptId: args.recreatedScriptId,
    gradeLevel: args.gradeLevel,
    wordCount: args.wordCount,
  });
  const latest = await getLatestVersionNumber(args.scriptId);
  await createScriptVersion({
    scriptId: args.scriptId,
    content: args.content,
    versionNumber: latest + 1,
    changeType: "ai_rewrite",
    changeDescription: "Re-remake from source reel",
  });
  return { id: args.scriptId, created: false, updated: true };
}

/**
 * Promote a completed remake into My Scripts.
 * Identity is one saved script per reel (workspace + user). Re-remakes upsert
 * that row and append a version instead of inserting a duplicate.
 */
export async function ensureSavedScriptFromRecreate(args: {
  workspaceId: string;
  userId: number;
  recreated: RecreateForSavedScriptPromote;
}): Promise<EnsureSavedScriptFromRecreateResult> {
  const { workspaceId, userId, recreated } = args;
  const recreatedScriptId = recreated.id;

  if (recreated.status !== "completed") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Remake script is not ready yet. Wait for generation to finish.",
    });
  }

  const content = String(recreated.generatedScript ?? "").trim();
  if (!content) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Remake finished with empty script content. Retry remake.",
    });
  }

  const existingByRecreated = await getSavedScriptIdForRecreated(
    workspaceId,
    userId,
    recreatedScriptId
  );
  if (existingByRecreated != null) {
    return { id: existingByRecreated, created: false, updated: false };
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const gradeLevel = recreated.gradeLevel ?? null;
  const reelId = recreated.reelId;

  if (reelId != null) {
    const existingByReel = await getSavedScriptIdForReel(workspaceId, userId, reelId);
    if (existingByReel != null) {
      return applyRemakeToExistingSavedScript({
        scriptId: existingByReel,
        recreatedScriptId,
        content,
        gradeLevel,
        wordCount,
      });
    }
  }

  await ensureDefaultTags(workspaceId, userId);

  try {
    const scriptId = await createSavedScript({
      userId,
      workspaceId,
      reelId: reelId ?? null,
      recreatedScriptId,
      title: remakeTitle(recreated.topic),
      content,
      originalContent: content,
      sourceHandle: null,
      gradeLevel,
      wordCount,
      postDate: null,
      postTime: null,
      notes: null,
      status: "draft",
    });
    await createScriptVersion({
      scriptId,
      content,
      versionNumber: 1,
      changeType: "initial",
      changeDescription: "Initial remake script",
    });
    return { id: scriptId, created: true, updated: false };
  } catch (error) {
    if (reelId == null || !isDuplicateSavedScriptReelError(error)) {
      throw error;
    }
    const raced = await getSavedScriptIdForReel(workspaceId, userId, reelId);
    if (raced == null) throw error;
    return applyRemakeToExistingSavedScript({
      scriptId: raced,
      recreatedScriptId,
      content,
      gradeLevel,
      wordCount,
    });
  }
}
