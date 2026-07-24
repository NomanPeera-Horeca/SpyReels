import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  buildProductionNotesJson,
  type CoachScriptSections,
} from "@shared/coachScriptSections";
import { durationLabelFromWordCount } from "@shared/coachScriptLength";
import {
  buildCoachSectionsFromRemakeScript,
  normalizeRemakeScriptText,
} from "@shared/remakeStudioImport";
import { buildConvertRoughScriptPrompt } from "@shared/studioHeit";
import { coachScripts } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { getCreatorCoachProfile } from "./planCoachProfile";
import {
  mapCoachScriptRow,
  normalizeProductionCoach,
  type GeneratedCoachScript,
} from "./studioGenerateScript";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { normalizeCoachScriptPayload, parseLlmJson } from "./utils/parseLlmJson";

export async function importRemakeScriptToStudioForWorkspace(args: {
  userId: number;
  workspaceId: string;
  flatScript: string;
  title?: string;
  sourceHandle?: string;
  /** Source reel/video caption when available (folded into convert-path brand context). */
  sourceCaption?: string;
  /** e.g. "Instagram Reel" | "TikTok video" | "YouTube Short" */
  platformLabel?: string;
}): Promise<GeneratedCoachScript> {
  const normalized = normalizeRemakeScriptText(args.flatScript);
  if (normalized.length < 20) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Script is too short to open in Studio.",
    });
  }

  const { hook, sections, body, callToAction, wordCount } =
    buildCoachSectionsFromRemakeScript(normalized);

  const productionNotes = buildEmptyRemakeImportProductionNotes({
    sections,
    sourceRemakeScript: normalized,
    sourceHandle: args.sourceHandle,
  });

  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  }

  const title =
    args.title?.trim() ||
    (args.sourceHandle ? `Script from @${args.sourceHandle}` : "Remake script");

  const insertResult = await db.insert(coachScripts).values({
    userId: args.userId,
    workspaceId: args.workspaceId,
    planCardId: null,
    title: title.slice(0, 256),
    hook: hook || normalized.slice(0, 500),
    body,
    callToAction,
    platform: platformFromRemakeLabel(args.platformLabel),
    tone: "conversational",
    estimatedDuration: durationLabelFromWordCount(wordCount, "story"),
    contentType: "remake_import",
    contentFormat: "talking-head",
    formatLabel: "Imported remake",
    productionNotes,
    productionNotesStatus: "processing",
  });

  const scriptId = insertResult[0]?.insertId;
  if (!scriptId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save script" });
  }

  const [row] = await db.select().from(coachScripts).where(eq(coachScripts.id, scriptId)).limit(1);
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load script" });
  }

  // Same convention as recreate.generate → runScriptGeneration: fire and return.
  runRemakeImportProductionGeneration(scriptId, {
    sections,
    hook,
    userId: args.userId,
    sourceRemakeScript: normalized,
    sourceHandle: args.sourceHandle,
    workingTitle: args.title,
    sourceCaption: args.sourceCaption,
    platformLabel: args.platformLabel,
  }).catch((err: unknown) => {
    console.error(`[importRemake] production generation ${scriptId} failed:`, err);
  });

  return mapCoachScriptRow(row);
}

function platformFromRemakeLabel(label?: string): string {
  const raw = (label ?? "").toLowerCase();
  if (raw.includes("tiktok")) return "tiktok";
  if (raw.includes("youtube")) return "instagram";
  if (raw.includes("instagram")) return "instagram";
  return "both";
}

function buildEmptyRemakeImportProductionNotes(args: {
  sections: CoachScriptSections;
  sourceRemakeScript: string;
  sourceHandle?: string;
}): string {
  const base = buildProductionNotesJson({}, args.sections, {
    scriptMode: "remake_import",
    contentFormat: "talking-head",
    sourceDescription: args.sourceHandle
      ? `Imported from remake (@${args.sourceHandle})`
      : "Imported from remake",
  });
  const parsed = JSON.parse(base) as Record<string, unknown>;
  parsed.importSource = "remake";
  parsed.sourceRemakeScript = args.sourceRemakeScript;
  return JSON.stringify(parsed);
}

