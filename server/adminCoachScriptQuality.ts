import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import {
  buildCoachScriptQualityCsv,
  buildCoachScriptQualityHtml,
  buildCoachScriptQualitySummary,
  coachScriptSourceLabel,
  parseCoachProductionNotes,
  readCoachScriptJudgeMeta,
  readCoachScriptSourceDescription,
  type CoachScriptQualityRow,
} from "@shared/coachScriptQualityReport";
import { coachScriptDownReasonLabel } from "@shared/coachScriptFeedback";
import {
  coachScriptFeedback,
  coachScripts,
  planCards,
  users,
} from "../drizzle/schema";
import { DATE_RANGE_PRESETS, resolveDateRange } from "./adminUserMetrics";
import { getDb } from "./db";

export const coachScriptQualityFiltersSchema = z.object({
  dateRangePreset: z.enum(DATE_RANGE_PRESETS).default("7d"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type CoachScriptQualityFilters = z.infer<typeof coachScriptQualityFiltersSchema>;

function rangeToUtcBounds(startDate: string, endDate: string) {
  return {
    start: new Date(`${startDate}T00:00:00.000Z`),
    end: new Date(`${endDate}T23:59:59.999Z`),
  };
}

function resolvePlanSourceIdea(row: {
  userRawNote: string | null;
  angle: string;
  title: string;
  hook: string;
}): string {
  return (
    row.userRawNote?.trim() ||
    row.angle?.trim() ||
    row.title?.trim() ||
    row.hook?.trim() ||
    ""
  );
}

async function fetchCoachScriptQualityRows(
  filters: CoachScriptQualityFilters
): Promise<{ rows: CoachScriptQualityRow[]; dateRange: ReturnType<typeof resolveDateRange> }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const dateRange = resolveDateRange(filters);
  const { start, end } = rangeToUtcBounds(dateRange.startDate, dateRange.endDate);

  const scriptRows = await db
    .select({
      id: coachScripts.id,
      createdAt: coachScripts.createdAt,
      title: coachScripts.title,
      hook: coachScripts.hook,
      body: coachScripts.body,
      productionNotes: coachScripts.productionNotes,
      planCardId: coachScripts.planCardId,
      userEmail: users.email,
      userName: users.name,
      planSourceType: planCards.sourceType,
      planUserRawNote: planCards.userRawNote,
      planAngle: planCards.angle,
      planTitle: planCards.title,
      planHook: planCards.hook,
    })
    .from(coachScripts)
    .leftJoin(users, eq(coachScripts.userId, users.id))
    .leftJoin(planCards, eq(coachScripts.planCardId, planCards.id))
    .where(and(gte(coachScripts.createdAt, start), lte(coachScripts.createdAt, end)))
    .orderBy(desc(coachScripts.createdAt));

  const scriptIds = scriptRows.map((row) => row.id);
  const feedbackByScriptId = new Map<
    number,
    { rating: "up" | "down"; reason: string | null; note: string | null }
  >();

  if (scriptIds.length > 0) {
    const feedbackRows = await db
      .select({
        coachScriptId: coachScriptFeedback.coachScriptId,
        rating: coachScriptFeedback.rating,
        reason: coachScriptFeedback.reason,
        note: coachScriptFeedback.note,
        createdAt: coachScriptFeedback.createdAt,
      })
      .from(coachScriptFeedback)
      .where(inArray(coachScriptFeedback.coachScriptId, scriptIds))
      .orderBy(desc(coachScriptFeedback.createdAt));

    for (const feedback of feedbackRows) {
      if (feedbackByScriptId.has(feedback.coachScriptId)) continue;
      if (feedback.rating !== "up" && feedback.rating !== "down") continue;
      feedbackByScriptId.set(feedback.coachScriptId, {
        rating: feedback.rating,
        reason: feedback.reason,
        note: feedback.note,
      });
    }
  }

  const rows: CoachScriptQualityRow[] = scriptRows.map((row) => {
    const notes = parseCoachProductionNotes(row.productionNotes);
    const scriptMode =
      typeof notes.scriptMode === "string" ? notes.scriptMode : null;
    const sourceDescription = readCoachScriptSourceDescription(row.productionNotes);
    const sourceIdea =
      sourceDescription ||
      (row.planCardId
        ? resolvePlanSourceIdea({
            userRawNote: row.planUserRawNote,
            angle: row.planAngle ?? "",
            title: row.planTitle ?? "",
            hook: row.planHook ?? "",
          })
        : "");
    const feedback = feedbackByScriptId.get(row.id);

    return {
      id: row.id,
      createdAt: row.createdAt,
      title: row.title,
      hook: row.hook,
      body: row.body,
      userEmail: row.userEmail,
      userName: row.userName,
      sourceLabel: coachScriptSourceLabel({
        scriptMode,
        planSourceType: row.planSourceType,
      }),
      sourceIdea,
      judge: readCoachScriptJudgeMeta(row.productionNotes),
      feedbackRating: feedback?.rating ?? null,
      feedbackReason: feedback?.reason
        ? coachScriptDownReasonLabel(feedback.reason)
        : null,
      feedbackNote: feedback?.note ?? null,
    };
  });

  return { rows, dateRange };
}

export async function buildCoachScriptQualityReport(filters: CoachScriptQualityFilters) {
  const parsed = coachScriptQualityFiltersSchema.parse(filters);
  const { rows, dateRange } = await fetchCoachScriptQualityRows(parsed);
  const summary = buildCoachScriptQualitySummary(rows);

  return {
    dateRange,
    summary,
    items: rows.slice(0, 40).map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      title: row.title,
      hookPreview: row.hook.slice(0, 140),
      userEmail: row.userEmail,
      userName: row.userName,
      sourceLabel: row.sourceLabel,
      judgeOverall: row.judge.overallScore ?? null,
      judgePass: row.judge.verdictPass ?? null,
      regenCount: row.judge.regenCount ?? null,
      feedbackRating: row.feedbackRating,
      feedbackReason: row.feedbackReason,
    })),
    total: rows.length,
  };
}

export async function buildCoachScriptQualityDownload(args: {
  filters: CoachScriptQualityFilters;
  format: "html" | "csv";
}): Promise<{ filename: string; mimeType: string; fileBase64: string }> {
  const parsed = coachScriptQualityFiltersSchema.parse(args.filters);
  const { rows, dateRange } = await fetchCoachScriptQualityRows(parsed);
  const stamp = new Date().toISOString().slice(0, 10);

  if (args.format === "csv") {
    const csv = buildCoachScriptQualityCsv(rows);
    return {
      filename: `coach-script-quality-${stamp}.csv`,
      mimeType: "text/csv;charset=utf-8",
      fileBase64: Buffer.from(csv, "utf8").toString("base64"),
    };
  }

  const html = buildCoachScriptQualityHtml({
    rows,
    dateLabel: dateRange.label,
  });
  return {
    filename: `coach-script-quality-${stamp}.html`,
    mimeType: "text/html;charset=utf-8",
    fileBase64: Buffer.from(html, "utf8").toString("base64"),
  };
}
