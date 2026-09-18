import fs from "node:fs/promises";
import path from "node:path";
import { searchReelsByHandle } from "../server/instagram";
import { transcribeReel } from "../server/services/transcribeReel";
import {
  fetchAudienceSignalsFromWeb,
} from "../server/audienceResearch/fetchSignals";
import { formatAudienceSignalsForPrompt } from "../shared/audienceResearch";
import {
  buildRecreateDefaultTopicPrompt,
  buildRecreateTopicPrompt,
} from "../shared/recreateAnglePrompt";
import {
  formatResearchGroundingForPrompt,
  getResearchGrounding,
} from "../server/studioResearchGrounding";
import { analyzeRemakeStructure } from "../server/recreate/remakeStructure";
import { generateRemakeContent } from "../server/recreate/generateRemakeContent";
import { invokeLLM } from "../server/_core/llm";
import { withAiFormattingRules } from "../server/utils/aiFormattingRules";

type Mode = "same_topic" | "niche" | "custom";

type SourceCreator = {
  handle: string;
  sourceNiche: string;
};

type TargetProfile = {
  id: string;
  nicheSlug: string;
  niche: string;
  targetAudience: string;
  brandDescription: string;
  customAngle: string;
};

type PreparedReel = {
  handle: string;
  sourceNiche: string;
  shortcode: string;
  reelUrl: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number;
  postedAt: string;
  transcript: string;
  transcribeMs: number;
};

type JudgeResult = {
  intentObedience: number;
  hookStrength: number;
  structureFidelity: number;
  originality: number;
  spokenNaturalness: number;
  factualSafety: "pass" | "fail";
  hallucination: boolean;
  copiedTooClosely: boolean;
  verdict: "pass" | "revise" | "fail";
  automaticFailReasons: string[];
  notes: string;
};

type BenchmarkCaseResult = {
  caseId: string;
  creator: string;
  sourceNiche: string;
  shortcode: string;
  reelUrl: string;
  sourceViews: number;
  sourceDurationSec: number;
  mode: Mode;
  targetProfile: string;
  instruction: string;
  generatedScript?: string;
  structure?: Record<string, unknown>;
  readability?: Record<string, unknown>;
  factIntegrity?: {
    repaired: boolean;
    initialRiskCount: number;
  };
  researchSourceCount?: number;
  structureCacheHit?: boolean;
  transcribeMs: number;
  generationMs?: number;
  totalColdMs?: number;
  longestCopiedRunWords?: number;
  judge?: JudgeResult;
  passed: boolean;
  failureReason?: string;
};

const OUTPUT_PATH = path.join(
  process.cwd(),
  "artifacts",
  "remake-hardening-live-benchmark.json"
);

const SOURCE_CREATORS: SourceCreator[] = [
  { handle: "the_30_rule", sourceNiche: "Restaurants & Cafes" },
  { handle: "garyvee", sourceNiche: "Entrepreneurship & Marketing" },
  { handle: "alexhormozi", sourceNiche: "Business & Sales" },
  { handle: "ryanserhant", sourceNiche: "Real Estate" },
  { handle: "neilpatel", sourceNiche: "Digital Marketing" },
  { handle: "athleanx", sourceNiche: "Fitness" },
  { handle: "aliabdaal", sourceNiche: "Productivity & Education" },
  { handle: "ramit", sourceNiche: "Personal Finance" },
  { handle: "codie_sanchez", sourceNiche: "Entrepreneurship" },
  { handle: "sahilbloom", sourceNiche: "Personal Development & Business" },
  { handle: "simonsinek", sourceNiche: "Leadership" },
  { handle: "melrobbins", sourceNiche: "Personal Development" },
  { handle: "jayclouse", sourceNiche: "Creator Business" },
];

