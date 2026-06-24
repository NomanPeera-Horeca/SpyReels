/**
 * Email a script generation QA report (Idea to Script + Remake).
 *
 * Run: pnpm exec tsx scripts/report-script-generations.ts
 *      pnpm exec tsx scripts/report-script-generations.ts --days=30 --to=nomanpeera@gmail.com
 */
import "dotenv/config";
import { desc, eq, gte } from "drizzle-orm";
import { recreatedScripts, scriptIdeas, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { sendScriptGenerationReportEmail } from "../server/utils/email";
import {
  countWords,
  readIdeaScriptJudgeMeta,
  scriptHookPreview,
  truncateForAnalytics,
} from "../shared/scriptGenerationAnalytics";

function parseArgs(): { days: number; to: string; dryRun: boolean; outPath: string | null } {
  let days = 14;
  let to = "nomanpeera@gmail.com";
  let dryRun = false;
  let outPath: string | null = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--days=")) days = Math.max(1, Number(arg.split("=")[1]) || 14);
    else if (arg.startsWith("--to=")) to = arg.split("=")[1] || to;
    else if (arg.startsWith("--out=")) outPath = arg.slice("--out=".length) || null;
    else if (arg === "--dry-run") dryRun = true;
  }
  return { days, to, dryRun, outPath };
}

