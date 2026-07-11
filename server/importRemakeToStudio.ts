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
import { coachScripts } from "../drizzle/schema";
import { getDb } from "./db";
import {
  mapCoachScriptRow,
  type GeneratedCoachScript,
} from "./studioGenerateScript";

export async function importRemakeScriptToStudioForWorkspace(args: {
  userId: number;
  workspaceId: string;
  flatScript: string;
  title?: string;
  sourceHandle?: string;
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

  const productionNotes = buildRemakeImportProductionNotes(sections, {
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
    platform: "both",
    tone: "conversational",
    estimatedDuration: durationLabelFromWordCount(wordCount, "story"),
    contentType: "remake_import",
    contentFormat: "talking-head",
    formatLabel: "Imported remake",
    productionNotes,
  });

  const scriptId = insertResult[0]?.insertId;
  if (!scriptId) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save script" });
  }

  const [row] = await db.select().from(coachScripts).where(eq(coachScripts.id, scriptId)).limit(1);
  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load script" });
  }

  return mapCoachScriptRow(row);
}

function buildRemakeImportProductionNotes(
  sections: CoachScriptSections,
  extras: { sourceRemakeScript: string; sourceHandle?: string }
): string {
  const base = buildProductionNotesJson({}, sections, {
    scriptMode: "remake_import",
    contentFormat: "talking-head",
    sourceDescription: extras.sourceHandle
      ? `Imported from remake (@${extras.sourceHandle})`
      : "Imported from remake",
  });
  const parsed = JSON.parse(base) as Record<string, unknown>;
  parsed.importSource = "remake";
  parsed.sourceRemakeScript = extras.sourceRemakeScript;
  return JSON.stringify(parsed);
}
