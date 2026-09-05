/**
 * Local QA only. Not product code.
 * Baseline AUTO strategist selection for procedural How-To prompts
 * before any strategist guidance change.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateCarouselAngles } from "../server/carousel/generateCarouselAngles";

const PROMPTS = [
  {
    id: "A",
    prompt: "How to simplify a restaurant menu without hurting revenue",
  },
  {
    id: "B",
    prompt: "How to reduce food waste in a restaurant without adding more admin",
  },
  {
    id: "C",
    prompt: "How to improve table turnover without rushing guests",
  },
  {
    id: "D",
    prompt: "How to prepare a restaurant kitchen for a health inspection",
  },
] as const;

async function main() {
  const outDir = resolve("docs/qa/carousel-howto-roadmap-family-v1/strategist-baseline");
  mkdirSync(outDir, { recursive: true });
  const rows = [];

  for (const item of PROMPTS) {
    console.log(`[qa] ${item.id}: ${item.prompt}`);
    const started = Date.now();
    try {
      const result = await generateCarouselAngles({
        sourceContent: item.prompt,
        entryPoint: "qa.howtoRoadmapStrategistBaseline",
        requiredValidBriefs: 1,
      });
      const recommended = result.briefs[0] ?? null;
      const row = {
        id: item.id,
        prompt: item.prompt,
        recommendedFormat: result.formatRecommendation?.recommendedFormat ?? null,
        formatConfidence: result.formatRecommendation?.formatConfidence ?? null,
        candidates: result.briefs.map((brief) => ({
          title: brief.title,
          contentFormat: brief.contentFormat,
          layoutFamily: brief.layoutFamily,
          angleType: brief.angleType,
        })),
        finalSelectedFormat: recommended?.contentFormat ?? null,
        finalSelectedFamily: recommended?.layoutFamily ?? null,
        finalSelectedTitle: recommended?.title ?? null,
        durationMs: Date.now() - started,
        error: null as string | null,
      };
      rows.push(row);
      console.log(
        `[qa] ${item.id} recommendedFormat=${row.recommendedFormat ?? "none"} confidence=${
          row.formatConfidence ?? "n/a"
        } final=${row.finalSelectedFormat}/${row.finalSelectedFamily}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        id: item.id,
        prompt: item.prompt,
        recommendedFormat: null,
        formatConfidence: null,
        candidates: [],
        finalSelectedFormat: null,
        finalSelectedFamily: null,
        finalSelectedTitle: null,
        durationMs: Date.now() - started,
        error: message,
      });
      console.error(`[qa] ${item.id} failed: ${message}`);
    }
  }

  const outPath = resolve(outDir, "baseline.json");
  writeFileSync(
    outPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)}\n`
  );
  console.log(`[qa] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
