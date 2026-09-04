import fs from "node:fs/promises";
import path from "node:path";
import { buildCoachPrompt, buildStudioDateContext, COACH_SYSTEM_PROMPT } from "@shared/studioHeit";
import { markCreatorIdeaGroundTruth } from "@shared/coachIdeaGroundTruth";
import { formatSelectedCoachStrategy } from "@shared/coachStrategy";
import {
  extractCoachCreatorConstraints,
  formatCoachCreatorConstraintsForPrompt,
  spokenScriptFromGenerated,
  validateCoachScriptConstraints,
} from "@shared/coachCreatorConstraints";
import { inferCoachScriptMode } from "@shared/coachScriptMode";
import { classifyCoachIdeaSpecificity } from "@shared/coachIdeaSpecificity";
import {
  COACH_SPECIFIC_REPEAT_FIXTURES,
  type CoachSpecificRepeatFixture,
} from "@shared/coachSpecificRepeatFixtures";
import {
  buildBlindCoachSpecificRepeatJudgePrompt,
  parseCoachSpecificRepeatJudgment,
  rotateSpecificRepeatAssignment,
  summarizeCoachSpecificRepeatBenchmark,
  type CoachSpecificRepeatBlindId,
  type CoachSpecificRepeatCaseResult,
  type CoachSpecificRepeatConstraintTrace,
  type CoachSpecificRepeatSample,
  type CoachSpecificRepeatSampleId,
} from "@shared/coachSpecificRepeatBenchmark";
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

async function generateWriterScript(
  fixture: CoachSpecificRepeatFixture,
  description: string,
  selectedStrategyBlock?: string
): Promise<{ script: ScriptPayload; constraints: CoachSpecificRepeatConstraintTrace }> {
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
    throw new Error(`Incomplete specific-repeat script for ${fixture.id}`);
  }

  const initial = validateCoachScriptConstraints(spokenScriptFromGenerated(parsed), constraints);
  const enforced = await enforceCoachScriptConstraints({
    generated: parsed,
    rawCreatorIdea: fixture.rawIdea,
    constraints,
  });
  const final = validateCoachScriptConstraints(spokenScriptFromGenerated(enforced.generated), constraints);
  const script: ScriptPayload = {
    title: stringField(enforced.generated.title),
    hook: stringField(enforced.generated.hook),
    explain: stringField(enforced.generated.explain),
    illustrate: stringField(enforced.generated.illustrate),
    teach: stringField(enforced.generated.teach),
    cta: stringField(enforced.generated.cta),
  };
  if (!script.hook || !script.explain || !script.illustrate || !script.teach) {
    throw new Error(`Incomplete specific-repeat script for ${fixture.id}`);
  }
  return {
    script,
    constraints: {
      initialViolations: initial.violations.map((item) => item.message),
      correctionCount: enforced.correctionCount,
      unresolvedViolations: final.violations.map((item) => item.message),
    },
  };
}

async function generateStrategySample(fixture: CoachSpecificRepeatFixture) {
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
    constraints: writer.constraints,
    ms: Date.now() - started,
    selectedStrategy: {
      selectedId: selection.selectedId,
      selectionReason: selection.selectionReason,
      developedAngle: selection.developedAngle,
      hookDirection: selection.hookDirection,
    },
  };
}

async function generateDirectSample(fixture: CoachSpecificRepeatFixture) {
  const groundTruthIdea = markCreatorIdeaGroundTruth(fixture.rawIdea);
  const started = Date.now();
  const writer = await generateWriterScript(fixture, groundTruthIdea);
  return {
    script: writer.script,
    constraints: writer.constraints,
    ms: Date.now() - started,
  };
}

async function judgeBlind(args: {
  fixture: CoachSpecificRepeatFixture;
  scripts: Record<CoachSpecificRepeatBlindId, ScriptPayload>;
}) {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a strict blind short-form content evaluator. Score all four candidates independently. Return valid JSON only."
        ),
      },
      {
        role: "user",
        content: buildBlindCoachSpecificRepeatJudgePrompt({
          rawIdea: args.fixture.rawIdea,
          niche: args.fixture.niche,
          targetAudience: args.fixture.targetAudience,
          candidateW: formatScriptForJudge(args.scripts.W),
          candidateX: formatScriptForJudge(args.scripts.X),
          candidateY: formatScriptForJudge(args.scripts.Y),
          candidateZ: formatScriptForJudge(args.scripts.Z),
        }),
      },
    ],
    temperature: 0,
    maxTokens: 2800,
    response_format: { type: "json_object" },
  });
  const raw = readTextContent(response.choices[0]?.message?.content);
  const parsed = parseLlmJson<Record<string, unknown> | null>(raw, null);
  const judgment = parseCoachSpecificRepeatJudgment(parsed);
  if (!judgment) throw new Error(`Invalid specific-repeat judge response for ${args.fixture.id}`);
  return judgment;
}

