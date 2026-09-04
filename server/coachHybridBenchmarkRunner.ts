import fs from "node:fs/promises";
import path from "node:path";
import { buildCoachPrompt, buildStudioDateContext, COACH_SYSTEM_PROMPT } from "@shared/studioHeit";
import { markCreatorIdeaGroundTruth } from "@shared/coachIdeaGroundTruth";
import { formatSelectedCoachStrategy } from "@shared/coachStrategy";
import {
  extractCoachCreatorConstraints,
  formatCoachCreatorConstraintsForPrompt,
  validateCoachScriptConstraints,
  spokenScriptFromGenerated,
} from "@shared/coachCreatorConstraints";
import { inferCoachScriptMode } from "@shared/coachScriptMode";
import { classifyCoachIdeaSpecificity } from "@shared/coachIdeaSpecificity";
import {
  COACH_HYBRID_BENCHMARK_FIXTURES,
  type CoachHybridBenchmarkFixture,
} from "@shared/coachHybridBenchmarkFixtures";
import {
  buildBlindCoachHybridJudgePrompt,
  parseCoachHybridJudgment,
  rotateHybridAssignment,
  summarizeCoachHybridBenchmark,
  type CoachHybridBlindId,
  type CoachHybridCaseResult,
  type CoachHybridPathId,
} from "@shared/coachHybridBenchmark";
import { invokeLLM } from "./_core/llm";
import { enforceCoachScriptConstraints } from "./coachConstraintCorrection";
import { developCoachStrategyDirections, selectCoachStrategy } from "./coachStrategyPlanner";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { normalizeCoachScriptPayload, parseLlmJson } from "./utils/parseLlmJson";

type ScriptPayload = {
  title: string;
  hook: string;
  explain: string;
  illustrate: string;
  teach: string;
  cta: string;
};

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

async function generateWriterScript(
  fixture: CoachHybridBenchmarkFixture,
  description: string,
  selectedStrategyBlock?: string
): Promise<{ script: ScriptPayload; correctionCount: number }> {
  const scriptMode = inferCoachScriptMode({ description: fixture.rawIdea });
  const constraints = extractCoachCreatorConstraints(fixture.rawIdea);
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
            rawCreatorIdea: fixture.rawIdea,
            selectedStrategyBlock,
            creatorConstraintsBlock: formatCoachCreatorConstraintsForPrompt(constraints),
          }
        ),
      },
    ],
    maxTokens: 4096,
    response_format: { type: "json_object" },
  });

  const raw = readTextContent(response.choices[0]?.message?.content);
  const parsed = normalizeCoachScriptPayload(parseLlmJson<Record<string, unknown>>(raw, {}));
  if (!stringField(parsed.hook) || !stringField(parsed.explain) || !stringField(parsed.illustrate) || !stringField(parsed.teach)) {
    throw new Error(`Incomplete hybrid benchmark script for ${fixture.id}`);
  }

  const enforced = await enforceCoachScriptConstraints({
    generated: parsed,
    rawCreatorIdea: fixture.rawIdea,
    constraints,
  });
  const script: ScriptPayload = {
    title: stringField(enforced.generated.title),
    hook: stringField(enforced.generated.hook),
    explain: stringField(enforced.generated.explain),
    illustrate: stringField(enforced.generated.illustrate),
    teach: stringField(enforced.generated.teach),
    cta: stringField(enforced.generated.cta),
  };

  if (!script.hook || !script.explain || !script.illustrate || !script.teach) {
    throw new Error(`Incomplete hybrid benchmark script for ${fixture.id}`);
  }
  return { script, correctionCount: enforced.correctionCount };
}

async function generateStrategyPath(fixture: CoachHybridBenchmarkFixture) {
  const groundTruthIdea = markCreatorIdeaGroundTruth(fixture.rawIdea);
  const started = Date.now();
  const draft = await developCoachStrategyDirections({
    rawIdea: fixture.rawIdea,
    niche: fixture.niche,
    targetAudience: fixture.targetAudience,
    brandDescription: fixture.brandDescription,
  });
  const selection = await selectCoachStrategy({ rawIdea: fixture.rawIdea, draft });
  const strategyBlock = formatSelectedCoachStrategy(draft, selection);
  const writer = await generateWriterScript(fixture, groundTruthIdea, strategyBlock);
  return {
    script: writer.script,
    correctionCount: writer.correctionCount,
    ms: Date.now() - started,
    selectedStrategy: {
      selectedId: selection.selectedId,
      selectionReason: selection.selectionReason,
      developedAngle: selection.developedAngle,
      hookDirection: selection.hookDirection,
    },
  };
}

