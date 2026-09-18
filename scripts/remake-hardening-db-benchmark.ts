import "dotenv/config";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import {
  featuredAccounts,
  featuredReels,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  buildRecreateDefaultTopicPrompt,
  buildRecreateTopicPrompt,
} from "../shared/recreateAnglePrompt";
import { analyzeRemakeStructure } from "../server/recreate/remakeStructure";
import { generateRemakeContent } from "../server/recreate/generateRemakeContent";
import { invokeLLM } from "../server/_core/llm";
import { withAiFormattingRules } from "../server/utils/aiFormattingRules";

type Mode = "same_topic" | "niche" | "custom";

type TargetProfile = {
  id: string;
  niche: string;
  targetAudience: string;
  brandDescription: string;
  customAngle: string;
  audienceResearch: string;
  researchGrounding: string;
  trustedResearchTexts: string[];
};

type SourceRow = {
  id: number;
  accountId: number;
  handle: string;
  displayName: string;
  followerCount: number;
  shortcode: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number;
  postedAt: string;
  niche: string;
  contentType: string;
  hookPattern: string;
  retentionTactics: string[];
  classificationReason: string;
  viralFlag: boolean;
  transcript: string;
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

type CaseReport = {
  caseId: string;
  source: {
    id: number;
    handle: string;
    shortcode: string;
    url: string;
    views: number;
    niche: string;
    contentType: string;
  };
  mode: Mode;
  targetProfile: string;
  instruction: string;
  generatedScript?: string;
  generationMs?: number;
  structureCacheHit?: boolean;
  factRepairApplied?: boolean;
  factInitialRiskCount?: number;
  readability?: Record<string, unknown>;
  longestCopiedRunWords?: number;
  judge?: JudgeResult;
  passed: boolean;
  failureReason?: string;
};

const OUTPUT_PATH = path.join(
  process.cwd(),
  "artifacts",
  "remake-hardening-db-benchmark.json"
);

const TARGET_CASES = 30;
const ACCOUNTS_NEEDED = 10;
const MODE_ORDER: Mode[] = ["same_topic", "niche", "custom"];
const MIN_SCORE = 7;
const MIN_INTENT = 8;
const MIN_AVERAGE = 7.5;

const TARGET_PROFILES: TargetProfile[] = [
  {
    id: "restaurant-operator",
    niche: "Restaurants & Cafes",
    targetAudience: "restaurant owners and operators",
    brandDescription:
      "Practical education that helps restaurant owners improve margins, operations, menu strategy and growth.",
    customAngle:
      "why menu engineering is a profit system, not just a menu design exercise",
    audienceResearch:
      "Audience questions: Which menu items sell often but leave weak contribution margin? Which profitable items deserve more visibility? How should owners decide what to feature, reprice, improve or remove?",
    researchGrounding:
      "Verified grounding:\n1. Traditional menu engineering evaluates menu items using popularity and contribution margin, supporting pricing and placement decisions.\n   Source: https://www.sciencedirect.com/science/article/pii/S0278431920300566",
    trustedResearchTexts: [
      "Traditional menu engineering evaluates menu items using popularity and contribution margin, supporting pricing and placement decisions.",
      "https://www.sciencedirect.com/science/article/pii/S0278431920300566",
    ],
  },
  {
    id: "fitness-coach",
    niche: "Fitness",
    targetAudience: "busy adults who want sustainable strength and better health",
    brandDescription:
      "Evidence-aware fitness education focused on simple training systems and sustainable habits.",
    customAngle:
      "why progressive overload matters more than constantly changing your workouts",
    audienceResearch:
      "Audience questions: How do I know when to add weight or reps? Why does repeating a basic program work? How quickly should training load increase?",
    researchGrounding:
      "Verified grounding:\n1. U.S. physical-activity guidance describes overload as stress beyond the usual level and progression as gradually increasing activity as the body adapts. Small progressive changes help adaptation while reducing injury risk.\n   Source: https://health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf",
    trustedResearchTexts: [
      "U.S. physical-activity guidance describes overload as stress beyond the usual level and progression as gradually increasing activity as the body adapts.",
      "Small progressive changes help adaptation while reducing injury risk.",
      "https://health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf",
    ],
  },
  {
    id: "real-estate-educator",
    niche: "Real Estate",
    targetAudience: "home sellers and newer real estate agents",
    brandDescription:
      "Practical real estate education about pricing, listings, lead generation and client trust.",
    customAngle:
      "why pricing strategy matters more than expensive listing photos when a home is positioned badly",
    audienceResearch:
      "Audience questions: How should a seller set an asking price? What role do comparable sales and current market conditions play? When should a seller reconsider price?",
    researchGrounding:
      "Verified grounding:\n1. The National Association of REALTORS consumer guide says listing-price recommendations consider property characteristics, current market conditions, comparable sales, and the seller's goals and timeline.\n   Source: https://www.nar.realtor/the-facts/consumer-guide-what-goes-into-pricing-your-home",
    trustedResearchTexts: [
      "Listing-price recommendations consider property characteristics, current market conditions, comparable sales, and the seller's goals and timeline.",
      "https://www.nar.realtor/the-facts/consumer-guide-what-goes-into-pricing-your-home",
    ],
  },
  {
    id: "small-business-marketer",
    niche: "Marketing",
    targetAudience: "small business owners who need predictable customer acquisition",
    brandDescription:
      "No-fluff marketing education about acquisition, retention, offers and customer economics.",
    customAngle:
      "why existing customers deserve a real marketing plan instead of putting every effort into new-customer acquisition",
    audienceResearch:
      "Audience questions: How do I bring customers back? What should I communicate after the first sale? How do I stay top-of-mind without constantly discounting?",
    researchGrounding:
      "Verified grounding:\n1. The U.S. Small Business Administration advises small businesses not to focus only on attracting new customers and recommends continued marketing and follow-up with existing customers.\n   Source: https://www.sba.gov/blog/2017/2017-10/7-marketing-mistakes-can-come-back-haunt-you/",
    trustedResearchTexts: [
      "The U.S. Small Business Administration advises small businesses not to focus only on attracting new customers and recommends continued marketing and follow-up with existing customers.",
      "https://www.sba.gov/blog/2017/2017-10/7-marketing-mistakes-can-come-back-haunt-you/",
    ],
  },
  {
    id: "personal-finance-educator",
    niche: "Personal Finance",
    targetAudience: "young professionals trying to build better money habits",
    brandDescription:
      "Practical personal-finance education focused on systems, automation and long-term behavior.",
    customAngle:
      "why automatic saving systems can make consistent saving easier than relying on a monthly decision",
    audienceResearch:
      "Audience questions: How do I save consistently? Can I move money automatically on payday? How do I make saving happen before I spend the rest?",
    researchGrounding:
      "Verified grounding:\n1. The U.S. Consumer Financial Protection Bureau recommends automatic recurring transfers as an easy and consistent way to save, including transfers scheduled around payday.\n   Source: https://www.consumerfinance.gov/archive/blog/looking-easy-way-save-money-make-it-automatic/",
    trustedResearchTexts: [
      "The U.S. Consumer Financial Protection Bureau recommends automatic recurring transfers as an easy and consistent way to save, including transfers scheduled around payday.",
      "https://www.consumerfinance.gov/archive/blog/looking-easy-way-save-money-make-it-automatic/",
    ],
  },
];

let latestReport: Record<string, unknown> = {
  status: "starting",
  startedAt: new Date().toISOString(),
};

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function longestCommonRun(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return 0;
  let previous = new Uint16Array(y.length + 1);
  let best = 0;
  for (let i = 1; i <= x.length; i++) {
    const current = new Uint16Array(y.length + 1);
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best;
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

async function persist(report: Record<string, unknown>) {
  latestReport = report;
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function loadSources(): Promise<SourceRow[]> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");

  const rows = await db
    .select({
      id: featuredReels.id,
      accountId: featuredReels.featuredAccountId,
      handle: featuredAccounts.handle,
      displayName: featuredAccounts.displayName,
      followerCount: featuredAccounts.followerCount,
      shortcode: featuredReels.reelShortcode,
      caption: featuredReels.caption,
      viewCount: featuredReels.viewCount,
      likeCount: featuredReels.likeCount,
      commentCount: featuredReels.commentCount,
      duration: featuredReels.duration,
      postedAt: featuredReels.postedAt,
      niche: featuredReels.niche,
      contentType: featuredReels.contentType,
      hookPattern: featuredReels.hookPattern,
      retentionTactics: featuredReels.retentionTactics,
      classificationReason: featuredReels.classificationReason,
      viralFlag: featuredReels.viralFlag,
      transcript: featuredReels.transcript,
    })
    .from(featuredReels)
    .innerJoin(
      featuredAccounts,
      eq(featuredAccounts.id, featuredReels.featuredAccountId)
    )
    .where(eq(featuredReels.transcriptionStatus, "completed"))
    .orderBy(desc(featuredReels.viewCount))
    .limit(600);

  const clean: SourceRow[] = rows
    .filter(
      (row) =>
        Boolean(row.transcript?.trim()) &&
        (row.transcript?.trim().length ?? 0) >= 100 &&
        Boolean(row.shortcode)
    )
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      handle: row.handle,
      displayName: row.displayName ?? row.handle,
      followerCount: row.followerCount ?? 0,
      shortcode: row.shortcode,
      caption: row.caption ?? "",
      viewCount: row.viewCount ?? 0,
      likeCount: row.likeCount ?? 0,
      commentCount: row.commentCount ?? 0,
      duration: row.duration ?? 0,
      postedAt: row.postedAt.toISOString(),
      niche: row.niche ?? "unknown",
      contentType: row.contentType ?? "unknown",
      hookPattern: row.hookPattern ?? "unknown",
      retentionTactics: Array.isArray(row.retentionTactics)
        ? row.retentionTactics
        : [],
      classificationReason: row.classificationReason ?? "",
      viralFlag: Boolean(row.viralFlag),
      transcript: row.transcript!.trim(),
    }));

  const byAccount = new Map<number, SourceRow[]>();
  for (const row of clean) {
    const bucket = byAccount.get(row.accountId) ?? [];
    if (bucket.length < 5) bucket.push(row);
    byAccount.set(row.accountId, bucket);
  }

  const eligible = [...byAccount.entries()]
    .filter(([, rowsForAccount]) => rowsForAccount.length >= 3)
    .map(([accountId, rowsForAccount]) => ({
      accountId,
      rows: rowsForAccount,
      niche: rowsForAccount.find((row) => row.niche !== "unknown")?.niche ?? "unknown",
      maxViews: Math.max(...rowsForAccount.map((row) => row.viewCount)),
    }));

  const selected: typeof eligible = [];
  const nicheCounts = new Map<string, number>();
  while (selected.length < ACCOUNTS_NEEDED && eligible.length) {
    eligible.sort((a, b) => {
      const nicheA = nicheCounts.get(a.niche) ?? 0;
      const nicheB = nicheCounts.get(b.niche) ?? 0;
      if (nicheA !== nicheB) return nicheA - nicheB;
      return b.maxViews - a.maxViews;
    });
    const next = eligible.shift()!;
    selected.push(next);
    nicheCounts.set(next.niche, (nicheCounts.get(next.niche) ?? 0) + 1);
  }

  if (selected.length < ACCOUNTS_NEEDED) {
    throw new Error(
      `Only found ${selected.length}/${ACCOUNTS_NEEDED} featured creators with at least 3 completed spoken transcripts`
    );
  }

  return selected.flatMap((account) => account.rows.slice(0, 3));
}