/**
 * Background worker (recreate.generate / runScriptGeneration pattern).
 * Updates productionNotes + productionNotesStatus; never throws to the caller
 * path that already returned the script row.
 */
export async function runRemakeImportProductionGeneration(
  scriptId: number,
  args: {
    sections: CoachScriptSections;
    hook: string;
    userId: number;
    sourceRemakeScript: string;
    sourceHandle?: string;
    workingTitle?: string;
    sourceCaption?: string;
    platformLabel?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error(`[importRemake] production generation ${scriptId}: database unavailable`);
    return;
  }

  try {
    const notes = await generateRemakeImportProductionNotes(args);
    await db
      .update(coachScripts)
      .set({
        productionNotes: notes,
        productionNotesStatus: "completed",
      })
      .where(eq(coachScripts.id, scriptId));
  } catch (error) {
    console.warn(
      `[importRemake] production notes generation failed for script ${scriptId}; leaving script intact:`,
      error instanceof Error ? error.message : error
    );
    try {
      await db
        .update(coachScripts)
        .set({ productionNotesStatus: "failed" })
        .where(eq(coachScripts.id, scriptId));
    } catch (updateError) {
      console.error(
        `[importRemake] failed to mark productionNotesStatus=failed for ${scriptId}:`,
        updateError
      );
    }
  }
}

/**
 * Same production-notes LLM path as convertRoughScriptForWorkspace
 * (buildConvertRoughScriptPrompt + normalizeProductionCoach), with remake
 * metadata preserved.
 */
async function generateRemakeImportProductionNotes(args: {
  sections: CoachScriptSections;
  hook: string;
  userId: number;
  sourceRemakeScript: string;
  sourceHandle?: string;
  workingTitle?: string;
  sourceCaption?: string;
  platformLabel?: string;
}): Promise<string> {
  // Test-only hook for scripts/test-remake-studio-import.ts --fail-only
  if (process.env.SPYREELS_TEST_FORCE_REMAKE_PRODUCTION_FAIL === "1") {
    throw new Error("forced production fail for test");
  }

  const profile = await getCreatorCoachProfile(args.userId);
  const brandParts = [
    profile.brandDescription?.trim() || "",
    args.sourceCaption?.trim()
      ? `Source caption: ${args.sourceCaption.trim().slice(0, 800)}`
      : "",
    args.platformLabel?.trim()
      ? `Source platform: ${args.platformLabel.trim()}`
      : "",
  ].filter(Boolean);
  const brandDescription = brandParts.length > 0 ? brandParts.join("\n") : null;

  const notesResponse = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You add film-ready production notes for SpyReels Studio. Never rewrite spoken script lines. Return JSON only."
        ),
      },
      {
        role: "user",
        content: buildConvertRoughScriptPrompt(
          args.sourceRemakeScript,
          profile.niche,
          profile.targetAudience,
          brandDescription,
          args.workingTitle,
          {
            hook: args.hook,
            explain: args.sections.explain,
            illustrate: args.sections.illustrate,
            teach: args.sections.teach,
            cta: args.sections.cta,
          }
        ),
      },
    ],
    maxTokens: 2048,
    response_format: { type: "json_object" },
  });

  const notesRaw = String(notesResponse.choices[0]?.message?.content ?? "{}");
  const notesPayload = normalizeCoachScriptPayload(
    parseLlmJson<Record<string, unknown>>(notesRaw, {})
  );
  const productionCoach = normalizeProductionCoach(notesPayload.productionCoach);
  const contentFormat = String(notesPayload.contentFormat ?? "talking-head").slice(0, 64);
  const hookTypeRaw = String(notesPayload.hookType ?? "").trim();

  const coachPayload = buildProductionNotesJson(productionCoach, args.sections, {
    contentFormat,
    scriptMode: "remake_import",
    hookType: hookTypeRaw || undefined,
    sourceDescription: args.sourceHandle
      ? `Imported from remake (@${args.sourceHandle})`
      : "Imported from remake",
  });
  const parsed = JSON.parse(coachPayload) as Record<string, unknown>;
  parsed.importSource = "remake";
  parsed.sourceRemakeScript = args.sourceRemakeScript;
  return JSON.stringify(parsed);
}
