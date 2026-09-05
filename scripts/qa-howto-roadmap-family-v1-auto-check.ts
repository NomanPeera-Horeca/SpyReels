/**
 * Local QA only. Post-guidance AUTO check. Does not change strategist rules.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateCarouselAngles } from "../server/carousel/generateCarouselAngles";
import { planGenerateFromInput } from "../server/carousel/studioOrchestration";

const HOWTO_PROMPTS = [
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

const SAFETY_PROMPTS = [
  {
    id: "story",
    expect: "story",
    prompt: "Why I switched from Android to iPhone after 10 years",
  },
  {
    id: "breakdown",
    expect: "breakdown",
    prompt: "5 reasons Android is better than iPhone",
  },
  {
    id: "framework",
    expect: "framework",
    prompt: "The framework I use to decide repair or replace",
  },
  {
    id: "comparison",
    expect: "comparison",
    prompt: "Android vs iPhone: which is better for creators?",
  },
] as const;

async function runAuto(prompt: string) {
  const result = await generateCarouselAngles({
    sourceContent: prompt,
    entryPoint: "qa.howtoRoadmapAutoCheck",
    requiredValidBriefs: 1,
  });
  const plan = planGenerateFromInput(
    result.briefs,
    result.formatRecommendation,
    prompt
  );
  const selected = plan.selected;
  return {
    recommendedFormat: result.formatRecommendation?.recommendedFormat ?? null,
    formatConfidence: result.formatRecommendation?.formatConfidence ?? null,
    candidates: result.briefs.map((brief) => ({
      title: brief.title,
      contentFormat: brief.contentFormat,
      layoutFamily: brief.layoutFamily,
      angleType: brief.angleType,
      overall: brief.scores?.overall ?? null,
    })),
    finalSelectedFormat:
      selected && "contentFormat" in selected ? selected.contentFormat : null,
    finalSelectedFamily:
      selected && "layoutFamily" in selected ? selected.layoutFamily : null,
    finalSelectedTitle: selected?.title ?? null,
  };
}

async function main() {
  const outDir = resolve(
    "docs/qa/carousel-howto-roadmap-family-v1/auto-check"
  );
  mkdirSync(outDir, { recursive: true });
  const howto = [];
  for (const item of HOWTO_PROMPTS) {
    for (const run of [1, 2] as const) {
      console.log(`[qa] ${item.id} run ${run}: ${item.prompt}`);
      const started = Date.now();
      try {
        const row = {
          id: item.id,
          run,
          prompt: item.prompt,
          ...(await runAuto(item.prompt)),
          durationMs: Date.now() - started,
          error: null as string | null,
        };
        howto.push(row);
        console.log(
          `[qa] ${item.id}.${run} recommended=${row.recommendedFormat ?? "none"} confidence=${
            row.formatConfidence ?? "n/a"
          } final=${row.finalSelectedFormat}/${row.finalSelectedFamily} title=${row.finalSelectedTitle}`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        howto.push({
          id: item.id,
          run,
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
        console.error(`[qa] ${item.id}.${run} failed: ${message}`);
      }
    }
  }

  const safety = [];
  for (const item of SAFETY_PROMPTS) {
    console.log(`[qa] safety ${item.id}: ${item.prompt}`);
    const started = Date.now();
    try {
      const row = {
        id: item.id,
        expect: item.expect,
        prompt: item.prompt,
        ...(await runAuto(item.prompt)),
        durationMs: Date.now() - started,
        error: null as string | null,
      };
      safety.push(row);
      console.log(
        `[qa] safety ${item.id} expected=${item.expect} final=${row.finalSelectedFormat}/${row.finalSelectedFamily}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      safety.push({
        id: item.id,
        expect: item.expect,
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
      console.error(`[qa] safety ${item.id} failed: ${message}`);
    }
  }

  const outPath = resolve(outDir, "auto-check.json");
  writeFileSync(
    outPath,
    `${JSON.stringify(
      { generatedAt: new Date().toISOString(), howto, safety },
      null,
      2
    )}\n`
  );
  console.log(`[qa] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
