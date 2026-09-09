import { accountEngagementRatePercent } from "./accountEngagementRate";
import {
  checkUsageLimit,
  incrementUsage,
} from "./stripe/stripe-service";
import {
  createTranscription,
  getReelsByJobId,
  getScrapeJob,
  getTranscriptionByReelId,
  getTranscriptionsByJobId,
  updateTranscription,
} from "./db";
import { ensureReelThumbnailOnR2 } from "./reelThumbnailR2";
import {
  classifyReelsByIds,
  ensureThumbnailTextForReels,
} from "./services/classifyReels.js";
import type { ReelExportRow } from "./exportTypes";
import type { Reel, Transcription } from "../drizzle/schema";
import {
  formatProductionFormatLabel,
  productionFormatFilmingTip,
} from "../shared/productionFormats";
import {
  EXPORT_TOP_VIRAL_COUNT,
  type ExportScope,
} from "../shared/exportScope";

export type ExportProgressUpdate = {
  currentStep: "transcribing" | "analyzing" | "building_excel" | "complete";
  progressPercent: number;
  stepDone?: number;
  stepTotal?: number;
  progressLabel?: string;
};

export type ExportProgressCallback = (
  update: ExportProgressUpdate
) => void | Promise<void>;

/** First ~3.5s of speech from timed segments (Deepgram), for hook export column. */
function extractHookTextFromSegments(
  segments: unknown,
  hookWindowSec = 3.6
): string | null {
  if (!Array.isArray(segments)) return null;
  const parts: string[] = [];
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const s = seg as { start?: unknown; end?: unknown; text?: unknown };
    const end = typeof s.end === "number" ? s.end : Number(s.end);
    const text = typeof s.text === "string" ? s.text.trim() : "";
    if (!text || !Number.isFinite(end)) continue;
    if (end <= hookWindowSec + 0.25) parts.push(text);
  }
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined.length > 0 ? joined.slice(0, 800) : null;
}

function sortReelsForExport(reelsList: Reel[], followerCount: number): Reel[] {
  return [...reelsList].sort((a, b) => {
    const erA = accountEngagementRatePercent(a.likeCount, a.commentCount, followerCount);
    const erB = accountEngagementRatePercent(b.likeCount, b.commentCount, followerCount);
    if (erB !== erA) return erB - erA;
    return b.viewCount - a.viewCount;
  });
}

/** Account-wide top performers for export (not dashboard filter/sort). */
export function selectReelsForExport(
  reelsList: Reel[],
  followerCount: number,
  scope: ExportScope
): Reel[] {
  const sorted = sortReelsForExport(reelsList, followerCount);
  if (scope === "top_viral_30") {
    return sorted.slice(0, EXPORT_TOP_VIRAL_COUNT);
  }
  return sorted;
}

function postedDayAndHourUtc(postedAt: Date | string | null | undefined): {
  postedDay: string;
  postedHourUtc: number | "";
} {
  if (!postedAt) return { postedDay: "", postedHourUtc: "" };
  const d = new Date(postedAt);
  if (Number.isNaN(d.getTime())) return { postedDay: "", postedHourUtc: "" };
  const postedDay = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return { postedDay, postedHourUtc: d.getUTCHours() };
}

function hookTextForExport(t: Transcription | undefined): string {
  const fromSegments = extractHookTextFromSegments(t?.segments ?? null);
  if (fromSegments) return fromSegments;
  const transcript = t?.transcript?.trim();
  if (!transcript) return "";
  return transcript.slice(0, 200);
}

function buildReelExportRow(
  r: Reel,
  followerCount: number,
  t: Transcription | undefined
): ReelExportRow {
  const { postedDay, postedHourUtc } = postedDayAndHourUtc(r.postedAt);
  const productionFormat = r.productionFormat || "";
  return {
    reelId: r.id,
    reelUrl: r.reelUrl,
    shortcode: r.shortcode,
    caption: r.caption || "",
    viewCount: r.viewCount,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    engagementRate: accountEngagementRatePercent(
      r.likeCount,
      r.commentCount,
      followerCount
    ),
    duration: r.duration || 0,
    postedAt: r.postedAt ? new Date(r.postedAt).toISOString() : "",
    postedDay,
    postedHourUtc,
    hookText: hookTextForExport(t),
    productionFormat,
    productionFormatLabel: formatProductionFormatLabel(productionFormat),
    filmingTip: productionFormatFilmingTip(productionFormat),
    thumbnailText: r.thumbnailText || "",
    hookPattern: r.hookPattern || "",
    contentType: r.contentType || "",
    remakeabilityScore: r.remakeabilityScore ?? "",
    suggestedAction: r.suggestedAction || "",
    classificationReason: r.classificationReason || "",
    niche: r.niche || "",
    viralFlag: Boolean(r.viralFlag),
    transcript: t?.transcript || "",
    hookAnalysis: t?.hookAnalysis || "",
    thumbnailUrl: r.thumbnailUrl || "",
  };
}

export async function buildExportRows(
  jobId: number,
  scope: ExportScope = "all"
): Promise<{
  rows: ReelExportRow[];
  job: Awaited<ReturnType<typeof getScrapeJob>>;
}> {
  const job = await getScrapeJob(jobId);
  const reelsList = await getReelsByJobId(jobId);
  const transcriptionsList = await getTranscriptionsByJobId(jobId);
  const transcriptionMap = new Map(transcriptionsList.map((t) => [t.reelId, t]));
  const followerCount = job?.followerCount || 0;
  const selected = selectReelsForExport(reelsList, followerCount, scope);
  const rows = selected.map((r) =>
    buildReelExportRow(r, followerCount, transcriptionMap.get(r.id))
  );
  return { rows, job };
}

