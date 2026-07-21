import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { viralityDiagnosticJobs } from "../../drizzle/schema";
import { searchReelsByHandle } from "../instagram";
import { searchReelToParsedReel } from "../discovery/creatorPipeline";
import { computeViralScore } from "../discovery/scoring";
import { downloadVideo } from "../services/transcribeReel";
import { extractFrames } from "../services/extractFrames";
import { analyzeReelFrames } from "../services/analyzeReelFrames";
import { synthesizeViralityDiagnosis } from "./synthesizeDiagnosis";

const CONCURRENCY = 2;
const MAX_REELS = 30;

type ReelDiagnosticResult = {
  shortcode: string;
  viralScore: number | null;
  structuralAnalysis: Awaited<ReturnType<typeof analyzeReelFrames>>;
};

async function runBounded<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]!, i);
      }
    })
  );
  return results;
}

export async function runViralityDiagnosticJob(
  jobId: number,
  userId: number,
  handle: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(viralityDiagnosticJobs)
      .set({ status: "running" })
      .where(eq(viralityDiagnosticJobs.id, jobId));

    const { reels } = await searchReelsByHandle(handle, MAX_REELS);

    await db
      .update(viralityDiagnosticJobs)
      .set({ reelsFound: reels.length })
      .where(eq(viralityDiagnosticJobs.id, jobId));

    const scoredReels = reels
      .filter((r) => !!r.videoUrl)
      .map((r) => {
        const parsed = searchReelToParsedReel(r);
        const viralScore =
          parsed.owner.followers > 0 ? computeViralScore(parsed) : null;
        return { raw: r, viralScore };
      });

    let analyzedCount = 0;

    const results = await runBounded(
      scoredReels,
      CONCURRENCY,
      async (item): Promise<ReelDiagnosticResult | null> => {
        try {
          const videoResult = await downloadVideo(
            item.raw.videoUrl,
            item.raw.shortcode
          );
          if (!Buffer.isBuffer(videoResult)) {
            console.warn(
              `[runViralityDiagnosticJob ${jobId}] download failed for ${item.raw.shortcode}`
            );
            return null;
          }
          const frames = await extractFrames(videoResult, item.raw.shortcode);
          const structuralAnalysis = await analyzeReelFrames(
            frames,
            item.raw.shortcode
          );

          analyzedCount++;
          try {
            await db
              .update(viralityDiagnosticJobs)
              .set({ reelsAnalyzed: analyzedCount })
              .where(eq(viralityDiagnosticJobs.id, jobId));
          } catch (progressErr) {
            console.warn(
              `[runViralityDiagnosticJob ${jobId}] progress update failed:`,
              progressErr
            );
          }

          return {
            shortcode: item.raw.shortcode,
            viralScore: item.viralScore,
            structuralAnalysis,
          };
        } catch (err) {
          console.warn(
            `[runViralityDiagnosticJob ${jobId}] failed for ${item.raw.shortcode}:`,
            err instanceof Error ? err.message : err
          );
          return null;
        }
      }
    );

    const successfulResults = results.filter(
      (r): r is ReelDiagnosticResult => r !== null
    );

    const diagnosis = await synthesizeViralityDiagnosis(successfulResults);

    await db
      .update(viralityDiagnosticJobs)
      .set({
        status: "completed",
        reelsAnalyzed: successfulResults.length,
        resultJson: { reels: successfulResults, diagnosis },
      })
      .where(eq(viralityDiagnosticJobs.id, jobId));
  } catch (err) {
    console.error(`[runViralityDiagnosticJob ${jobId}] failed:`, err);
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(viralityDiagnosticJobs)
        .set({
          status: "failed",
          errorMessage: message.slice(0, 2000),
        })
        .where(eq(viralityDiagnosticJobs.id, jobId));
    } catch (updateErr) {
      console.error(
        `[runViralityDiagnosticJob ${jobId}] failed to mark job failed:`,
        updateErr
      );
    }
  }
}
