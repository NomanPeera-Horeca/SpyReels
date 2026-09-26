import { coachScriptDownReasonLabel } from "@shared/coachScriptFeedback";
import type { CoachScriptJudgeMeta } from "@shared/coachScriptSections";
import { countWords, scriptHookPreview, truncateForAnalytics } from "@shared/scriptGenerationAnalytics";
import { appOrigin } from "@shared/spyreelsOrigins";

export type CoachScriptQualityRow = {
  id: number;
  createdAt: Date;
  title: string;
  hook: string;
  body: string;
  userEmail: string | null;
  userName: string | null;
  sourceLabel: string;
  sourceIdea: string;
  judge: CoachScriptJudgeMeta;
  feedbackRating: "up" | "down" | null;
  feedbackReason: string | null;
  feedbackNote: string | null;
};

export function parseCoachProductionNotes(
  productionNotes: string | null | undefined
): Record<string, unknown> {
  if (!productionNotes?.trim()) return {};
  try {
    const parsed = JSON.parse(productionNotes) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

export function readCoachScriptJudgeMeta(
  productionNotes: string | null | undefined
): CoachScriptJudgeMeta {
  const notes = parseCoachProductionNotes(productionNotes);
  const judge =
    notes.coachJudge && typeof notes.coachJudge === "object" && !Array.isArray(notes.coachJudge)
      ? (notes.coachJudge as Record<string, unknown>)
      : null;
  if (!judge) return {};

  const readScore = (key: string): number | undefined =>
    typeof judge[key] === "number" ? (judge[key] as number) : undefined;

  return {
    overallScore: readScore("overallScore"),
    hookEffectiveness: readScore("hookEffectiveness"),
    viewerSense: readScore("viewerSense"),
    nicheFit: readScore("nicheFit"),
    skipRatePrediction: readScore("skipRatePrediction"),
    ctaQuality: readScore("ctaQuality"),
    verdictPass: typeof judge.verdictPass === "boolean" ? judge.verdictPass : undefined,
    regenCount: typeof judge.regenCount === "number" ? judge.regenCount : undefined,
  };
}

export function readCoachScriptSourceDescription(
  productionNotes: string | null | undefined
): string {
  const notes = parseCoachProductionNotes(productionNotes);
  const value = notes.sourceDescription;
  return typeof value === "string" ? value.trim() : "";
}

export function coachScriptSourceLabel(input: {
  scriptMode?: string | null;
  planSourceType?: string | null;
}): string {
  if (input.planSourceType === "user_spark") return "Spark";
  if (input.planSourceType === "ai_pick") return "Plan";
  const mode = input.scriptMode?.trim();
  if (mode === "loop") return "Loop";
  if (mode === "story") return "Story";
  if (mode === "list") return "List";
  if (mode) return mode.charAt(0).toUpperCase() + mode.slice(1);
  return "Coach";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCsv(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function fmtDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export function buildCoachScriptQualitySummary(rows: CoachScriptQualityRow[]) {
  const judgeScores = rows
    .map((row) => row.judge.overallScore)
    .filter((score): score is number => typeof score === "number");
  const avgJudge =
    judgeScores.length > 0
      ? Math.round((judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length) * 10) / 10
      : null;

  const belowBar = rows.filter((row) => {
    const score = row.judge.overallScore;
    return typeof score === "number" && score < 7;
  }).length;

  const thumbsUp = rows.filter((row) => row.feedbackRating === "up").length;
  const thumbsDown = rows.filter((row) => row.feedbackRating === "down").length;

  return {
    totalScripts: rows.length,
    thumbsUp,
    thumbsDown,
    avgJudge,
    belowBar,
    withJudge: judgeScores.length,
  };
}

export function buildCoachScriptQualityHtml(args: {
  rows: CoachScriptQualityRow[];
  dateLabel: string;
}): string {
  const summary = buildCoachScriptQualitySummary(args.rows);
  const sections = args.rows
    .map((row) => {
      const studioUrl = `${appOrigin()}/studio?script=${row.id}`;
      const judge = row.judge;
      const judgeLine =
        typeof judge.overallScore === "number"
          ? `Judge ${judge.overallScore}/10 · sense ${judge.viewerSense ?? "n/a"}/10 · skip ${judge.skipRatePrediction ?? "n/a"}/10 · ${judge.verdictPass ? "pass" : "fail"} · regen ${judge.regenCount ?? 0}`
          : "Judge n/a (legacy script)";
      const feedbackLine =
        row.feedbackRating === "up"
          ? "Thumbs up"
          : row.feedbackRating === "down"
            ? `Thumbs down · ${row.feedbackReason ?? "no reason"}${row.feedbackNote ? ` · ${row.feedbackNote}` : ""}`
            : "No feedback yet";

      return `
<section style="margin: 24px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
  <p style="margin: 0 0 8px;"><strong>Script #${row.id}</strong> · ${fmtDate(row.createdAt)} UTC · ${escapeHtml(row.sourceLabel)}</p>
  <p style="margin: 0 0 8px;"><strong>User:</strong> ${escapeHtml(row.userName || "Unknown")} &lt;${escapeHtml(row.userEmail || "no email")}&gt;</p>
  <p style="margin: 0 0 8px;"><strong>Source idea:</strong></p>
  <pre style="white-space: pre-wrap; background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 13px;">${escapeHtml(truncateForAnalytics(row.sourceIdea, 1200))}</pre>
  <p style="margin: 8px 0;"><strong>Title:</strong> ${escapeHtml(row.title)}</p>
  <p style="margin: 4px 0;"><strong>Hook:</strong> ${escapeHtml(scriptHookPreview(row.hook))}</p>
  <p style="margin: 4px 0;"><strong>Quality:</strong> ${escapeHtml(judgeLine)}</p>
  <p style="margin: 4px 0;"><strong>Feedback:</strong> ${escapeHtml(feedbackLine)}</p>
  <p style="margin: 8px 0;"><a href="${studioUrl}">Open in Studio</a> · ${countWords(row.body)} words</p>
  <pre style="white-space: pre-wrap; background: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 13px; max-height: 360px; overflow: auto;">${escapeHtml(truncateForAnalytics(row.body, 2200))}</pre>
</section>`;
    })
    .join("\n");

  return `
<div style="font-family: Inter, Arial, sans-serif; max-width: 760px; margin: 0 auto; color: #111827;">
  <h1 style="font-size: 22px; margin-bottom: 8px;">SpyReels AI Coach script quality report</h1>
  <p style="color: #6b7280; margin-top: 0;">${escapeHtml(args.dateLabel)}</p>
  <ul style="line-height: 1.8;">
    <li><strong>Scripts:</strong> ${summary.totalScripts}</li>
    <li><strong>Thumbs up / down:</strong> ${summary.thumbsUp} / ${summary.thumbsDown}</li>
    <li><strong>Avg judge score:</strong> ${summary.avgJudge ?? "n/a"}/10 (${summary.withJudge} scored)</li>
    <li><strong>Scripts with judge below 7:</strong> ${summary.belowBar}</li>
  </ul>
  <p style="color: #4b5563; font-size: 14px;">Review scripts with thumbs down, judge fail, or overall below 7 first. New scripts include AI Coach Judge metadata; older rows may show n/a.</p>
  ${sections || "<p><em>No AI Coach scripts in this window.</em></p>"}
</div>`;
}

export function buildCoachScriptQualityCsv(rows: CoachScriptQualityRow[]): string {
  const header = [
    "script_id",
    "created_at_utc",
    "user_email",
    "user_name",
    "source_type",
    "source_idea",
    "title",
    "hook",
    "word_count",
    "judge_overall",
    "judge_viewer_sense",
    "judge_skip_rate",
    "judge_pass",
    "regen_count",
    "feedback_rating",
    "feedback_reason",
    "feedback_note",
    "studio_url",
  ].join(",");

  const lines = rows.map((row) => {
    const judge = row.judge;
    return [
      row.id,
      fmtDate(row.createdAt),
      row.userEmail ?? "",
      row.userName ?? "",
      row.sourceLabel,
      row.sourceIdea,
      row.title,
      row.hook,
      countWords(row.body),
      judge.overallScore ?? "",
      judge.viewerSense ?? "",
      judge.skipRatePrediction ?? "",
      judge.verdictPass == null ? "" : judge.verdictPass ? "pass" : "fail",
      judge.regenCount ?? "",
      row.feedbackRating ?? "",
      row.feedbackReason ? coachScriptDownReasonLabel(row.feedbackReason) : "",
      row.feedbackNote ?? "",
      `${appOrigin()}/studio?script=${row.id}`,
    ]
      .map(escapeCsv)
      .join(",");
  });

  return [header, ...lines].join("\n");
}