async function generateDirectPath(fixture: CoachHybridBenchmarkFixture) {
  const groundTruthIdea = markCreatorIdeaGroundTruth(fixture.rawIdea);
  const started = Date.now();
  const writer = await generateWriterScript(fixture, groundTruthIdea);
  return {
    script: writer.script,
    correctionCount: writer.correctionCount,
    ms: Date.now() - started,
  };
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

function localViolations(fixture: CoachHybridBenchmarkFixture, script: ScriptPayload): string[] {
  const constraints = extractCoachCreatorConstraints(fixture.rawIdea);
  return validateCoachScriptConstraints(spokenScriptFromGenerated(script), constraints).violations.map(
    (item) => item.message
  );
}

async function judgeBlind(args: {
  fixture: CoachHybridBenchmarkFixture;
  candidateX: ScriptPayload;
  candidateY: ScriptPayload;
  candidateZ: ScriptPayload;
}) {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a strict blind short-form content evaluator. Score all three candidates independently. Return valid JSON only."
        ),
      },
      {
        role: "user",
        content: buildBlindCoachHybridJudgePrompt({
          rawIdea: args.fixture.rawIdea,
          niche: args.fixture.niche,
          targetAudience: args.fixture.targetAudience,
          goldSpecificity: args.fixture.goldSpecificity,
          candidateX: formatScriptForJudge(args.candidateX),
          candidateY: formatScriptForJudge(args.candidateY),
          candidateZ: formatScriptForJudge(args.candidateZ),
        }),
      },
    ],
    temperature: 0,
    maxTokens: 2200,
    response_format: { type: "json_object" },
  });

  const raw = readTextContent(response.choices[0]?.message?.content);
  const parsed = parseLlmJson<Record<string, unknown> | null>(raw, null);
  const judgment = parseCoachHybridJudgment(parsed);
  if (!judgment) throw new Error(`Invalid hybrid blind judge response for ${args.fixture.id}`);
  return judgment;
}

async function runFixture(fixture: CoachHybridBenchmarkFixture, index: number) {
  const classifier = classifyCoachIdeaSpecificity(fixture.rawIdea);
  const hybridSkippedStrategy = classifier.classification === "highly_specific";

  const oldDirect = await generateDirectPath(fixture);
  const currentNew = await generateStrategyPath(fixture);
  const hybrid = hybridSkippedStrategy ? await generateDirectPath(fixture) : await generateStrategyPath(fixture);

  const assignment = rotateHybridAssignment(index);
  const scripts: Record<CoachHybridPathId, ScriptPayload> = {
    old_direct: oldDirect.script,
    current_new: currentNew.script,
    hybrid: hybrid.script,
  };
  const byBlind = {
    X: scripts[assignment.X],
    Y: scripts[assignment.Y],
    Z: scripts[assignment.Z],
  };
  const judgment = await judgeBlind({
    fixture,
    candidateX: byBlind.X,
    candidateY: byBlind.Y,
    candidateZ: byBlind.Z,
  });

  const caseResult: CoachHybridCaseResult = {
    caseId: fixture.id,
    goldSpecificity: fixture.goldSpecificity,
    classifier,
    hybridSkippedStrategy,
    assignment,
    judgment,
    constraintViolations: {
      old_direct: localViolations(fixture, oldDirect.script),
      current_new: localViolations(fixture, currentNew.script),
      hybrid: localViolations(fixture, hybrid.script),
    },
    latencyMs: {
      old_direct: oldDirect.ms,
      current_new: currentNew.ms,
      hybrid: hybrid.ms,
    },
  };

  return {
    ...caseResult,
    rawIdea: fixture.rawIdea,
    selectedStrategyNew: currentNew.selectedStrategy,
    selectedStrategyHybrid: "selectedStrategy" in hybrid ? hybrid.selectedStrategy : null,
    scripts,
    correctionCounts: {
      old_direct: oldDirect.correctionCount,
      current_new: currentNew.correctionCount,
      hybrid: hybrid.correctionCount,
    },
  };
}

async function main() {
  const requestedLimit = Number(process.env.COACH_HYBRID_BENCH_LIMIT ?? COACH_HYBRID_BENCHMARK_FIXTURES.length);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(COACH_HYBRID_BENCHMARK_FIXTURES.length, Math.floor(requestedLimit)))
    : COACH_HYBRID_BENCHMARK_FIXTURES.length;
  const fixtures = COACH_HYBRID_BENCHMARK_FIXTURES.slice(0, limit);

  console.log(`[CoachHybridBenchmark] Experiment only. Production routing is unchanged.`);
  console.log(`[CoachHybridBenchmark] Running ${fixtures.length} blind 3-path cases...`);
  const detailedResults = [];
  for (let index = 0; index < fixtures.length; index++) {
    const fixture = fixtures[index];
    console.log(`[CoachHybridBenchmark] ${index + 1}/${fixtures.length}: ${fixture.id}`);
    detailedResults.push(await runFixture(fixture, index));
  }

  const summary = summarizeCoachHybridBenchmark(detailedResults);
  const report = {
    generatedAt: new Date().toISOString(),
    experimentOnly: true,
    productionRoutingChanged: false,
    architecture: {
      old_direct: "raw idea -> writer",
      current_new: "raw idea -> 3 directions -> selector -> writer",
      hybrid: "highly_specific -> writer; otherwise 3 directions -> selector -> writer",
    },
    summary,
    cases: detailedResults,
  };

  const outputDir = path.resolve(process.cwd(), "artifacts");
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `coach-hybrid-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const outputPath = path.join(outputDir, fileName);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\n[CoachHybridBenchmark] Summary");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[CoachHybridBenchmark] Report: ${outputPath}`);
}

main().catch((error) => {
  console.error("[CoachHybridBenchmark] Fatal error", error);
  process.exitCode = 1;
});
