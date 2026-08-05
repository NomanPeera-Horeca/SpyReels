/**
 * One-off Phase 3 dry-run: sample talking-head transcript → insertion points.
 * Usage: pnpm exec tsx scripts/dry-run-video-broll-analysis.ts
 * Does not require a video upload. Needs ANTHROPIC_API_KEY.
 * Pexels matching runs when PEXELS_API_KEY is set.
 */

import "dotenv/config";
import { analyzeInsertionPoints } from "../server/videoBroll/analyzeInsertionPoints";
import { matchPexelsForInsertions } from "../server/videoBroll/matchPexelsForInsertions";
import type { VideoBrollTranscriptSegment } from "../shared/videoBroll";

/** ~90s talking-head sample with topic shifts and visual nouns. */
const SAMPLE_SEGMENTS: VideoBrollTranscriptSegment[] = [
  { start: 0, end: 4.2, text: "Most creators waste hours staring at a blank screen every Monday." },
  { start: 4.5, end: 9.1, text: "I used to do the same until I built a simple three step content system." },
  { start: 9.4, end: 14.8, text: "Step one is batching ideas while you drink your morning coffee." },
  { start: 15.1, end: 21.0, text: "Open a notes app, set a ten minute timer, and list every question your audience asks." },
  { start: 21.3, end: 27.5, text: "Step two is turning those questions into hooks on a whiteboard before you film." },
  { start: 27.8, end: 34.2, text: "Write the first line big, then film three takes in natural window light." },
  { start: 34.5, end: 41.0, text: "Step three is editing on your laptop with jump cuts to hide the pauses." },
  { start: 41.3, end: 48.5, text: "Add B-roll of your desk, your coffee mug, and scrolling through Instagram analytics." },
  { start: 48.8, end: 55.2, text: "When the hook is strong, the algorithm pushes you into more Explore page traffic." },
  { start: 55.5, end: 62.0, text: "I grew from two thousand to forty thousand followers in ninety days with this routine." },
  { start: 62.3, end: 69.5, text: "The secret is consistency, not complicated gear or a fancy studio setup." },
  { start: 69.8, end: 76.0, text: "Phone on a tripod, quiet room, and a checklist taped next to your monitor." },
  { start: 76.3, end: 84.0, text: "If you want the exact checklist I use, comment system and I will send it over." },
  { start: 84.3, end: 90.0, text: "Now go batch your next week of Reels before the coffee gets cold." },
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY missing");
    process.exit(1);
  }

  console.log("Running analyzeInsertionPoints on sample transcript...");
  const llmPoints = await analyzeInsertionPoints({
    segments: SAMPLE_SEGMENTS,
    durationSeconds: 90,
  });
  console.log(`LLM returned ${llmPoints.length} insertion points`);

  const hasPexels = Boolean(process.env.PEXELS_API_KEY);
  console.log(`PEXELS_API_KEY present: ${hasPexels}`);

  const insertionPoints = hasPexels
    ? await matchPexelsForInsertions(llmPoints)
    : llmPoints.map((p) => ({
        ...p,
        pexelsClipUrl: null,
        pexelsClipId: null,
      }));

  console.log(JSON.stringify(insertionPoints, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