async function runFixture(fixture: CoachSpecificRepeatFixture, index: number) {
  const classifier = classifyCoachIdeaSpecificity(fixture.rawIdea);
  if (classifier.classification !== "highly_specific") {
    throw new Error(`${fixture.id} is ${classifier.classification}, not highly_specific`);
  }

  const strategyA = await generateStrategySample(fixture);
  const strategyB = await generateStrategySample(fixture);
  const directA = await generateDirectSample(fixture);
  const directB = await generateDirectSample(fixture);

  const assignment = rotateSpecificRepeatAssignment(index);
  const scripts: Record<CoachSpecificRepeatSampleId, ScriptPayload> = {
    strategy_a: strategyA.script,
    strategy_b: strategyB.script,
    direct_a: directA.script,
    direct_b: directB.script,
  };
  const judgment = await judgeBlind({
    fixture,
    scripts: {
      W: scripts[assignment.W],
      X: scripts[assignment.X],
      Y: scripts[assignment.Y],
      Z: scripts[assignment.Z],
    },
  });

  const generated = {
    strategy_a: strategyA,
    strategy_b: strategyB,
    direct_a: directA,
    direct_b: directB,
  } as const;

  const samples = {} as Record<CoachSpecificRepeatSampleId, CoachSpecificRepeatSample>;
  for (const sampleId of Object.keys(scripts) as CoachSpecificRepeatSampleId[]) {
    const blindId = (Object.entries(assignment).find(([, id]) => id === sampleId)?.[0] ??
      "W") as CoachSpecificRepeatBlindId;
    const judged = judgment.candidates[blindId];
    samples[sampleId] = {
      sampleId,
      path: sampleId.startsWith("strategy") ? "strategy" : "direct",
      scores: judged.scores,
      latencyMs: generated[sampleId].ms,
      constraints: generated[sampleId].constraints,
      judgeIntentViolations: judged.intentViolations,
      judgeInstructionViolations: judged.instructionViolations,
    };
  }

  const caseResult: CoachSpecificRepeatCaseResult = {
    caseId: fixture.id,
    tags: fixture.tags,
    assignment,
    judgment,
    samples,
  };

  return {
    ...caseResult,
    rawIdea: fixture.rawIdea,
    classifier,
    scripts,
    selectedStrategyA: strategyA.selectedStrategy,
    selectedStrategyB: strategyB.selectedStrategy,
  };
}

async function main() {
  const requestedLimit = Number(process.env.COACH_SPECIFIC_REPEAT_LIMIT ?? COACH_SPECIFIC_REPEAT_FIXTURES.length);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(COACH_SPECIFIC_REPEAT_FIXTURES.length, Math.floor(requestedLimit)))
    : COACH_SPECIFIC_REPEAT_FIXTURES.length;
  const fixtures = COACH_SPECIFIC_REPEAT_FIXTURES.slice(0, limit);

  console.log("[CoachSpecificRepeat] Experiment only. Production routing is unchanged.");
  console.log(`[CoachSpecificRepeat] Running ${fixtures.length} highly specific briefs x 2 strategy + 2 direct...`);
  const detailedResults = [];
  for (let index = 0; index < fixtures.length; index++) {
    const fixture = fixtures[index];
    console.log(`[CoachSpecificRepeat] ${index + 1}/${fixtures.length}: ${fixture.id}`);
    detailedResults.push(await runFixture(fixture, index));
  }

  const summary = summarizeCoachSpecificRepeatBenchmark(detailedResults);
  const report = {
    generatedAt: new Date().toISOString(),
    experimentOnly: true,
    productionRoutingChanged: false,
    architecture: {
      strategy: "raw specific brief -> 3 directions -> selector -> writer -> constraints",
      direct: "raw specific brief -> writer -> constraints",
      samplesPerArchitecture: 2,
    },
    summary,
    cases: detailedResults,
  };

  const outputDir = path.resolve(process.cwd(), "artifacts");
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `coach-specific-repeat-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const outputPath = path.join(outputDir, fileName);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\n[CoachSpecificRepeat] Summary");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[CoachSpecificRepeat] Report: ${outputPath}`);
}

main().catch((error) => {
  console.error("[CoachSpecificRepeat] Fatal error", error);
  process.exitCode = 1;
});