async function waitForTranscriptionComplete(
  reelId: number,
  maxMs = 180_000
): Promise<Awaited<ReturnType<typeof getTranscriptionByReelId>>> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const t = await getTranscriptionByReelId(reelId);
    if (t?.status === "completed" || t?.status === "failed") return t;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return getTranscriptionByReelId(reelId);
}

/** Transcribe, classify, and fill visual export fields with progress updates. */
export async function prepareReelsForExport(
  jobId: number,
  userId: number,
  openId: string,
  scope: ExportScope = "all",
  onProgress?: ExportProgressCallback
): Promise<void> {
  const { runTranscription } = await import("./routers/_shared.js");
  const job = await getScrapeJob(jobId);
  const reelsList = await getReelsByJobId(jobId);
  const followerCount = job?.followerCount || 0;
  const exportReels = selectReelsForExport(reelsList, followerCount, scope);

  const needsTranscribe: Reel[] = [];
  for (const reel of exportReels) {
    const existing = await getTranscriptionByReelId(reel.id);
    if (existing?.status === "completed") continue;
    if (existing?.status === "processing") {
      needsTranscribe.push(reel);
      continue;
    }
    needsTranscribe.push(reel);
  }

  const transcribeTotal = needsTranscribe.length;
  let transcribeDone = 0;

  await onProgress?.({
    currentStep: "transcribing",
    progressPercent: transcribeTotal === 0 ? 70 : 0,
    stepDone: 0,
    stepTotal: transcribeTotal,
    progressLabel:
      transcribeTotal > 0
        ? `Transcribing 0 of ${transcribeTotal} reels…`
        : "Transcriptions ready",
  });

  for (const reel of exportReels) {
    let existing = await getTranscriptionByReelId(reel.id);

    if (existing?.status === "completed") continue;

    if (existing?.status === "processing") {
      await waitForTranscriptionComplete(reel.id);
      transcribeDone++;
      await onProgress?.({
        currentStep: "transcribing",
        progressPercent:
          transcribeTotal === 0
            ? 70
            : Math.min(70, Math.floor((transcribeDone / transcribeTotal) * 70)),
        stepDone: transcribeDone,
        stepTotal: transcribeTotal,
        progressLabel: `Transcribing ${transcribeDone} of ${transcribeTotal} reels…`,
      });
      continue;
    }

    const usageCheck = await checkUsageLimit(userId, "transcribeCount", openId);
    if (!usageCheck.allowed) break;

    if (existing?.status === "failed") {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (db) {
        const { transcriptions: transcriptionsTable } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(transcriptionsTable).where(eq(transcriptionsTable.id, existing.id));
      }
    }

    const transcriptionId = await createTranscription({
      reelId: reel.id,
      featuredReelId: null,
      status: "processing",
      queuedAt: new Date(),
    });

    await incrementUsage(userId, "transcribeCount");

    await runTranscription(transcriptionId, {
      id: reel.id,
      shortcode: reel.shortcode,
      videoUrl: reel.videoUrl,
      caption: reel.caption,
      thumbnailUrl: reel.thumbnailUrl,
    });

    transcribeDone++;
    await onProgress?.({
      currentStep: "transcribing",
      progressPercent: Math.min(70, Math.floor((transcribeDone / transcribeTotal) * 70)),
      stepDone: transcribeDone,
      stepTotal: transcribeTotal,
      progressLabel: `Transcribing ${transcribeDone} of ${transcribeTotal} reels…`,
    });
  }

  await onProgress?.({
    currentStep: "analyzing",
    progressPercent: 72,
    progressLabel: "Analyzing filming style…",
  });

  let refreshedReels = selectReelsForExport(
    await getReelsByJobId(jobId),
    followerCount,
    scope
  );
  const transcriptionsList = await getTranscriptionsByJobId(jobId);
  const transcriptionMap = new Map(transcriptionsList.map((t) => [t.reelId, t]));
  const needsClassifyIds = refreshedReels
    .filter((r) => {
      if (!r.classifiedAt) {
        const t = transcriptionMap.get(r.id);
        return t?.status === "completed";
      }
      return !r.productionFormat;
    })
    .map((r) => r.id);

  if (needsClassifyIds.length > 0) {
    await classifyReelsByIds(needsClassifyIds);
  }

  await onProgress?.({
    currentStep: "analyzing",
    progressPercent: 82,
    progressLabel: "Reading thumbnail text…",
  });

  refreshedReels = selectReelsForExport(
    await getReelsByJobId(jobId),
    followerCount,
    scope
  );
  const thumbItems = await Promise.all(
    refreshedReels.map(async (r) => {
      const stableThumb = r.thumbnailUrl
        ? await ensureReelThumbnailOnR2(r.shortcode, r.thumbnailUrl)
        : "";
      return {
        id: r.id,
        thumbnailUrl: stableThumb || r.thumbnailUrl,
        thumbnailText: r.thumbnailText,
      };
    })
  );
  await ensureThumbnailTextForReels(thumbItems);

  await onProgress?.({
    currentStep: "analyzing",
    progressPercent: 85,
    progressLabel: "Analysis complete",
  });
}