const TARGET_PROFILES: TargetProfile[] = [
  {
    id: "restaurant-operator",
    nicheSlug: "restaurants-cafes",
    niche: "Restaurants & Cafes",
    targetAudience: "restaurant owners and operators",
    brandDescription:
      "Practical education that helps restaurant owners improve margins, operations, menu strategy and growth.",
    customAngle:
      "why menu engineering is a profit system, not just a menu design exercise",
  },
  {
    id: "fitness-coach",
    nicheSlug: "fitness",
    niche: "Fitness",
    targetAudience: "busy adults who want sustainable strength and better health",
    brandDescription:
      "Evidence-aware fitness education focused on simple training systems and sustainable habits.",
    customAngle:
      "why progressive overload matters more than constantly changing your workouts",
  },
  {
    id: "real-estate-educator",
    nicheSlug: "real-estate",
    niche: "Real Estate",
    targetAudience: "home sellers and newer real estate agents",
    brandDescription:
      "Practical real estate education about pricing, listings, lead generation and client trust.",
    customAngle:
      "why pricing strategy matters more than expensive listing photos when a home is positioned badly",
  },
  {
    id: "small-business-marketer",
    nicheSlug: "marketing",
    niche: "Marketing",
    targetAudience: "small business owners who need predictable customer acquisition",
    brandDescription:
      "No-fluff marketing education about acquisition, retention, offers and customer economics.",
    customAngle:
      "why improving customer retention can be more valuable than constantly chasing more leads",
  },
  {
    id: "personal-finance-educator",
    nicheSlug: "finance",
    niche: "Personal Finance",
    targetAudience: "young professionals trying to build better money habits",
    brandDescription:
      "Practical personal-finance education focused on systems, automation and long-term behavior.",
    customAngle:
      "why automatic saving systems usually beat relying on motivation every month",
  },
];

const MODE_ORDER: Mode[] = ["same_topic", "niche", "custom"];
const MIN_SCORE = 7;
const MIN_INTENT_SCORE = 8;
const MIN_AVERAGE = 7.5;
const TARGET_CASES = 30;
const MAX_TRANSCRIPTION_ATTEMPTS = 42;
const WARM_CASES_PER_MODE = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function normalizedWords(value: string): string[] {
  return (
    value
      .toLowerCase()
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
  );
}

