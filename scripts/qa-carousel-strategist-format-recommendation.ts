/**
 * Local QA only. Not product code.
 * Runs generateCarouselAngles on the AUTO path (requiredValidBriefs: 1)
 * and records the strategist recommendation plus the final auto pick.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateCarouselAngles } from "../server/carousel/generateCarouselAngles";

const PROMPTS: Array<{
  id: string;
  bucket: "comparison" | "story" | "breakdown" | "framework" | "ambiguous" | "adversarial";
  prompt: string;
}> = [
  {
    id: "cmp-cheap-equipment",
    bucket: "comparison",
    prompt: "Cheap restaurant equipment vs buying the right equipment the first time",
  },
  {
    id: "cmp-large-menu",
    bucket: "comparison",
    prompt: "Large restaurant menu vs focused restaurant menu",
  },
  {
    id: "cmp-repair-replace",
    bucket: "comparison",
    prompt: "Repair vs replace restaurant equipment",
  },
  {
    id: "cmp-delivery",
    bucket: "comparison",
    prompt: "In-house delivery vs third-party delivery",
  },
  {
    id: "cmp-discounting",
    bucket: "comparison",
    prompt: "Discounting vs adding value",
  },
  {
    id: "cmp-frozen-fresh",
    bucket: "comparison",
    prompt: "Frozen food vs fresh prep for margins",
  },
  {
    id: "story-stopped-cheap",
    bucket: "story",
    prompt: "Why I stopped buying the cheapest restaurant equipment",
  },
  {
    id: "story-nearly-shut-down",
    bucket: "story",
    prompt: "The mistake that nearly shut down my restaurant",
  },
  {
    id: "story-menu-change",
    bucket: "story",
    prompt: "How one menu change saved our kitchen",
  },
  {
    id: "story-cut-menu",
    bucket: "story",
    prompt: "What happened after we cut 30% of the menu",
  },
  {
    id: "brk-equipment-mistakes",
    bucket: "breakdown",
    prompt: "5 restaurant equipment mistakes",
  },
  {
    id: "brk-pricing-mistakes",
    bucket: "breakdown",
    prompt: "7 menu pricing mistakes",
  },
  {
    id: "brk-walk-in-signs",
    bucket: "breakdown",
    prompt: "4 signs your walk-in is failing",
  },
  {
    id: "brk-labor-ways",
    bucket: "breakdown",
    prompt: "6 ways restaurants lose money on labor",
  },
  {
    id: "fw-add-menu-item",
    bucket: "framework",
    prompt: "A 4-part framework for deciding whether to add a menu item",
  },
  {
    id: "fw-repair-or-replace",
    bucket: "framework",
    prompt: "The framework I use to decide repair or replace",
  },
  {
    id: "fw-expansion",
    bucket: "framework",
    prompt: "A simple restaurant expansion decision framework",
  },
  {
    id: "amb-replace-fryer",
    bucket: "ambiguous",
    prompt: "Should I replace my fryer?",
  },
  {
    id: "amb-simplify-menu",
    bucket: "ambiguous",
    prompt: "How to simplify a restaurant menu",
  },
  {
    id: "amb-food-cost",
    bucket: "ambiguous",
    prompt: "The best way to reduce food cost",
  },
  {
    id: "adv-switched-android",
    bucket: "adversarial",
    prompt: "Why I switched from Android to iPhone after 10 years",
  },
  {
    id: "adv-android-vs-iphone",
    bucket: "adversarial",
    prompt: "Android vs iPhone: which is better for creators?",
  },
  {
    id: "adv-five-reasons",
    bucket: "adversarial",
    prompt: "5 reasons Android is better than iPhone",
  },
  {
    id: "adv-framework-repair",
    bucket: "adversarial",
    prompt: "The framework I use to decide repair vs replace",
  },
];

async function main() {
  const outDir = resolve(
    "docs/qa/carousel-strategist-format-recommendation-v2"
  );
  mkdirSync(outDir, { recursive: true });
  const rows = [];

  for (const item of PROMPTS) {
    console.log(`[qa] ${item.id}: ${item.prompt}`);
    const started = Date.now();
    try {
      const result = await generateCarouselAngles({
        sourceContent: item.prompt,
        entryPoint: "qa.strategistFormatRecommendation",
        requiredValidBriefs: 1,
      });
      const recommended = result.briefs[0] ?? null;
      const row = {
        id: item.id,
        bucket: item.bucket,
        prompt: item.prompt,
        recommendedFormat: result.formatRecommendation?.recommendedFormat ?? null,
        formatConfidence: result.formatRecommendation?.formatConfidence ?? null,
        candidates: result.briefs.map((brief) => ({
          title: brief.title,
          contentFormat: brief.contentFormat,
          layoutFamily: brief.layoutFamily,
          scores: brief.scores,
        })),
        finalRecommendedFormat: recommended?.contentFormat ?? null,
        finalRecommendedTitle: recommended?.title ?? null,
        durationMs: Date.now() - started,
        error: null as string | null,
      };
      rows.push(row);
      console.log(
        `[qa] ${item.id} -> ${row.recommendedFormat ?? "none"} @ ${
          row.formatConfidence ?? "n/a"
        } final=${row.finalRecommendedFormat}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        id: item.id,
        bucket: item.bucket,
        prompt: item.prompt,
        recommendedFormat: null,
        formatConfidence: null,
        candidates: [],
        finalRecommendedFormat: null,
        finalRecommendedTitle: null,
        durationMs: Date.now() - started,
        error: message,
      });
      console.error(`[qa] ${item.id} failed: ${message}`);
    }
  }

  const outPath = resolve(outDir, "benchmark.json");
  writeFileSync(outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
  console.log(`[qa] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