function sinceDate(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

type IdeaRow = {
  id: number;
  userId: number;
  idea: string;
  niche: string | null;
  status: string;
  generatedTitle: string | null;
  generatedScript: string | null;
  viralStructure: unknown;
  errorMessage: string | null;
  createdAt: Date;
  userEmail: string | null;
  userName: string | null;
};

type RemakeRow = {
  id: number;
  userId: number;
  topic: string;
  status: string;
  generatedScript: string | null;
  errorMessage: string | null;
  createdAt: Date;
  userEmail: string | null;
  userName: string | null;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderIdeaSection(rows: IdeaRow[]): string {
  if (rows.length === 0) {
    return `<p><em>No Idea to Script rows in this window.</em></p>`;
  }
  return rows
    .map((row) => {
      const judge = readIdeaScriptJudgeMeta(row.viralStructure);
      const script = row.generatedScript ?? "";
      const statusColor =
        row.status === "completed" ? "#16a34a" : row.status === "failed" ? "#dc2626" : "#ca8a04";
      return `
<section style="margin: 24px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
  <p style="margin: 0 0 8px;"><strong>Idea #${row.id}</strong>
    <span style="color: ${statusColor}; font-weight: 600;">${row.status.toUpperCase()}</span>
    · ${fmtDate(row.createdAt)} UTC</p>
  <p style="margin: 0 0 8px;"><strong>User:</strong> ${escapeHtml(row.userName || "Unknown")} &lt;${escapeHtml(row.userEmail || "no email")}&gt;</p>
  <p style="margin: 0 0 8px;"><strong>They asked:</strong></p>
  <pre style="white-space: pre-wrap; background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 13px;">${escapeHtml(row.idea)}</pre>
  ${row.niche ? `<p style="margin: 8px 0;"><strong>Niche:</strong> ${escapeHtml(row.niche)}</p>` : ""}
  ${
    row.status === "completed"
      ? `
  <p style="margin: 8px 0;"><strong>SpyReels generated</strong> (${countWords(script)} words, judge ${judge.finalOverallScore ?? "n/a"}/10, skip-rate ${judge.skipRateScore ?? "n/a"}/10, ${judge.framework ?? "legacy"})</p>
  ${row.generatedTitle ? `<p style="margin: 4px 0;"><strong>Title:</strong> ${escapeHtml(row.generatedTitle)}</p>` : ""}
  <p style="margin: 4px 0;"><strong>Hook:</strong> ${escapeHtml(scriptHookPreview(script))}</p>
  <pre style="white-space: pre-wrap; background: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 13px; max-height: 420px; overflow: auto;">${escapeHtml(truncateForAnalytics(script, 2500))}</pre>
  `
      : row.errorMessage
        ? `<p style="color: #dc2626;"><strong>Error:</strong> ${escapeHtml(row.errorMessage)}</p>`
        : ""
  }
</section>`;
    })
    .join("\n");
}

function renderRemakeSection(rows: RemakeRow[]): string {
  if (rows.length === 0) {
    return `<p><em>No Remake scripts in this window.</em></p>`;
  }
  return rows
    .map((row) => {
      const script = row.generatedScript ?? "";
      const statusColor =
        row.status === "completed" ? "#16a34a" : row.status === "failed" ? "#dc2626" : "#ca8a04";
      return `
<section style="margin: 24px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
  <p style="margin: 0 0 8px;"><strong>Remake #${row.id}</strong>
    <span style="color: ${statusColor}; font-weight: 600;">${row.status.toUpperCase()}</span>
    · ${fmtDate(row.createdAt)} UTC</p>
  <p style="margin: 0 0 8px;"><strong>User:</strong> ${escapeHtml(row.userName || "Unknown")} &lt;${escapeHtml(row.userEmail || "no email")}&gt;</p>
  <p style="margin: 0 0 8px;"><strong>Topic / angle:</strong> ${escapeHtml(row.topic)}</p>
  ${
    row.status === "completed"
      ? `
  <p style="margin: 8px 0;"><strong>SpyReels generated</strong> (${countWords(script)} words)</p>
  <p style="margin: 4px 0;"><strong>Hook:</strong> ${escapeHtml(scriptHookPreview(script))}</p>
  <pre style="white-space: pre-wrap; background: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 13px; max-height: 420px; overflow: auto;">${escapeHtml(truncateForAnalytics(script, 2500))}</pre>
  `
      : row.errorMessage
        ? `<p style="color: #dc2626;"><strong>Error:</strong> ${escapeHtml(row.errorMessage)}</p>`
        : ""
  }
</section>`;
    })
    .join("\n");
}

function buildSummary(ideas: IdeaRow[], remakes: RemakeRow[]): string {
  const ideaCompleted = ideas.filter((r) => r.status === "completed").length;
  const ideaFailed = ideas.filter((r) => r.status === "failed").length;
  const remakeCompleted = remakes.filter((r) => r.status === "completed").length;
  const remakeFailed = remakes.filter((r) => r.status === "failed").length;

  const judgeScores = ideas
    .filter((r) => r.status === "completed")
    .map((r) => readIdeaScriptJudgeMeta(r.viralStructure).finalOverallScore)
    .filter((n): n is number => typeof n === "number");

  const avgJudge =
    judgeScores.length > 0
      ? (judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length).toFixed(1)
      : "n/a";

  const wordCounts = ideas
    .filter((r) => r.status === "completed" && r.generatedScript)
    .map((r) => countWords(r.generatedScript));

  const avgWords =
    wordCounts.length > 0
      ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
      : 0;

  const lowJudge = ideas.filter((r) => {
    if (r.status !== "completed") return false;
    const score = readIdeaScriptJudgeMeta(r.viralStructure).finalOverallScore;
    return typeof score === "number" && score < 7;
  }).length;

  return `
<ul style="line-height: 1.8;">
  <li><strong>Idea to Script:</strong> ${ideas.length} total · ${ideaCompleted} completed · ${ideaFailed} failed</li>
  <li><strong>Remake:</strong> ${remakes.length} total · ${remakeCompleted} completed · ${remakeFailed} failed</li>
  <li><strong>Avg judge score</strong> (completed ideas): ${avgJudge}/10</li>
  <li><strong>Completed ideas with judge &lt; 7:</strong> ${lowJudge}</li>
  <li><strong>Avg script length</strong> (completed ideas): ${avgWords} words</li>
</ul>
<p><strong>Review notes:</strong> HEIT framework is live on Idea to Script. Scripts under 120 words or over 320 words, or judge below 7, are worth a manual read. Failed rows show user-facing errors.</p>
<p>Going forward, PostHog events <code>idea_script_completed</code>, <code>idea_script_failed</code>, <code>remake_script_completed</code>, and <code>remake_script_failed</code> include user_idea and generated_script previews.</p>`;
}

function buildPlainTextSummary(ideas: IdeaRow[], remakes: RemakeRow[]): string {
  const lines: string[] = [
    "SpyReels script generation report",
    "",
    `Idea to Script: ${ideas.length} rows`,
    `Remake: ${remakes.length} rows`,
    "",
  ];
  for (const row of ideas) {
    lines.push(`--- Idea #${row.id} [${row.status}] ${row.userEmail ?? "no email"} ---`);
    lines.push(`Ask: ${row.idea}`);
    if (row.status === "completed" && row.generatedScript) {
      lines.push(`Script (${countWords(row.generatedScript)} words):`);
      lines.push(truncateForAnalytics(row.generatedScript, 1200));
    } else if (row.errorMessage) {
      lines.push(`Error: ${row.errorMessage}`);
    }
    lines.push("");
  }
  for (const row of remakes) {
    lines.push(`--- Remake #${row.id} [${row.status}] ${row.userEmail ?? "no email"} ---`);
    lines.push(`Topic: ${row.topic}`);
    if (row.status === "completed" && row.generatedScript) {
      lines.push(`Script (${countWords(row.generatedScript)} words):`);
      lines.push(truncateForAnalytics(row.generatedScript, 1200));
    } else if (row.errorMessage) {
      lines.push(`Error: ${row.errorMessage}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const { days, to, dryRun, outPath } = parseArgs();
  const db = await getDb();
  if (!db) {
    throw new Error("DATABASE_URL missing or database unreachable.");
  }

  const since = sinceDate(days);

  const ideaRows = await db
    .select({
      id: scriptIdeas.id,
      userId: scriptIdeas.userId,
      idea: scriptIdeas.idea,
      niche: scriptIdeas.niche,
      status: scriptIdeas.status,
      generatedTitle: scriptIdeas.generatedTitle,
      generatedScript: scriptIdeas.generatedScript,
      viralStructure: scriptIdeas.viralStructure,
      errorMessage: scriptIdeas.errorMessage,
      createdAt: scriptIdeas.createdAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(scriptIdeas)
    .leftJoin(users, eq(scriptIdeas.userId, users.id))
    .where(gte(scriptIdeas.createdAt, since))
    .orderBy(desc(scriptIdeas.createdAt));

  const remakeRows = await db
    .select({
      id: recreatedScripts.id,
      userId: recreatedScripts.userId,
      topic: recreatedScripts.topic,
      status: recreatedScripts.status,
      generatedScript: recreatedScripts.generatedScript,
      errorMessage: recreatedScripts.errorMessage,
      createdAt: recreatedScripts.createdAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(recreatedScripts)
    .leftJoin(users, eq(recreatedScripts.userId, users.id))
    .where(gte(recreatedScripts.createdAt, since))
    .orderBy(desc(recreatedScripts.createdAt));

  const reportDate = new Date().toISOString().slice(0, 10);
  const subject = `SpyReels script QA report · last ${days} days · ${reportDate}`;

  const html = `
<div style="font-family: Inter, Arial, sans-serif; max-width: 720px; margin: 0 auto; color: #111827;">
  <h1 style="font-size: 22px; margin-bottom: 8px;">SpyReels script generation report</h1>
  <p style="color: #6b7280; margin-top: 0;">Last ${days} days · generated ${reportDate}</p>
  ${buildSummary(ideaRows, remakeRows)}
  <h2 style="font-size: 18px; margin-top: 32px;">Idea to Script</h2>
  ${renderIdeaSection(ideaRows)}
  <h2 style="font-size: 18px; margin-top: 32px;">Remake</h2>
  ${renderRemakeSection(remakeRows)}
</div>`;

  const text = buildPlainTextSummary(ideaRows, remakeRows);

  console.log(
    `Report ready: ${ideaRows.length} ideas, ${remakeRows.length} remakes (${days} days) → ${to}${dryRun ? " [dry-run]" : ""}`
  );

  const ideaCompleted = ideaRows.filter((r) => r.status === "completed").length;
  const ideaFailed = ideaRows.filter((r) => r.status === "failed").length;
  const remakeCompleted = remakeRows.filter((r) => r.status === "completed").length;
  const remakeFailed = remakeRows.filter((r) => r.status === "failed").length;
  console.log(
    `Summary: ideas ${ideaCompleted} ok / ${ideaFailed} failed · remakes ${remakeCompleted} ok / ${remakeFailed} failed`
  );

  if (outPath) {
    const fs = await import("fs");
    fs.writeFileSync(outPath, html, "utf8");
    console.log(`Wrote ${outPath}`);
  }

  if (dryRun) {
    return;
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  await sendScriptGenerationReportEmail(to, subject, html, text);
  console.log(`Email sent to ${to}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