function longestCommonWordRun(a: string, b: string): number {
  const x = normalizedWords(a);
  const y = normalizedWords(b);
  if (!x.length || !y.length) return 0;

  const previous = new Uint16Array(y.length + 1);
  let best = 0;
  for (let i = 1; i <= x.length; i++) {
    const current = new Uint16Array(y.length + 1);
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous.set(current);
  }
  return best;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function writeReport(report: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function judgeRemake(args: {
  mode: Mode;
  instruction: string;
  sourceTranscript: string;
  sourceCaption: string;
  sourceStructure: Record<string, unknown>;
  researchGrounding: string;
  generatedScript: string;
  longestCopiedRunWords: number;
}): Promise<JudgeResult> {
  const allowedFactSources =
    args.mode === "same_topic"
      ? `SOURCE TRANSCRIPT/CAPTION + VERIFIED RESEARCH`
      : `VERIFIED RESEARCH + CREATOR INSTRUCTION ONLY. The source transcript is NOT factual support for the new topic.`;

  const response = await invokeLLM({
    model: "claude-sonnet-4-6",
    temperature: 0,
    maxTokens: 1400,
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are an independent senior short-form creative quality judge. Be strict. Hallucinated factual specificity is an automatic failure. Return JSON only."
        ),
      },
      {
        role: "user",
        content: `Evaluate this SpyReels remake.

MODE: ${args.mode}
USER DIRECTION:
<<<${args.instruction}>>>

SOURCE CAPTION:
<<<${args.sourceCaption}>>>

SOURCE TRANSCRIPT:
<<<${args.sourceTranscript}>>>

SOURCE VIRAL STRUCTURE:
${JSON.stringify(args.sourceStructure, null, 2)}

VERIFIED RESEARCH:
<<<${args.researchGrounding || "(none)"}>>>

FACTUAL GROUNDING RULE:
${allowedFactSources}

GENERATED REMAKE:
<<<${args.generatedScript}>>>

DETERMINISTIC LONGEST VERBATIM WORD RUN VS SOURCE: ${args.longestCopiedRunWords}

Judge:
- intentObedience: Does it obey the requested mode and explicit topic/profile direction?
- hookStrength: Is the opening scroll-stopping and natural?
- structureFidelity: Does it transfer the source mechanics without blindly copying?
- originality: Is it genuinely new rather than synonym-swapped?
- spokenNaturalness: Would a creator comfortably say this on camera?
- factualSafety: FAIL if any real person/company/restaurant/date/number/quote/study/performance claim is unsupported by the allowed grounding.
- hallucination: true for any unsupported real-world factual specificity, including an invented founder/customer story presented as true.
- copiedTooClosely: true if distinctive source language is substantially copied, especially long verbatim runs.
- verdict: pass only when the draft is publishable with minor/no edits.

Return strict JSON.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "remake_quality_judge",
        strict: true,
        schema: {
          type: "object",
          properties: {
            intentObedience: { type: "number" },
            hookStrength: { type: "number" },
            structureFidelity: { type: "number" },
            originality: { type: "number" },
            spokenNaturalness: { type: "number" },
            factualSafety: { type: "string", enum: ["pass", "fail"] },
            hallucination: { type: "boolean" },
            copiedTooClosely: { type: "boolean" },
            verdict: { type: "string", enum: ["pass", "revise", "fail"] },
            automaticFailReasons: {
              type: "array",
              items: { type: "string" },
            },
            notes: { type: "string" },
          },
          required: [
            "intentObedience",
            "hookStrength",
            "structureFidelity",
            "originality",
            "spokenNaturalness",
            "factualSafety",
            "hallucination",
            "copiedTooClosely",
            "verdict",
            "automaticFailReasons",
            "notes",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  return JSON.parse(String(response.choices[0]?.message?.content ?? "{}")) as JudgeResult;
}

const audienceCache = new Map<string, string>();

async function audienceBlock(profile: TargetProfile): Promise<string> {
  const hit = audienceCache.get(profile.id);
  if (hit !== undefined) return hit;

  const signals = await fetchAudienceSignalsFromWeb({
    nicheSlug: profile.nicheSlug,
    nicheLabel: profile.niche,
    targetAudience: profile.targetAudience,
  });
  const block = formatAudienceSignalsForPrompt(signals.slice(0, 5));
  audienceCache.set(profile.id, block);
  return block;
}

async function buildModeContext(args: {
  mode: Mode;
  profile: TargetProfile;
  source: PreparedReel;
}): Promise<{
  instruction: string;
  topic: string;
  researchIdea: string;
  researchNiche: string;
  trustedProfileTexts: string[];
}> {
  if (args.mode === "same_topic") {
    return {
      instruction: "Keep the same topic, but make the script fresh and original.",
      topic: "SAME_TOPIC",
      researchIdea:
        args.source.caption.trim() || args.source.transcript.slice(0, 350),
      researchNiche: args.source.sourceNiche,
      trustedProfileTexts: [],
    };
  }

  if (args.mode === "custom") {
    const instruction = `Use the source Reel's viral structure, but make the new Reel about: ${args.profile.customAngle}`;
    return {
      instruction,
      topic: buildRecreateTopicPrompt({
        angle: args.profile.customAngle,
        targetAudience: args.profile.targetAudience,
        businessDescription: args.profile.brandDescription,
      }),
      researchIdea: args.profile.customAngle,
      researchNiche: args.profile.niche,
      trustedProfileTexts: [
        args.profile.customAngle,
        args.profile.targetAudience,
        args.profile.brandDescription,
      ],
    };
  }

  const research = await audienceBlock(args.profile);
  return {
    instruction: `Adapt this Reel to my ${args.profile.niche} niche and my audience: ${args.profile.targetAudience}.`,
    topic: buildRecreateDefaultTopicPrompt({
      niche: args.profile.niche,
      targetAudience: args.profile.targetAudience,
      businessDescription: args.profile.brandDescription,
      audienceResearchBlock: research,
    }),
    researchIdea: [
      args.profile.niche,
      args.profile.targetAudience,
      research.slice(0, 1000),
    ].join(" | "),
    researchNiche: args.profile.niche,
    trustedProfileTexts: [
      args.profile.targetAudience,
      args.profile.brandDescription,
      research,
    ],
  };
}

async function prepareSources(): Promise<PreparedReel[]> {
  const prepared: PreparedReel[] = [];
  const seen = new Set<string>();
  let transcriptionAttempts = 0;

  for (const creator of SOURCE_CREATORS) {
    if (prepared.length >= TARGET_CASES) break;

    let search;
    try {
      search = await searchReelsByHandle(creator.handle, 5);
    } catch (error) {
      console.warn(
        `[RemakeBenchmark] creator lookup failed @${creator.handle}`,
        error instanceof Error ? error.message : String(error)
      );
      continue;
    }

    let acceptedForCreator = 0;
    for (const reel of search.reels) {
      if (acceptedForCreator >= 3 || prepared.length >= TARGET_CASES) break;
      if (transcriptionAttempts >= MAX_TRANSCRIPTION_ATTEMPTS) break;
      if (!reel.videoUrl || seen.has(reel.shortcode)) continue;
      seen.add(reel.shortcode);
      transcriptionAttempts += 1;

      const started = Date.now();
      const result = await transcribeReel({
        videoUrl: reel.videoUrl,
        shortcode: reel.shortcode,
      });
      const transcribeMs = Date.now() - started;

      if (!result.success || result.transcript.trim().length < 80) {
        console.warn(
          `[RemakeBenchmark] skipping @${creator.handle}/${reel.shortcode}: ${result.success ? "transcript too short" : result.errorCode}`
        );
        continue;
      }

      prepared.push({
        handle: creator.handle,
        sourceNiche: creator.sourceNiche,
        shortcode: reel.shortcode,
        reelUrl: reel.reelUrl,
        caption: reel.caption ?? "",
        viewCount: reel.viewCount ?? 0,
        likeCount: reel.likeCount ?? 0,
        commentCount: reel.commentCount ?? 0,
        duration: reel.duration ?? result.durationSec,
        postedAt:
          reel.postedAt instanceof Date
            ? reel.postedAt.toISOString()
            : new Date(reel.postedAt).toISOString(),
        transcript: result.transcript,
        transcribeMs,
      });
      acceptedForCreator += 1;
      console.info(
        `[RemakeBenchmark] prepared ${prepared.length}/${TARGET_CASES}: @${creator.handle}/${reel.shortcode}`
      );
      await sleep(250);
    }
  }

  return prepared.slice(0, TARGET_CASES);
}

async function runGeneration(args: {
  source: PreparedReel;
  mode: Mode;
  profile: TargetProfile;
}): Promise<{
  instruction: string;
  researchGrounding: string;
  generated: Awaited<ReturnType<typeof generateRemakeContent>>;
  generationMs: number;
}> {
  const context = await buildModeContext(args);
  const started = Date.now();

  const [researchItems, structureResult] = await Promise.all([
    getResearchGrounding(context.researchIdea, context.researchNiche),
    analyzeRemakeStructure({
      originalTranscript: args.source.transcript,
      caption: args.source.caption,
      sourceKey: args.source.shortcode,
      platformLabel: "Instagram Reel",
    }),
  ]);

  const researchGrounding = formatResearchGroundingForPrompt(researchItems);
  const generated = await generateRemakeContent({
    originalTranscript: args.source.transcript,
    caption: args.source.caption,
    reel: {
      shortcode: args.source.shortcode,
      caption: args.source.caption,
      viewCount: args.source.viewCount,
      likeCount: args.source.likeCount,
      commentCount: args.source.commentCount,
      duration: args.source.duration,
      ownerUsername: args.source.handle,
    },
    sourceKey: args.source.shortcode,
    topic: context.topic,
    gradeLevel: "auto",
    addCues: false,
    researchGroundingBlock: researchGrounding,
    trustedResearchTexts: [
      ...context.trustedProfileTexts,
      ...researchItems.flatMap((item) => [
        item.title,
        item.snippet ?? "",
        item.sourceUrl,
      ]),
    ],
    platformLabel: "Instagram Reel",
    viralStructureOverride: structureResult.structure,
  });

  return {
    instruction: context.instruction,
    researchGrounding,
    generated,
    generationMs: Date.now() - started,
  };
}

function passCase(judge: JudgeResult, copiedRun: number): {
  passed: boolean;
  reason?: string;
} {
  const scores = [
    judge.intentObedience,
    judge.hookStrength,
    judge.structureFidelity,
    judge.originality,
    judge.spokenNaturalness,
  ];
  const autoReasons: string[] = [];

  if (judge.hallucination) autoReasons.push("hallucination");
  if (judge.factualSafety !== "pass") autoReasons.push("factual_safety");
  if (judge.copiedTooClosely || copiedRun >= 16) {
    autoReasons.push("copied_too_closely");
  }
  if (judge.intentObedience < MIN_INTENT_SCORE) {
    autoReasons.push("intent_obedience");
  }

  if (autoReasons.length) {
    return { passed: false, reason: `AUTO_FAIL: ${autoReasons.join(", ")}` };
  }

  if (scores.some((score) => score < MIN_SCORE)) {
    return { passed: false, reason: "One or more creative quality scores are below 7/10." };
  }
  if (avg(scores) < MIN_AVERAGE) {
    return { passed: false, reason: "Average creative quality score is below 7.5/10." };
  }
  if (judge.verdict !== "pass") {
    return { passed: false, reason: `Judge verdict is ${judge.verdict}.` };
  }

  return { passed: true };
}

async function main() {
  requiredEnv("SCRAPECREATORS_API_KEY");
  requiredEnv("ANTHROPIC_API_KEY");
  requiredEnv("DEEPGRAM_API_KEY");
  requiredEnv("SERPER_API_KEY");

  const startedAt = new Date().toISOString();
  const report: {
    startedAt: string;
    branch: string;
    policy: Record<string, unknown>;
    sourcePrep: Record<string, unknown>;
    cases: BenchmarkCaseResult[];
    warmChecks: Array<Record<string, unknown>>;
    summary?: Record<string, unknown>;
  } = {
    startedAt,
    branch: process.env.GITHUB_REF_NAME ?? "feature/remake-hardening-v1",
    policy: {
      targetCases: TARGET_CASES,
      distribution: { same_topic: 10, niche: 10, custom: 10 },
      automaticFail: [
        "hallucination",
        "unsupported factual claim",
        "wrong intent/mode",
        "copied too closely",
        "tool failure",
      ],
      minimumScore: MIN_SCORE,
      minimumIntentScore: MIN_INTENT_SCORE,
      minimumAverage: MIN_AVERAGE,
      coldLatencyTargetMs: 30_000,
      warmLatencyTargetMs: 20_000,
    },
    sourcePrep: {},
    cases: [],
    warmChecks: [],
  };

  await writeReport(report);

  const prepStarted = Date.now();
  const sources = await prepareSources();
  report.sourcePrep = {
    preparedCount: sources.length,
    ms: Date.now() - prepStarted,
    creators: [...new Set(sources.map((source) => source.handle))],
  };
  await writeReport(report);

  if (sources.length < TARGET_CASES) {
    report.summary = {
      passed: false,
      reason: `Only prepared ${sources.length}/${TARGET_CASES} spoken real Reels.`,
    };
    await writeReport(report);
    throw new Error(String(report.summary.reason));
  }

  const modeCounts: Record<Mode, number> = {
    same_topic: 0,
    niche: 0,
    custom: 0,
  };

  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    const mode = MODE_ORDER[index % MODE_ORDER.length];
    const profile =
      TARGET_PROFILES[Math.floor(index / MODE_ORDER.length) % TARGET_PROFILES.length];
    modeCounts[mode] += 1;
    const caseId = `${String(index + 1).padStart(2, "0")}-${mode}-${source.shortcode}`;

    const row: BenchmarkCaseResult = {
      caseId,
      creator: source.handle,
      sourceNiche: source.sourceNiche,
      shortcode: source.shortcode,
      reelUrl: source.reelUrl,
      sourceViews: source.viewCount,
      sourceDurationSec: source.duration,
      mode,
      targetProfile: profile.id,
      instruction: "",
      transcribeMs: source.transcribeMs,
      passed: false,
    };

    try {
      const generatedResult = await runGeneration({ source, mode, profile });
      row.instruction = generatedResult.instruction;
      row.generatedScript = generatedResult.generated.generatedScript;
      row.structure = generatedResult.generated.viralStructure;
      row.readability = generatedResult.generated.readabilityAnalysis;
      row.factIntegrity = generatedResult.generated.factIntegrity;
      row.structureCacheHit = generatedResult.generated.structureCacheHit;
      row.generationMs = generatedResult.generationMs;
      row.totalColdMs = source.transcribeMs + generatedResult.generationMs;
      row.researchSourceCount = (
        generatedResult.researchGrounding.match(/^\d+\./gm) ?? []
      ).length;

      const copiedRun = longestCommonWordRun(
        source.transcript,
        generatedResult.generated.generatedScript
      );
      row.longestCopiedRunWords = copiedRun;

      const judge = await judgeRemake({
        mode,
        instruction: generatedResult.instruction,
        sourceTranscript: source.transcript,
        sourceCaption: source.caption,
        sourceStructure: generatedResult.generated.viralStructure,
        researchGrounding: generatedResult.researchGrounding,
        generatedScript: generatedResult.generated.generatedScript,
        longestCopiedRunWords: copiedRun,
      });
      row.judge = judge;

      const decision = passCase(judge, copiedRun);
      row.passed = decision.passed;
      row.failureReason = decision.reason;
    } catch (error) {
      row.failureReason =
        error instanceof Error ? error.message : String(error);
      row.passed = false;
    }

    report.cases.push(row);
    console.info(
      `[RemakeBenchmark] ${caseId} ${row.passed ? "PASS" : "FAIL"} cold=${row.totalColdMs ?? "n/a"}ms ${row.failureReason ?? ""}`
    );
    await writeReport(report);
    await sleep(350);
  }

  const warmCandidates: BenchmarkCaseResult[] = [];
  for (const mode of MODE_ORDER) {
    warmCandidates.push(
      ...report.cases.filter((row) => row.mode === mode).slice(0, WARM_CASES_PER_MODE)
    );
  }

  for (const row of warmCandidates) {
    const source = sources.find((item) => item.shortcode === row.shortcode);
    const profile = TARGET_PROFILES.find((item) => item.id === row.targetProfile);
    if (!source || !profile) continue;

    try {
      const started = Date.now();
      const rerun = await runGeneration({
        source,
        mode: row.mode,
        profile,
      });
      report.warmChecks.push({
        caseId: row.caseId,
        mode: row.mode,
        ms: Date.now() - started,
        structureCacheHit: rerun.generated.structureCacheHit,
        factRepairApplied: rerun.generated.factIntegrity.repaired,
        passedLatencyTarget: Date.now() - started < 20_000,
      });
    } catch (error) {
      report.warmChecks.push({
        caseId: row.caseId,
        mode: row.mode,
        error: error instanceof Error ? error.message : String(error),
        passedLatencyTarget: false,
      });
    }
    await writeReport(report);
  }

  const automaticFailures = report.cases.filter(
    (row) =>
      row.judge?.hallucination ||
      row.judge?.factualSafety === "fail" ||
      row.judge?.copiedTooClosely ||
      (row.longestCopiedRunWords ?? 0) >= 16 ||
      (row.judge?.intentObedience ?? 10) < MIN_INTENT_SCORE ||
      !row.generatedScript
  );
  const passedCases = report.cases.filter((row) => row.passed);
  const modePasses = Object.fromEntries(
    MODE_ORDER.map((mode) => [
      mode,
      {
        total: report.cases.filter((row) => row.mode === mode).length,
        passed: report.cases.filter((row) => row.mode === mode && row.passed).length,
      },
    ])
  );

  const coldTimes = report.cases
    .map((row) => row.totalColdMs)
    .filter((value): value is number => typeof value === "number");
  const warmTimes = report.warmChecks
    .map((row) => row.ms)
    .filter((value): value is number => typeof value === "number");

  const summaryPassed =
    report.cases.length === TARGET_CASES &&
    automaticFailures.length === 0 &&
    passedCases.length === TARGET_CASES;

  report.summary = {
    passed: summaryPassed,
    totalCases: report.cases.length,
    passedCases: passedCases.length,
    failedCases: report.cases.length - passedCases.length,
    automaticFailures: automaticFailures.length,
    hallucinations: report.cases.filter((row) => row.judge?.hallucination).length,
    modeCounts,
    modePasses,
    coldLatencyMs: {
      average: Math.round(avg(coldTimes)),
      max: coldTimes.length ? Math.max(...coldTimes) : null,
      under30s: coldTimes.filter((value) => value < 30_000).length,
      total: coldTimes.length,
    },
    warmLatencyMs: {
      average: Math.round(avg(warmTimes)),
      max: warmTimes.length ? Math.max(...warmTimes) : null,
      under20s: warmTimes.filter((value) => value < 20_000).length,
      total: warmTimes.length,
    },
    acceptance: {
      hallucinationsRequired: 0,
      intentRequired: "30/30 >= 8",
      toolSuccessRequired: "30/30 for final merge gate",
      creativeQualityRequired:
        "all core scores >= 7, average >= 7.5, judge verdict pass",
    },
  };

  await writeReport(report);
  console.info("[RemakeBenchmark] FINAL", JSON.stringify(report.summary, null, 2));

  if (!summaryPassed) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error("[RemakeBenchmark] fatal", error);
  process.exitCode = 1;
});
