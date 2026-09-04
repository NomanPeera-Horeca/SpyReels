import fs from "node:fs/promises";
import path from "node:path";
import { buildCoachPrompt, buildStudioDateContext, COACH_SYSTEM_PROMPT } from "@shared/studioHeit";
import { markCreatorIdeaGroundTruth } from "@shared/coachIdeaGroundTruth";
import { formatSelectedCoachStrategy } from "@shared/coachStrategy";
import {
  buildBlindCoachBenchmarkJudgePrompt,
  parseCoachBenchmarkJudgment,
  summarizeCoachBenchmark,
  type CoachBenchmarkCaseResult,
  type CoachBenchmarkCandidateId,
  type CoachBenchmarkSpecificity,
} from "@shared/coachStrategyBenchmark";
import { inferCoachScriptMode } from "@shared/coachScriptMode";
import { invokeLLM } from "./_core/llm";
import { developCoachStrategyDirections, selectCoachStrategy } from "./coachStrategyPlanner";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { normalizeCoachScriptPayload, parseLlmJson } from "./utils/parseLlmJson";

type BenchmarkFixture = {
  id: string;
  specificity: CoachBenchmarkSpecificity;
  rawIdea: string;
  niche: string;
  targetAudience: string;
  brandDescription?: string;
};

type ScriptPayload = {
  title: string;
  hook: string;
  explain: string;
  illustrate: string;
  teach: string;
  cta: string;
};

const FIXTURES: BenchmarkFixture[] = [
  {
    id: "vague-menu",
    specificity: "vague",
    rawIdea: "Give me a Reel about restaurant menus.",
    niche: "Restaurant growth and operations",
    targetAudience: "Independent restaurant owners",
  },
  {
    id: "vague-labor",
    specificity: "vague",
    rawIdea: "Make something about why restaurants struggle with labor.",
    niche: "Restaurant operations",
    targetAudience: "Restaurant owners and general managers",
  },
  {
    id: "vague-equipment",
    specificity: "vague",
    rawIdea: "I want a Reel about buying restaurant equipment.",
    niche: "Restaurant equipment and restaurant education",
    targetAudience: "New and growing restaurant owners",
  },
  {
    id: "vague-spyreels",
    specificity: "vague",
    rawIdea: "Make a Reel about SpyReels for creators.",
    niche: "Short-form content growth",
    targetAudience: "Creators and small business owners making Reels",
    brandDescription: "SpyReels helps creators study viral content patterns and make stronger short-form content.",
  },
  {
    id: "specific-prep-flow",
    specificity: "specific",
    rawIdea: "Make a 35-second talking-head Reel explaining why restaurant owners should measure prep flow before buying equipment. Do not talk about price or financing. End with one action: map the path from fridge to prep table to cook line.",
    niche: "Restaurant equipment and operations",
    targetAudience: "Independent restaurant owners opening or remodeling a kitchen",
  },
  {
    id: "specific-menu-consistency",
    specificity: "specific",
    rawIdea: "Make a contrarian Reel: a bigger menu can reduce kitchen consistency because each extra item adds prep and training complexity. Do not invent statistics. Give one takeaway, not a list of tips.",
    niche: "Restaurant growth and operations",
    targetAudience: "Independent restaurant owners",
  },
  {
    id: "specific-spyreels-story",
    specificity: "specific",
    rawIdea: "Tell the story of SpyReels as a tool that helps creators find useful patterns in viral Reels. Do not say 'copy competitors' and do not name SpyReels until the final sentence.",
    niche: "Short-form content growth",
    targetAudience: "Creators trying to improve Reel performance",
    brandDescription: "SpyReels is a creator research and content ideation product.",
  },
  {
    id: "specific-packaging-before-ads",
    specificity: "specific",
    rawIdea: "Explain why a delivery-focused restaurant should standardize packaging before spending more on ads. Do not claim this guarantees more sales. Focus on consistency after the order is placed, and end by telling the owner to test one full delivery order themselves.",
    niche: "Restaurant growth and operations",
    targetAudience: "Restaurant owners growing delivery sales",
  },
];

function readTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return content
    .map((part) => {
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function generateWriterScript(fixture: BenchmarkFixture, description: string): Promise<ScriptPayload> {
  const scriptMode = inferCoachScriptMode({ description: fixture.rawIdea });
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(`${COACH_SYSTEM_PROMPT}\n\n${buildStudioDateContext()}`),
      },
      {
        role: "user",
        content: buildCoachPrompt(
          description,
          fixture.niche,
          fixture.targetAudience,
          fixture.brandDescription,
          undefined,
          "",
          {
            explicitUserAngle: true,
            scriptMode,
            researchGroundingBlock: "",
          }
        ),
      },
    ],
    maxTokens: 4096,
    response_format: { type: "json_object" },
  });

  const raw = readTextContent(response.choices[0]?.message?.content);
  const parsed = normalizeCoachScriptPayload(parseLlmJson<Record<string, unknown>>(raw, {}));
  const script: ScriptPayload = {
    title: stringField(parsed.title),
    hook: stringField(parsed.hook),
    explain: stringField(parsed.explain),
    illustrate: stringField(parsed.illustrate),
    teach: stringField(parsed.teach),
    cta: stringField(parsed.cta),
  };

  if (!script.hook || !script.explain || !script.illustrate || !script.teach) {
    throw new Error(`Incomplete benchmark script for ${fixture.id}`);
  }
  return script;
}