function buildContext(
  mode: Mode,
  profile: TargetProfile,
  source: SourceRow
): { instruction: string; topic: string; grounding: string; trusted: string[] } {
  if (mode === "same_topic") {
    return {
      instruction: "Keep the same topic, but make it fresh and original.",
      topic: "SAME_TOPIC",
      grounding: "",
      trusted: [source.transcript, source.caption],
    };
  }

  if (mode === "custom") {
    return {
      instruction: `Use the source Reel's structure but make the new Reel about: ${profile.customAngle}`,
      topic: buildRecreateTopicPrompt({
        angle: profile.customAngle,
        targetAudience: profile.targetAudience,
        businessDescription: profile.brandDescription,
      }),
      grounding: profile.researchGrounding,
      trusted: [
        profile.customAngle,
        profile.targetAudience,
        profile.brandDescription,
        ...profile.trustedResearchTexts,
      ],
    };
  }

  return {
    instruction: `Adapt this Reel to my ${profile.niche} niche for ${profile.targetAudience}.`,
    topic: buildRecreateDefaultTopicPrompt({
      niche: profile.niche,
      targetAudience: profile.targetAudience,
      businessDescription: profile.brandDescription,
      audienceResearchBlock: profile.audienceResearch,
    }),
    grounding: profile.researchGrounding,
    trusted: [
      profile.targetAudience,
      profile.brandDescription,
      profile.audienceResearch,
      ...profile.trustedResearchTexts,
    ],
  };
}