function formatScriptForJudge(script: ScriptPayload): string {
  return [
    script.title ? `Title: ${script.title}` : "",
    `Hook: ${script.hook}`,
    `Explain: ${script.explain}`,
    `Illustrate: ${script.illustrate}`,
    `Teach: ${script.teach}`,
    script.cta ? `CTA: ${script.cta}` : "CTA: (none)",
  ]
    .filter(Boolean)
    .join("\n");
}

async function judgeBlind(args: {
  fixture: BenchmarkFixture;
  candidateX: ScriptPayload;
  candidateY: ScriptPayload;
}) {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a strict blind short-form content evaluator. Score both candidates independently. Return valid JSON only."
        ),
      },
      {
        role: "user",
        content: buildBlindCoachBenchmarkJudgePrompt({
          rawIdea: args.fixture.rawIdea,
          niche: args.fixture.niche,
          targetAudience: args.fixture.targetAudience,
          candidateX: formatScriptForJudge(args.candidateX),
          candidateY: formatScriptForJudge(args.candidateY),
        }),
      },
    ],
    temperature: 0,
    maxTokens: 1800,
    response_format: { type: "json_object" },
  });

  const raw = readTextContent(response.choices[0]?.message?.content);
  const parsed = parseLlmJson<Record<string, unknown> | null>(raw, null);
  const judgment = parseCoachBenchmarkJudgment(parsed);
  if (!judgment) throw new Error(`Invalid blind judge response for ${args.fixture.id}`);
  return judgment;
}

async function runFixture(fixture: BenchmarkFixture, index: number) {
  const groundTruthIdea = markCreatorIdeaGroundTruth(fixture.rawIdea);
  const directScript = await generateWriterScript(fixture, groundTruthIdea);

  const draft = await developCoachStrategyDirections({
    rawIdea: fixture.rawIdea,
    niche: fixture.niche,
    targetAudience: fixture.targetAudience,
    brandDescription: fixture.brandDescription,
  });
  const selection = await selectCoachStrategy({ rawIdea: fixture.rawIdea, draft });
  const strategyBlock = formatSelectedCoachStrategy(draft, selection);
  const strategyScript = await generateWriterScript(
    fixture,
    `${groundTruthIdea}\n\n${strategyBlock}`
  );

  // Alternate the hidden candidate position to reduce X/Y position bias.
  const strategyCandidate: CoachBenchmarkCandidateId = index % 2 === 0 ? "Y" : "X";
  const candidateX = strategyCandidate === "X" ? strategyScript : directScript;
  const candidateY = strategyCandidate === "Y" ? strategyScript : directScript;
  const judgment = await judgeBlind({ fixture, candidateX, candidateY });

  const caseResult: CoachBenchmarkCaseResult = {
    caseId: fixture.id,
    specificity: fixture.specificity,
    strategyCandidate,
    judgment,
  };

  return {
    ...caseResult,
    rawIdea: fixture.rawIdea,
    selectedStrategy: {
      selectedId: selection.selectedId,
      selectionReason: selection.selectionReason,
      developedAngle: selection.developedAngle,
      hookDirection: selection.hookDirection,
    },
    directScript,
    strategyScript,
  };
}

async function main() {
  const requestedLimit = Number(process.env.COACH_BENCH_LIMIT ?? FIXTURES.length);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(FIXTURES.length, Math.floor(requestedLimit)))
    : FIXTURES.length;
  const fixtures = FIXTURES.slice(0, limit);

  console.log(`[CoachBenchmark] Running ${fixtures.length} blind A/B cases...`);
  const detailedResults = [];
  for (let index = 0; index < fixtures.length; index++) {
    const fixture = fixtures[index];
    console.log(`[CoachBenchmark] ${index + 1}/${fixtures.length}: ${fixture.id}`);
    detailedResults.push(await runFixture(fixture, index));
  }

  const summary = summarizeCoachBenchmark(detailedResults);
  const report = {
    generatedAt: new Date().toISOString(),
    architecture: {
      direct: "ground-truth idea -> writer",
      strategy: "ground-truth idea -> 3 directions -> selector -> writer",
    },
    summary,
    cases: detailedResults,
  };

  const outputDir = path.resolve(process.cwd(), "artifacts");
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `coach-strategy-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const outputPath = path.join(outputDir, fileName);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\n[CoachBenchmark] Summary");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[CoachBenchmark] Report: ${outputPath}`);
  console.log(`[CoachBenchmark] RESULT: ${summary.passed ? "PASS" : "FAIL"}`);
  process.exitCode = summary.passed ? 0 : 1;
}

main().catch((error) => {
  console.error("[CoachBenchmark] Fatal error", error);
  process.exitCode = 1;
});