async function judge(args: {
  mode: Mode;
  instruction: string;
  source: SourceRow;
  structure: Record<string, unknown>;
  grounding: string;
  script: string;
  copiedRun: number;
}): Promise<JudgeResult> {
  const factualRule =
    args.mode === "same_topic"
      ? "Source transcript/caption may support facts. Do not treat unsupported additions as facts."
      : "Only creator instruction and verified grounding support real-world facts. Source transcript is structure reference only.";

  const response = await invokeLLM({
    model: "claude-sonnet-4-6",
    temperature: 0,
    maxTokens: 1400,
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are an independent senior short-form creative quality judge. Hallucinated factual specificity is an automatic failure. Return JSON only."
        ),
      },
      {
        role: "user",
        content: `MODE: ${args.mode}
USER DIRECTION:
<<<${args.instruction}>>>

SOURCE CAPTION:
<<<${args.source.caption}>>>

SOURCE TRANSCRIPT:
<<<${args.source.transcript}>>>

SOURCE STRUCTURE:
${JSON.stringify(args.structure, null, 2)}

VERIFIED GROUNDING:
<<<${args.grounding || "(none)"}>>>

FACT RULE:
${factualRule}

GENERATED SCRIPT:
<<<${args.script}>>>

LONGEST VERBATIM WORD RUN VS SOURCE: ${args.copiedRun}

Score 1-10: intentObedience, hookStrength, structureFidelity, originality, spokenNaturalness.
Set factualSafety=fail and hallucination=true for any unsupported real person/company/date/number/quote/study/performance claim or invented true-story framing.
Set copiedTooClosely=true for substantial distinctive copying.
Verdict=pass only if this is publishable with minor/no edits.`,
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

  return JSON.parse(String(response.choices[0]?.message?.content ?? "{}"));
}

function decision(judgeResult: JudgeResult, copiedRun: number) {
  const auto: string[] = [];
  if (judgeResult.hallucination) auto.push("hallucination");
  if (judgeResult.factualSafety !== "pass") auto.push("factual_safety");
  if (judgeResult.copiedTooClosely || copiedRun >= 16)
    auto.push("copied_too_closely");
  if (judgeResult.intentObedience < MIN_INTENT) auto.push("intent");

  if (auto.length) return { passed: false, reason: `AUTO_FAIL: ${auto.join(", ")}` };

  const scores = [
    judgeResult.intentObedience,
    judgeResult.hookStrength,
    judgeResult.structureFidelity,
    judgeResult.originality,
    judgeResult.spokenNaturalness,
  ];
  if (scores.some((score) => score < MIN_SCORE))
    return { passed: false, reason: "core score below 7" };
  if (average(scores) < MIN_AVERAGE)
    return { passed: false, reason: "average score below 7.5" };
  if (judgeResult.verdict !== "pass")
    return { passed: false, reason: `judge verdict ${judgeResult.verdict}` };
  return { passed: true as const };
}

async function runBenchmark(): Promise<Record<string, unknown>> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error(
      "ANTHROPIC_API_KEY is required. Use a dedicated capped benchmark key, not a production-wide key."
    );
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required");
  }

  const startedAt = new Date().toISOString();
  const sources = await loadSources();
  if (sources.length !== TARGET_CASES) {
    throw new Error(`Expected ${TARGET_CASES} sources, got ${sources.length}`);
  }

  const cases: CaseReport[] = [];
  const warmChecks: Array<Record<string, unknown>> = [];

  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    const mode = MODE_ORDER[index % 3];
    const profile =
      TARGET_PROFILES[Math.floor(index / 3) % TARGET_PROFILES.length];
    const context = buildContext(mode, profile, source);
    const caseId = `${String(index + 1).padStart(2, "0")}-${mode}-${source.shortcode}`;
    const row: CaseReport = {
      caseId,
      source: {
        id: source.id,
        handle: source.handle,
        shortcode: source.shortcode,
        url: `https://www.instagram.com/reel/${source.shortcode}/`,
        views: source.viewCount,
        niche: source.niche,
        contentType: source.contentType,
      },
      mode,
      targetProfile: profile.id,
      instruction: context.instruction,
      passed: false,
    };

    try {
      const started = Date.now();
      const structureResult = await analyzeRemakeStructure({
        originalTranscript: source.transcript,
        caption: source.caption,
        sourceKey: source.shortcode,
        platformLabel: "Instagram Reel",
      });
      const generated = await generateRemakeContent({
        originalTranscript: source.transcript,
        caption: source.caption,
        reel: {
          shortcode: source.shortcode,
          caption: source.caption,
          viewCount: source.viewCount,
          likeCount: source.likeCount,
          commentCount: source.commentCount,
          duration: source.duration,
          ownerUsername: source.handle,
          niche: source.niche,
          contentType: source.contentType,
          hookPattern: source.hookPattern,
          retentionTactics: source.retentionTactics,
          classificationReason: source.classificationReason,
          viralFlag: source.viralFlag,
        },
        sourceKey: source.shortcode,
        topic: context.topic,
        gradeLevel: "auto",
        addCues: false,
        researchGroundingBlock: context.grounding,
        trustedResearchTexts: context.trusted,
        platformLabel: "Instagram Reel",
        viralStructureOverride: structureResult.structure,
      });
      row.generationMs = Date.now() - started;
      row.structureCacheHit = structureResult.cacheHit;
      row.factRepairApplied = generated.factIntegrity.repaired;
      row.factInitialRiskCount = generated.factIntegrity.initialRiskCount;
      row.readability = generated.readabilityAnalysis;
      row.generatedScript = generated.generatedScript;
      const copiedRun = longestCommonRun(
        source.transcript,
        generated.generatedScript
      );
      row.longestCopiedRunWords = copiedRun;
      const judged = await judge({
        mode,
        instruction: context.instruction,
        source,
        structure: generated.viralStructure,
        grounding: context.grounding,
        script: generated.generatedScript,
        copiedRun,
      });
      row.judge = judged;
      const verdict = decision(judged, copiedRun);
      row.passed = verdict.passed;
      row.failureReason = verdict.reason;
    } catch (error) {
      row.failureReason =
        error instanceof Error ? error.message : String(error);
    }

    cases.push(row);
    console.info(
      `[RemakeDBBenchmark] ${caseId} ${row.passed ? "PASS" : "FAIL"} ${row.failureReason ?? ""}`
    );
    await persist({
      status: "running",
      startedAt,
      completedCases: cases.length,
      cases,
    });
  }

  const warmCandidates = MODE_ORDER.flatMap((mode) =>
    cases.filter((row) => row.mode === mode).slice(0, 2)
  );
  for (const candidate of warmCandidates) {
    const source = sources.find(
      (row) => row.shortcode === candidate.source.shortcode
    );
    const profile = TARGET_PROFILES.find(
      (row) => row.id === candidate.targetProfile
    );
    if (!source || !profile) continue;
    const context = buildContext(candidate.mode, profile, source);
    const started = Date.now();
    try {
      const structureResult = await analyzeRemakeStructure({
        originalTranscript: source.transcript,
        caption: source.caption,
        sourceKey: source.shortcode,
        platformLabel: "Instagram Reel",
      });
      const generated = await generateRemakeContent({
        originalTranscript: source.transcript,
        caption: source.caption,
        reel: {
          shortcode: source.shortcode,
          niche: source.niche,
          contentType: source.contentType,
          hookPattern: source.hookPattern,
          retentionTactics: source.retentionTactics,
          classificationReason: source.classificationReason,
          viralFlag: source.viralFlag,
        },
        sourceKey: source.shortcode,
        topic: context.topic,
        gradeLevel: "auto",
        addCues: false,
        researchGroundingBlock: context.grounding,
        trustedResearchTexts: context.trusted,
        platformLabel: "Instagram Reel",
        viralStructureOverride: structureResult.structure,
      });
      const ms = Date.now() - started;
      warmChecks.push({
        caseId: candidate.caseId,
        mode: candidate.mode,
        ms,
        structureCacheHit: structureResult.cacheHit,
        factRepairApplied: generated.factIntegrity.repaired,
        under20s: ms < 20_000,
      });
    } catch (error) {
      warmChecks.push({
        caseId: candidate.caseId,
        mode: candidate.mode,
        error: error instanceof Error ? error.message : String(error),
        under20s: false,
      });
    }
  }

  const automaticFailures = cases.filter(
    (row) =>
      !row.generatedScript ||
      row.judge?.hallucination ||
      row.judge?.factualSafety === "fail" ||
      row.judge?.copiedTooClosely ||
      (row.longestCopiedRunWords ?? 0) >= 16 ||
      (row.judge?.intentObedience ?? 10) < MIN_INTENT
  );
  const passed = cases.filter((row) => row.passed);
  const generationTimes = cases
    .map((row) => row.generationMs)
    .filter((value): value is number => typeof value === "number");
  const warmTimes = warmChecks
    .map((row) => row.ms)
    .filter((value): value is number => typeof value === "number");

  const summary = {
    passed:
      cases.length === TARGET_CASES &&
      passed.length === TARGET_CASES &&
      automaticFailures.length === 0,
    totalCases: cases.length,
    passedCases: passed.length,
    failedCases: cases.length - passed.length,
    automaticFailures: automaticFailures.length,
    hallucinations: cases.filter((row) => row.judge?.hallucination).length,
    factualSafetyFailures: cases.filter(
      (row) => row.judge?.factualSafety === "fail"
    ).length,
    modePasses: Object.fromEntries(
      MODE_ORDER.map((mode) => [
        mode,
        {
          total: cases.filter((row) => row.mode === mode).length,
          passed: cases.filter((row) => row.mode === mode && row.passed).length,
        },
      ])
    ),
    latency: {
      generationAverageMs: Math.round(average(generationTimes)),
      generationMaxMs: generationTimes.length
        ? Math.max(...generationTimes)
        : null,
      generationUnder30s: generationTimes.filter((ms) => ms < 30_000).length,
      warmAverageMs: Math.round(average(warmTimes)),
      warmUnder20s: warmTimes.filter((ms) => ms < 20_000).length,
      warmTotal: warmTimes.length,
    },
    acceptance: {
      hallucinationRequired: "0/30",
      intentRequired: "30/30 >= 8/10",
      toolSuccessRequired: "30/30",
      creativeQuality:
        "all core scores >= 7/10, average >= 7.5/10, judge verdict pass",
    },
  };

  return {
    status: "complete",
    startedAt,
    finishedAt: new Date().toISOString(),
    sourceCount: sources.length,
    uniqueCreators: [...new Set(sources.map((row) => row.handle))],
    sourceNiches: [...new Set(sources.map((row) => row.niche))],
    cases,
    warmChecks,
    summary,
  };
}

function startServer() {
  const port = Number(process.env.PORT || 3000);
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: latestReport.status }));
      return;
    }
    if (req.url === "/report" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(latestReport, null, 2));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
  server.listen(port, "0.0.0.0", () => {
    console.info(`[RemakeDBBenchmark] report server listening on ${port}`);
  });
}

async function main() {
  startServer();
  try {
    const report = await runBenchmark();
    await persist(report);
    console.info(
      "[RemakeDBBenchmark] FINAL",
      JSON.stringify(report.summary, null, 2)
    );
  } catch (error) {
    const report = {
      status: "fatal",
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    await persist(report);
    console.error("[RemakeDBBenchmark] fatal", report.error);
  }
}

void main();
