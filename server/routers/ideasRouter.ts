import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import crypto from "crypto";
import { featuredReels, transcriptions, reels as reelsTable } from "../../drizzle/schema";
import type { Reel, Transcription, User } from "../../drizzle/schema";
import { formatClarificationAnswers, filmingFormatLabelFromId, readFollowUpsFromIdeaMeta, readTargetAudienceFromIdeaMeta, ideaHasLockedAudience, inferAudienceFromIdea, audienceLockFromProfile, rankHooksForAudience, buildFilmingFormatWizard, inferFilmingFormatFromIdea, shouldSkipAudienceClarification, buildClarificationWizard } from "../../shared/ideaClarification";
import type { IdeaClarificationWizard, ClarificationAudienceType } from "../../shared/ideaClarification";
import { shouldAskCreatorContextQuestion } from "../../shared/onboardingDescription";
import { invokeLLM } from "../_core/llm";
import { transcribeAudio } from "../_core/voiceTranscription";
import { capturePostHogEvent, posthogDistinctIdForUser } from "../analytics/posthogServer";
import { assertIdeaInWorkspace } from "../assertIdeaInWorkspace";
import { createScriptIdea, updateScriptIdea, getScriptIdeasByWorkspace, ensureDefaultTags, createSavedScript, createScriptVersion, getOnboardingState, deleteScriptIdea, getDb, getScriptIdeaById } from "../db";
import { parseCalendarHint, formatPlannedPostLabel, buildSaveAssistantMessage, assignScriptingTag, enrichIdeaSavedScriptInBackground, generateIdeaFollowUps, generateAndStoreFollowUps } from "../ideaScriptExtras";
import { extractHookTextFromSegments } from "./_shared";
import { storagePut } from "../storage";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "../utils/sanitizeAiOutput";
import { ONBOARDING_NICHES } from "@/data/onboardingNiches";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";
import { HEIT_JUDGE_CRITERIA, buildHeitWriterRules, buildHeitStructurePrompt, HEIT_STRUCTURE_JSON_SCHEMA, normalizeHeitStructure, HEIT_FRAMEWORK, buildHeitDraftUserPrompt, readHeitHookType } from "@shared/ideaScriptHeit";
import { buildIdeaScriptProgressSteps } from "@shared/ideaScriptProgress";
import type { IdeaScriptProgressStepId } from "@shared/ideaScriptProgress";
import { buildIdeaScriptCompletedProps, buildIdeaScriptFailedProps } from "@shared/scriptGenerationAnalytics";
import { and, not, or, like, eq, desc, isNotNull, ne } from "drizzle-orm";

function mergeScriptIdeaViralStructure(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const prevMeta =
    base.ideaMeta && typeof base.ideaMeta === "object"
      ? (base.ideaMeta as Record<string, unknown>)
      : {};
  if (patch.ideaMeta && typeof patch.ideaMeta === "object") {
    return {
      ...base,
      ...patch,
      ideaMeta: { ...prevMeta, ...(patch.ideaMeta as Record<string, unknown>) },
    };
  }
  return { ...base, ...patch };
}


async function setIdeaScriptProgress(
  ideaId: number,
  idea: { viralStructure?: unknown },
  flow: "validation" | "processing",
  activeStepId: IdeaScriptProgressStepId,
  completedThrough?: IdeaScriptProgressStepId
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  const steps = buildIdeaScriptProgressSteps(flow, activeStepId, completedThrough).map((step) => ({
    ...step,
    at: step.status !== "pending" ? now : undefined,
  }));
  const mergedVs = mergeScriptIdeaViralStructure(idea.viralStructure, {
    ideaMeta: { progressSteps: steps, progressUpdatedAt: now },
  });
  await updateScriptIdea(ideaId, { viralStructure: mergedVs as any } as any);
  return mergedVs;
}


function buildTargetAudiencePromptBlock(
  idea: { viralStructure?: unknown },
  profile?: { targetAudience?: string | null } | null
): string {
  const aud =
    readTargetAudienceFromIdeaMeta(idea.viralStructure) ??
    (profile?.targetAudience?.trim()
      ? { label: profile.targetAudience.trim(), type: "other" as ClarificationAudienceType }
      : null);
  if (!aud) return "";
  const guard =
    aud.type === "b2c"
      ? "Write TO this consumer audience in second person. Do NOT address business owners, operators, or industry peers unless they are the viewer."
      : aud.type === "b2b"
        ? "Write TO business buyers and operators in this industry. Do NOT write as if the viewer is an end consumer or guest."
        : aud.type === "creator_peers"
          ? "Write TO other creators and peers. Use shared-experience framing, not consumer marketing speak."
          : "";
  return `\nTARGET AUDIENCE (locked by creator): ${aud.label}\n${guard}\n`;
}


function buildCreatorProfilePromptBlock(profile: {
  businessDescription?: string | null;
  targetAudience?: string | null;
  selectedNicheSlugs?: string[] | null;
} | null | undefined): string {
  if (!profile) return "";
  const lines: string[] = [];
  const niches = (profile.selectedNicheSlugs ?? [])
    .map((slug) => ONBOARDING_NICHES.find((n) => n.slug === slug)?.name ?? slug)
    .filter(Boolean);
  if (niches.length > 0) lines.push(`Creator niches: ${niches.join(", ")}`);
  if (profile.businessDescription?.trim()) {
    lines.push(`What they create / sell: ${profile.businessDescription.trim()}`);
  }
  if (profile.targetAudience?.trim()) {
    lines.push(`Who they create for: ${profile.targetAudience.trim()}`);
  }
  if (lines.length === 0) return "";
  return `\nCREATOR PROFILE (from onboarding — personalize voice, examples, and CTA to this):\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
}


async function autoLockAudienceFromContext(
  ideaId: number,
  idea: { idea: string; viralStructure?: unknown },
  profile: {
    targetAudience?: string | null;
    businessDescription?: string | null;
  } | null | undefined
): Promise<{ idea: string; viralStructure?: unknown; locked: boolean }> {
  if (ideaHasLockedAudience(idea)) {
    return { ...idea, locked: true };
  }

  const inferred = inferAudienceFromIdea(idea.idea);
  const fromProfile = audienceLockFromProfile(profile);
  const lock = inferred ?? fromProfile;
  if (!lock) return { ...idea, locked: false };

  const mergedVs = mergeScriptIdeaViralStructure(idea.viralStructure, {
    ideaMeta: {
      targetAudience: lock.label,
      audienceType: inferred?.type ?? lock.type,
    },
  });

  await updateScriptIdea(ideaId, {
    viralStructure: mergedVs as any,
  } as any);

  return {
    idea: idea.idea,
    viralStructure: mergedVs,
    locked: true,
  };
}


const IDEA_SCRIPT_JUDGE_PASS_SCORE = 7;

const IDEA_SCRIPT_JUDGE_MAX_EXTRA_DRAFTS = 2;

function buildFilmingFormatRules(filmingFormat: string | null | undefined): string {
  const raw = (filmingFormat || "").trim().toLowerCase();
  const fmt = (() => {
    if (!raw) return "talking_head";
    if (raw === "talking_head" || raw.includes("on camera") || raw.includes("talking head")) {
      return "talking_head";
    }
    if (
      raw === "voiceover" ||
      raw === "broll_voiceover" ||
      raw.includes("voiceover") ||
      raw.includes("b-roll") ||
      raw.includes("speak over")
    ) {
      return "voiceover";
    }
    if (
      raw === "text_on_screen" ||
      raw === "faceless_text" ||
      raw.includes("text on screen") ||
      raw.includes("no face")
    ) {
      return "text_on_screen";
    }
    if (
      raw === "b_roll" ||
      raw === "before_after" ||
      raw.includes("montage") ||
      raw.includes("before and after")
    ) {
      return "b_roll";
    }
    if (
      raw === "screen_recording" ||
      raw === "tutorial_demo" ||
      raw.includes("tutorial") ||
      raw.includes("step-by-step") ||
      raw.includes("screen recording")
    ) {
      return "screen_recording";
    }
    return raw;
  })();

  switch (fmt) {
    case "talking_head":
      return `FORMAT: Talking head (creator on camera speaking directly).
- Hook must be a spoken line the creator says in the FIRST 2 seconds. No cold open setup.
- Write as natural spoken speech with contractions. Short punchy sentences.
- Hook patterns that work: bold claim, mistake reveal, "you" callout, contrarian opener, specific number.
- Every line should feel like the creator is talking to ONE person watching from their phone.`;

    case "voiceover":
      return `FORMAT: Voiceover (creator narrates over B-roll or clips, not on camera).
- Hook is spoken but the VISUAL carries it — write the hook line so it works even if viewer only hears audio.
- Describe the emotional or visual tension in the words themselves.
- Hook patterns that work: open loop ("what you're about to see..."), surprising stat, bold narrative claim.
- Pacing can be slightly slower than talking-head — the visual does half the work.`;

    case "text_on_screen":
      return `FORMAT: Text on screen (words appear on screen, minimal or no voice).
- Hook is READ not heard — it must stop the scroll visually in under 1.5 seconds.
- Write short punchy lines (5-9 words max per text card).
- Use line breaks to create anticipation. Each paragraph = one screen card.
- Hook patterns that work: cliffhanger, "POV:", "Nobody talks about this:", listicle promise.
- No filler — every word is visible and must earn its place.`;

    case "b_roll":
      return `FORMAT: B-roll montage with narration.
- The hook line must paint a vivid picture in words because the viewer is watching visual action.
- Open with a result, transformation, or striking contrast — not a question.
- Hook patterns that work: result-first, before/after reveal, specific transformation.
- Write narration that COMPLEMENTS visuals — don't describe what's obvious on screen.`;

    case "screen_recording":
      return `FORMAT: Screen recording / tutorial walkthrough.
- Hook must immediately promise a specific outcome or reveal ("I'll show you exactly how to...").
- Viewer is watching a screen — use second-person to guide ("Click here", "You'll see...").
- Hook patterns that work: specific promise, time-bound result, mistake reveal.
- Keep pacing instructional and clear — curiosity gap works but must resolve fast.`;

    default:
      return `FORMAT: Custom filming format.
- Hook must stop the scroll in the first 2 seconds.
- Write as natural spoken content. Keep it punchy and specific.
- Hook patterns that work: bold claim, curiosity gap, specific number, contrarian take.`;
  }
}


function buildViralHookBlock(
  examples: Array<{ hook: string; pattern: string; skipRate: number | null }>
): string {
  if (examples.length === 0) return "";

  const lines = examples.map((ex, i) => {
    const skipLabel = ex.skipRate != null ? ` [skip score: ${ex.skipRate}/10]` : "";
    return `${i + 1}. [${ex.pattern}]${skipLabel}: "${ex.hook}"`;
  });

  return `
**REAL VIRAL HOOKS FROM SPYREELS DATABASE (proven high skip-score performers in this niche):**
${lines.join("\n")}

These are the FIRST LINES from real videos that scored 6+ out of 10 on skip-rate prediction (meaning viewers did NOT skip — they watched). Use these as inspiration for the hook PATTERN and ENERGY — do not copy them word-for-word. Adapt the pattern to the user's specific topic.
`;
}


function ideaCreatorGoalDirectives(goal: string | null | undefined): string {
  const g = (goal || "balanced").trim();
  switch (g) {
    case "growth_virality":
      return `Creator goal, MAXIMUM DISCOVERY / REPLAY: Prioritize curiosity gaps, punchy openings, tighter pacing, novelty or a sharp (honest) contrarian angle. Hooks may be bold if not misleading.`;
    case "personal_brand":
      return `Creator goal, PERSONAL BRAND & CONTENT CALENDAR: One consistent human voice in first person. Favor specific lived details, credibility, and repeatable "pillar" angles people can expect from this creator week to week. Trust and authenticity beat empty shock; never sound like a generic AI hype template.`;
    case "education_authority":
      return `Creator goal, TEACH & BUILD AUTHORITY: Clear arc (promise, simple framework, 1-3 concrete steps, memorable takeaway). Still needs a scroll-stopping hook in the first 3 seconds. Plain language; minimal jargon; invite saves or screenshots when natural.`;
    case "warm_promo":
      return `Creator goal, SOFT PROMOTION: Teach-first. Deliver real value before any ask. Weave offer, booking, or list sign-up as a natural escalation, not an infomercial pile-on.`;
    default:
      return `Creator goal, BALANCED REEL: Strong hook in the first 3 seconds, ONE memorable payoff, conversational contractions, rhythmic pacing with micro-beats every ~10-14 seconds, CTA matched to the topic. No fake stats or filler "bro science."`;
  }
}


const IDEA_CREATOR_GOAL_SLUGS = [
  "balanced",
  "growth_virality",
  "personal_brand",
  "education_authority",
  "warm_promo",
] as const;

type IdeaCreatorGoalSlug = (typeof IDEA_CREATOR_GOAL_SLUGS)[number];

function readScriptIdeaCreatorSlug(idea: { viralStructure?: unknown }): IdeaCreatorGoalSlug {
  const vs = idea.viralStructure;
  if (!vs || typeof vs !== "object" || vs === null) return "balanced";
  const meta = (vs as Record<string, unknown>).ideaMeta;
  if (!meta || typeof meta !== "object") return "balanced";
  const slug = (meta as Record<string, unknown>).creatorGoal;
  if (typeof slug !== "string") return "balanced";
  return (IDEA_CREATOR_GOAL_SLUGS as readonly string[]).includes(slug)
    ? (slug as IdeaCreatorGoalSlug)
    : "balanced";
}


function readScriptIdeaFilmingFormat(idea: {
  filmingFormat?: string | null;
  viralStructure?: unknown;
}): string | null {
  if (typeof idea.filmingFormat === "string" && idea.filmingFormat.trim()) {
    return idea.filmingFormat.trim();
  }
  const vs = idea.viralStructure;
  if (!vs || typeof vs !== "object" || vs === null) return null;
  const meta = (vs as Record<string, unknown>).ideaMeta;
  if (!meta || typeof meta !== "object") return null;
  const fmt = (meta as Record<string, unknown>).filmingFormat;
  return typeof fmt === "string" && fmt.trim() ? fmt.trim() : null;
}


async function invokeIdeaScriptJudge(opts: {
  ideaText: string;
  nicheContext: string;
  creatorGoalBrief: string;
  toneContext: string;
  scriptDraft: string;
  viralStructure: Record<string, unknown>;
}): Promise<{
  overallScore: number;
  hookEffectiveness: number;
  pacingRetention: number;
  goalAlignment: number;
  skipRatePrediction: number;
  verdictPass: boolean;
  criticalIssues: string[];
  rewriteDirectives: string;
}> {
  const safeFallback = () => ({
    overallScore: 8,
    hookEffectiveness: 8,
    pacingRetention: 8,
    goalAlignment: 8,
    skipRatePrediction: 7,
    verdictPass: true,
    criticalIssues: [] as string[],
    rewriteDirectives: "",
  });

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(`You are a ruthless but fair Instagram Reels script judge. You evaluate SPOKEN drafts (not essays) for mobile viewing.

Score each dimension 1-10 using short-form best practices:
- Hook: pattern interrupt or curiosity gap in the first sentence; no sleepy setup.
- Pacing / retention: idea density every ~12s of speech; avoids monologue walls; payoff stays on-theme.
- Goal fit: aligns with the stated creator objective (growth vs trust vs teaching vs gentle promo).
- Skip-rate prediction: Score 1-10. How many people stop scrolling vs swipe past in the first 3 seconds? 10 = almost nobody skips (bold claim, surprising question, shocking stat). 1 = most people swipe (opens with "Hey guys", restates the topic, slow setup). This is the single most important signal — Instagram's algorithm ranks reels by it.

${HEIT_JUDGE_CRITERIA}

Overall score = holistic blend (not pure average).

Return JSON verdict. Use "pass" only if overallScore >= ${IDEA_SCRIPT_JUDGE_PASS_SCORE} AND the draft is legitimately worthy of filming without another rewrite.`),
        },
        {
          role: "user",
          content: `CREATOR INTENT:\n${opts.creatorGoalBrief}\n\nTone: ${opts.toneContext}\nTopic niche context: ${opts.nicheContext || "(none)"}\n\nSOURCE IDEA:\n"${opts.ideaText}"\n\nPLANNED STRUCTURE (JSON):\n${JSON.stringify(opts.viralStructure, null, 2)}\n\nDRAFT SCRIPT:\n<<<${opts.scriptDraft}>>>\n`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "idea_script_judge",
          strict: true,
          schema: {
            type: "object",
            properties: {
              overallScore: { type: "number", description: "1-10 holistic quality" },
              hookEffectiveness: { type: "number", description: "1-10" },
              pacingRetention: { type: "number", description: "1-10" },
              goalAlignment: { type: "number", description: "1-10" },
              skipRatePrediction: {
                type: "number",
                description: "1-10: likelihood of stopping the scroll in the first 3 seconds",
              },
              verdict: {
                type: "string",
                enum: ["pass", "revise"],
                description: "pass only if filming-ready without rewrite",
              },
              criticalIssues: {
                type: "array",
                items: { type: "string" },
                description: "up to 5 concrete problems",
              },
              rewriteDirectives: {
                type: "string",
                description: "Single tight paragraph ordering the rewriter what to fix",
              },
            },
            required: [
              "overallScore",
              "hookEffectiveness",
              "pacingRetention",
              "goalAlignment",
              "skipRatePrediction",
              "verdict",
              "criticalIssues",
              "rewriteDirectives",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return safeFallback();
    const cleaned = String(raw).replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = sanitizeAiOutputDeep(JSON.parse(cleaned)) as {
      overallScore: number;
      hookEffectiveness?: number;
      pacingRetention?: number;
      goalAlignment?: number;
      skipRatePrediction?: number;
      verdict?: string;
      criticalIssues?: string[];
      rewriteDirectives?: string;
    };

    const overallScore = Math.min(10, Math.max(1, Math.round(Number(parsed.overallScore) || 5)));
    const hookEffectiveness = Math.min(
      10,
      Math.max(1, Math.round(Number(parsed.hookEffectiveness) || overallScore))
    );
    const pacingRetention = Math.min(
      10,
      Math.max(1, Math.round(Number(parsed.pacingRetention) || overallScore))
    );
    const goalAlignment = Math.min(
      10,
      Math.max(1, Math.round(Number(parsed.goalAlignment) || overallScore))
    );

    const skipRatePrediction = Math.min(
      10,
      Math.max(1, Math.round(Number(parsed.skipRatePrediction) || 7))
    );
    const verdictPass = overallScore >= IDEA_SCRIPT_JUDGE_PASS_SCORE && skipRatePrediction >= 6;

    return {
      overallScore,
      hookEffectiveness,
      pacingRetention,
      goalAlignment,
      skipRatePrediction,
      verdictPass,
      criticalIssues: (parsed.criticalIssues || []).slice(0, 5),
      rewriteDirectives: (parsed.rewriteDirectives || "").trim(),
    };
  } catch (e) {
    console.warn("[Ideas] Script judge parse/LLM issue — accepting draft:", e);
    return safeFallback();
  }
}


async function scoreSkipRate(
  hookLine: string,
  filmingFormat: string | null,
  niche: string | null
): Promise<{ score: number; reason: string }> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(
            `You are an Instagram algorithm specialist. Your only job is to predict whether a viewer will skip past the first 2 seconds of a Reel based on the opening hook line. Score 1-10 where 10 = almost nobody skips (super compelling), 1 = almost everyone skips (generic/boring). Be ruthless and realistic. Return JSON only.`
          ),
        },
        {
          role: "user",
          content: `Filming format: ${filmingFormat || "talking head"}
Niche: ${niche || "general"}
Hook line (first thing the viewer sees/hears): "${hookLine}"

Score this hook for skip-rate resistance. 
Return JSON: { "score": <1-10>, "reason": "<one sentence why>" }`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "skip_rate_score",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "number" },
              reason: { type: "string" },
            },
            required: ["score", "reason"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return { score: 5, reason: "Unable to score" };
    const parsed = JSON.parse(String(raw).trim()) as { score?: number; reason?: string };
    const score = Math.min(10, Math.max(1, Math.round(Number(parsed.score) || 5)));
    return { score, reason: String(parsed.reason || "").trim() };
  } catch {
    return { score: 5, reason: "Skip rate scoring unavailable" };
  }
}


async function getViralHookExamples(opts: {
  niche: string | null;
  productionFormat: string | null;
  limit?: number;
}): Promise<Array<{
  hookPattern: string;
  hookLine: string;
  viewCount: number;
  niche: string | null;
  productionFormat: string | null;
}>> {
  try {
    const db = await getDb();
    if (!db) return [];

    const cap = opts.limit ?? 3;
    const fetchCap = cap * 6;

    // Map UI format label to DB enum (e.g. "B-Roll Voiceover" -> "b_roll_voiceover")
    const dbFormat = opts.productionFormat
      ? opts.productionFormat.toLowerCase().replace(/[\s-]/g, "_")
      : null;

    // Pool A: featuredReels — transcript stored inline on the row
    const fetchFeatured = async (viralOnly: boolean, ignoreNiche = false) => {
      const c: Parameters<typeof and>[0][] = [
        eq(featuredReels.transcriptionStatus, "completed" as any),
      ];
      if (!ignoreNiche && opts.niche) c.push(eq(featuredReels.niche, opts.niche as any));
      if (dbFormat) c.push(eq(featuredReels.productionFormat, dbFormat as any));
      if (viralOnly) c.push(eq(featuredReels.viralFlag, true));
      return db
        .select({
          hookPattern: featuredReels.hookPattern,
          transcript: featuredReels.transcript,
          segments: featuredReels.transcriptSegments,
          viewCount: featuredReels.viewCount,
          niche: featuredReels.niche,
          productionFormat: featuredReels.productionFormat,
        })
        .from(featuredReels)
        .where(and(...c))
        .orderBy(desc(featuredReels.viewCount))
        .limit(fetchCap);
    };

    // Pool B: user-spied reels — hook metadata on reels, transcript on transcriptions
    const fetchSpied = async (viralOnly: boolean, ignoreNiche = false) => {
      const c: Parameters<typeof and>[0][] = [
        eq(transcriptions.status, "completed" as any),
      ];
      if (!ignoreNiche && opts.niche) c.push(eq(reelsTable.niche, opts.niche as any));
      if (dbFormat) c.push(eq(reelsTable.productionFormat, dbFormat as any));
      if (viralOnly) c.push(eq(reelsTable.viralFlag, true));
      return db
        .select({
          hookPattern: reelsTable.hookPattern,
          transcript: transcriptions.transcript,
          segments: transcriptions.segments,
          viewCount: reelsTable.viewCount,
          niche: reelsTable.niche,
          productionFormat: reelsTable.productionFormat,
        })
        .from(reelsTable)
        .innerJoin(transcriptions, eq(transcriptions.reelId, reelsTable.id))
        .where(and(...c))
        .orderBy(desc(reelsTable.viewCount))
        .limit(fetchCap);
    };

    type RawRow = {
      hookPattern: string | null;
      transcript: string | null;
      segments: unknown;
      viewCount: number;
      niche: string | null;
      productionFormat: string | null;
    };

    let rows: RawRow[] = [];

    // Pass 1: same niche + viral (both pools in parallel)
    const [f1, s1] = await Promise.all([fetchFeatured(true), fetchSpied(true)]);
    rows = [...f1, ...s1];

    // Pass 2: same niche, any viralFlag
    if (rows.length < cap) {
      const [f2, s2] = await Promise.all([fetchFeatured(false), fetchSpied(false)]);
      rows = [...rows, ...f2, ...s2];
    }

    // Pass 3: any niche + viral (cross-niche fallback)
    if (rows.length < cap) {
      const [f3, s3] = await Promise.all([
        fetchFeatured(true, true),
        fetchSpied(true, true),
      ]);
      rows = [...rows, ...f3, ...s3];
    }

    // Sort merged pool by viewCount descending
    rows.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));

    const results: Array<{
      hookPattern: string;
      hookLine: string;
      viewCount: number;
      niche: string | null;
      productionFormat: string | null;
    }> = [];

    const seenPatterns = new Set<string>();

    for (const row of rows) {
      if (results.length >= cap) break;
      if (!row.hookPattern || !row.transcript) continue;
      // Prefer diverse patterns — skip duplicate hookPattern unless we're running out
      if (seenPatterns.has(row.hookPattern) && rows.indexOf(row) < rows.length - 1) continue;
      seenPatterns.add(row.hookPattern);

      const hookLine =
        extractHookTextFromSegments(row.segments, 3.6) ||
        row.transcript.slice(0, 150).trim();
      if (!hookLine) continue;

      results.push({
        hookPattern: row.hookPattern,
        hookLine: hookLine.slice(0, 200),
        viewCount: Number(row.viewCount ?? 0),
        niche: row.niche ?? null,
        productionFormat: row.productionFormat ?? null,
      });
    }

    return results;
  } catch (err) {
    console.warn("[Ideas] getViralHookExamples failed (non-fatal):", err);
    return [];
  }
}


async function getViralHookExamplesForIdea(
  dbNicheSlug: string | null,
  _filmingFormat: string | null,
  audienceType?: ClarificationAudienceType | null
): Promise<Array<{ hook: string; pattern: string; skipRate: number | null }>> {
  const results: Array<{ hook: string; pattern: string; skipRate: number | null }> = [];

  try {
    const db = await getDb();
    if (!db) return [];

    if (dbNicheSlug) {
      const featuredRows = await db
        .select({
          transcript: featuredReels.transcript,
          hookPattern: featuredReels.hookPattern,
          viewCount: featuredReels.viewCount,
        })
        .from(featuredReels)
        .where(
          and(
            eq(featuredReels.niche, dbNicheSlug as any),
            isNotNull(featuredReels.hookPattern),
            isNotNull(featuredReels.transcript),
            ne(featuredReels.transcriptionStatus, "failed"),
            eq(featuredReels.viralFlag, true)
          )
        )
        .orderBy(desc(featuredReels.viewCount))
        .limit(8);

      for (const row of featuredRows) {
        if (!row.transcript || !row.hookPattern) continue;
        const firstSentence = row.transcript.trim().split(/[.!?]\s/)[0]?.trim();
        if (firstSentence && firstSentence.length > 10 && firstSentence.length < 200) {
          results.push({
            hook: firstSentence,
            pattern: String(row.hookPattern),
            skipRate: row.viewCount >= 100_000 ? 8 : row.viewCount >= 10_000 ? 7 : 6,
          });
        }
      }
    }

    if (dbNicheSlug && results.length < 6) {
      const spiedRows = await db
        .select({
          transcript: transcriptions.transcript,
          hookPattern: reelsTable.hookPattern,
          threeSecondHoldRate: reelsTable.threeSecondHoldRate,
          viewCount: reelsTable.viewCount,
        })
        .from(reelsTable)
        .innerJoin(transcriptions, eq(transcriptions.reelId, reelsTable.id))
        .where(
          and(
            eq(reelsTable.niche, dbNicheSlug as any),
            isNotNull(reelsTable.hookPattern),
            isNotNull(transcriptions.transcript),
            eq(transcriptions.status, "completed" as any),
            eq(reelsTable.viralFlag, true)
          )
        )
        .orderBy(desc(reelsTable.viewCount))
        .limit(6);

      for (const row of spiedRows) {
        if (!row.transcript || !row.hookPattern) continue;
        const firstSentence = row.transcript.trim().split(/[.!?]\s/)[0]?.trim();
        if (firstSentence && firstSentence.length > 10 && firstSentence.length < 200) {
          const holdRate = row.threeSecondHoldRate ? Number(row.threeSecondHoldRate) : null;
          const skipRate =
            holdRate != null && !Number.isNaN(holdRate)
              ? Math.min(10, Math.max(6, Math.round(holdRate / 10)))
              : row.viewCount >= 50_000
                ? 7
                : 6;
          results.push({
            hook: firstSentence,
            pattern: String(row.hookPattern),
            skipRate,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[Ideas] getViralHookExamplesForIdea failed, continuing without examples:", err);
  }

  const seen = new Set<string>();
  const deduped = results
    .filter((r) => {
      const key = r.hook.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return rankHooksForAudience(deduped, audienceType ?? null).slice(0, 6);
}


async function processIdeaInBackground(ideaId: number): Promise<void> {
  try {
    await updateScriptIdea(ideaId, { status: "processing" } as any);

    const idea = await getScriptIdeaById(ideaId);
    if (!idea) {
      console.error(`[Ideas] Idea ${ideaId} not found`);
      return;
    }

    let workingVs = await setIdeaScriptProgress(ideaId, idea, "processing", "find_viral_hooks");
    const scriptIdea = { ...idea, viralStructure: workingVs };

    const creatorProfile = await getOnboardingState(scriptIdea.userId);
    const profileBlock = buildCreatorProfilePromptBlock(creatorProfile);
    const nicheContext = scriptIdea.niche ? ` in the ${scriptIdea.niche} niche` : "";
    const toneContext = scriptIdea.tone || "engaging";
    const goalBrief = ideaCreatorGoalDirectives(readScriptIdeaCreatorSlug(scriptIdea));

    const gradeLevelInstruction = scriptIdea.gradeLevel === "auto"
      ? "Choose the most appropriate reading level for the audience."
      : `Write at a Grade ${scriptIdea.gradeLevel} reading level.`;

    const filmingFormat = readScriptIdeaFilmingFormat(scriptIdea);

    const dbNicheSlug: string | null = (() => {
      const n = (scriptIdea.niche || "").toLowerCase();
      if (n) {
        const DB_NICHES = [
          "fitness", "hospitality", "food", "beauty", "fashion", "travel",
          "education", "finance", "real_estate", "tech", "lifestyle",
          "business", "marketing", "parenting", "spirituality",
        ];
        const direct = DB_NICHES.find(
          (slug) => n.includes(slug.replace("_", " ")) || n.includes(slug)
        );
        if (direct) return direct;
      }
      const profileSlugs = creatorProfile?.selectedNicheSlugs ?? [];
      const SLUG_TO_DB: Record<string, string> = {
        "health-fitness": "fitness",
        "business-entrepreneurship": "business",
        "marketing-sales": "marketing",
        "make-money-online": "business",
        "personal-finance": "finance",
        "restaurants-cafes": "hospitality",
        "food-cooking": "food",
      };
      for (const slug of profileSlugs) {
        if (SLUG_TO_DB[slug]) return SLUG_TO_DB[slug];
      }
      if (!n) return null;
      if (n.includes("restaurant") || n.includes("cafe")) return "food";
      if (n.includes("hotel") || n.includes("venue") || n.includes("hospitality")) return "hospitality";
      if (n.includes("gym") || n.includes("workout") || n.includes("health")) return "fitness";
      if (n.includes("skin") || n.includes("makeup") || n.includes("beauty")) return "beauty";
      if (n.includes("real estate") || n.includes("property")) return "real_estate";
      if (n.includes("finance") || n.includes("money") || n.includes("invest")) return "finance";
      if (n.includes("travel") || n.includes("vacation")) return "travel";
      return null;
    })();

    const lockedAudience = readTargetAudienceFromIdeaMeta(scriptIdea.viralStructure);
    const viralHookExamples = await getViralHookExamplesForIdea(
      dbNicheSlug,
      filmingFormat,
      lockedAudience?.type ?? null
    );
    workingVs = await setIdeaScriptProgress(
      ideaId,
      scriptIdea,
      "processing",
      "build_structure",
      "find_viral_hooks"
    );
    const viralHookBlock = buildViralHookBlock(viralHookExamples);

    const formatRules = buildFilmingFormatRules(filmingFormat);
    const audienceBlock = buildTargetAudiencePromptBlock(scriptIdea, creatorProfile);

    const writerRules = buildHeitWriterRules({
      profileBlock,
      audienceBlock,
      formatRules,
      goalBrief,
      filmingFormat,
    });

    const structureResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(
            "You are a senior short-form script architect at SpyReels. You build H.E.I.T. Reel structures grounded in proven patterns from real top-performing creators. Always respond with valid JSON only. Every beat must be filmable on a phone without a production crew."
          ),
        },
        {
          role: "user",
          content: buildHeitStructurePrompt({
            idea: scriptIdea.idea,
            nicheContext,
            profileBlock,
            toneContext,
            goalBrief,
            filmingFormat,
            audienceBlock,
            viralHookBlock,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: HEIT_STRUCTURE_JSON_SCHEMA,
      },
    });

    let viralStructure: Record<string, any>;
    try {
      viralStructure = normalizeHeitStructure(
        sanitizeAiOutputDeep(
          JSON.parse(
            (String(structureResponse.choices[0].message.content) || "{}")
              .replace(/```json\n?/g, "")
              .replace(/```\n?/g, "")
              .trim()
          )
        ) as Record<string, unknown>
      ) as Record<string, any>;
    } catch {
      viralStructure = { error: "Failed to parse structure", framework: HEIT_FRAMEWORK };
    }

    const suggestedTitle = viralStructure.suggestedTitle || `Script: ${scriptIdea.idea.substring(0, 60)}`;

    const goalLine = goalBrief;

    workingVs = await setIdeaScriptProgress(
      ideaId,
      { viralStructure: workingVs },
      "processing",
      "write_script",
      "build_structure"
    );

    async function draftScript(refinementBrief: string | null): Promise<string> {
      const scriptResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: withAiFormattingRules(`${writerRules}`),
          },
          {
            role: "user",
            content: buildHeitDraftUserPrompt({
              idea: scriptIdea.idea,
              nicheContext,
              viralStructure,
              viralHookBlock,
              toneContext,
              gradeLevelInstruction,
              goalLine,
              refinementBrief,
            }),
          },
        ],
      });
      return String(scriptResponse.choices[0]?.message?.content || "").trim();
    }

    let generatedScript = await draftScript(null);

    workingVs = await setIdeaScriptProgress(
      ideaId,
      { viralStructure: workingVs },
      "processing",
      "polish_hook",
      "write_script"
    );

    const hookLineForScoring = generatedScript.trim().split(/\n/)[0]?.trim() || generatedScript.slice(0, 150);
    const skipRateResult = await scoreSkipRate(hookLineForScoring, filmingFormat, scriptIdea.niche || null);

    const skipRateFailed = skipRateResult.score < 5;

    const judgeAttempts: Record<string, unknown>[] = [];

    const judgeOnce = async (draft: string, label: string) => {
      const verdict = await invokeIdeaScriptJudge({
        ideaText: scriptIdea.idea,
        nicheContext: scriptIdea.niche || "",
        creatorGoalBrief: goalBrief,
        toneContext,
        scriptDraft: draft,
        viralStructure,
      });
      judgeAttempts.push({
        phase: label,
        overallScore: verdict.overallScore,
        hookEffectiveness: verdict.hookEffectiveness,
        pacingRetention: verdict.pacingRetention,
        goalAlignment: verdict.goalAlignment,
        verdictPass: verdict.verdictPass,
        criticalIssues: verdict.criticalIssues,
        skipRateScore: label === "initial" ? skipRateResult.score : undefined,
        skipRateReason: label === "initial" ? skipRateResult.reason : undefined,
      });
      return verdict;
    };

    let verdict = await judgeOnce(generatedScript, "initial");

    let pass = verdict.verdictPass && !skipRateFailed;
    let regenCount = 0;
    while (!pass && regenCount < IDEA_SCRIPT_JUDGE_MAX_EXTRA_DRAFTS) {
      const issuesBullets =
        verdict.criticalIssues.length > 0
          ? verdict.criticalIssues.map((line, idx) => `${idx + 1}. ${line}`).join("\n")
          : "(none listed)";

      const heitHookType = readHeitHookType(viralStructure);
      const skipNote =
        skipRateFailed && regenCount === 0
          ? `\nCRITICAL: The hook scored only ${skipRateResult.score}/10 for skip-rate resistance. Reason: ${skipRateResult.reason}. Rewrite the hook entirely. Use a stronger H.E.I.T. hook type ("${heitHookType}"): context, contrarian, or intrigue.`
          : "";

      const refinement = `${verdict.rewriteDirectives.trim()}\n\nConcrete issues detected:\n${issuesBullets}${skipNote}`.trim();

      generatedScript = await draftScript(refinement || verdict.rewriteDirectives);
      verdict = await judgeOnce(generatedScript, `rewrite_${regenCount + 1}`);
      pass = verdict.verdictPass;
      regenCount += 1;
    }

    if (!generatedScript.trim()) {
      throw new Error("Generated script empty after refinement");
    }

    workingVs = await setIdeaScriptProgress(
      ideaId,
      { viralStructure: workingVs },
      "processing",
      "finalize",
      "polish_hook"
    );

    viralStructure.ideaScriptJudge = {
      attempts: judgeAttempts,
      finalOverallScore: verdict.overallScore,
      finalDecision: pass ? "pass" : "accepted_after_max_attempts",
    };
    viralStructure.ideaMeta = {
      creatorGoal: readScriptIdeaCreatorSlug(scriptIdea),
      filmingFormat: filmingFormat || "talking_head",
      dbNicheSlug,
      viralHookExamplesUsed: viralHookExamples.length,
      skipRateScore: skipRateResult.score,
      skipRateReason: skipRateResult.reason,
      framework: HEIT_FRAMEWORK,
    };

    await updateScriptIdea(ideaId, {
      generatedScript,
      generatedTitle: suggestedTitle,
      viralStructure: viralStructure as any,
      status: "completed",
    } as any);

    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(scriptIdea.userId),
      event: "idea_script_completed",
      properties: buildIdeaScriptCompletedProps({
        ideaId,
        userId: scriptIdea.userId,
        idea: scriptIdea.idea,
        niche: scriptIdea.niche,
        generatedTitle: suggestedTitle,
        generatedScript,
        viralStructure,
      }),
    });

    generateAndStoreFollowUps(ideaId).catch((err) =>
      console.error(`[Ideas] Follow-up generation failed for idea ${ideaId}:`, err)
    );

    console.log(
      `[Ideas] Script generated for idea ${ideaId}: "${suggestedTitle}" (judge ${verdict.overallScore}/10, skip-rate ${skipRateResult.score}/10, pass=${pass}, regens=${regenCount}, hookExamples=${viralHookExamples.length})`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Ideas] Failed to process idea ${ideaId}:`, message);
    const failedIdea = await getScriptIdeaById(ideaId);
    if (failedIdea) {
      void capturePostHogEvent({
        distinctId: posthogDistinctIdForUser(failedIdea.userId),
        event: "idea_script_failed",
        properties: buildIdeaScriptFailedProps({
          ideaId,
          userId: failedIdea.userId,
          idea: failedIdea.idea,
          niche: failedIdea.niche,
          errorMessage: formatIdeaScriptErrorForUser(error, "script"),
        }),
      });
    }
    await updateScriptIdea(ideaId, {
      status: "failed",
      errorMessage: formatIdeaScriptErrorForUser(error, "script"),
    } as any);
  }
}


async function pauseIdeaForFilmingFormatClarification(
  ideaId: number,
  idea: { viralStructure?: unknown }
): Promise<void> {
  const wizard = buildFilmingFormatWizard();
  const mergedVs = mergeScriptIdeaViralStructure(idea.viralStructure, {
    clarification: wizard,
    pendingQuestion: wizard.steps[0]?.question ?? "How will you film this Reel?",
    pendingQuestionType: "filming_format",
  });

  await updateScriptIdea(ideaId, {
    aiReasoning: "Quick question so your script matches how you will film it.",
    validationStatus: "validated",
    status: "awaiting_approval",
    viralStructure: mergedVs as any,
  } as any);
}


async function ensureFilmingFormatBeforeScript(
  ideaId: number,
  idea: { idea: string; filmingFormat?: string | null; viralStructure?: unknown }
): Promise<boolean> {
  if (readScriptIdeaFilmingFormat(idea)) return true;

  const inferred = inferFilmingFormatFromIdea(idea.idea);
  if (inferred) {
    const label = filmingFormatLabelFromId(inferred);
    const mergedVs = mergeScriptIdeaViralStructure(idea.viralStructure, {
      ideaMeta: { filmingFormat: label },
    });
    await updateScriptIdea(ideaId, {
      filmingFormat: label,
      viralStructure: mergedVs as any,
    } as any);
    return true;
  }

  await pauseIdeaForFilmingFormatClarification(ideaId, idea);
  console.log(`[Ideas] Paused idea ${ideaId} for filming format clarification`);
  return false;
}


function coerceIdeaValidationText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}


async function proceedToIdeaScriptGeneration(ideaId: number, idea: { userId: number }): Promise<void> {
  const recreateCheck = await checkUsageLimit(idea.userId, "recreateCount");
  if (!recreateCheck.allowed) {
    await updateScriptIdea(ideaId, {
      status: "failed",
      errorMessage: `Monthly AI script limit reached (${recreateCheck.used}/${recreateCheck.limit}). Upgrade for more.`,
    } as any);
    return;
  }
  await incrementUsage(idea.userId, "recreateCount");
  processIdeaInBackground(ideaId).catch((err) =>
    console.error(`[Ideas] Script generation failed for idea ${ideaId}:`, err)
  );
}


async function validateIdeaInBackground(ideaId: number) {
  try {
    await updateScriptIdea(ideaId, { status: "validating" } as any);
    const idea = await getScriptIdeaById(ideaId);
    if (!idea) throw new Error("Idea not found");

    let workingVs = await setIdeaScriptProgress(ideaId, idea, "validation", "read_idea");

    const onboarding = await getOnboardingState(idea.userId);
    let workingIdea = await autoLockAudienceFromContext(ideaId, { ...idea, viralStructure: workingVs }, onboarding);
    workingVs = await setIdeaScriptProgress(
      ideaId,
      workingIdea,
      "validation",
      "match_profile",
      "read_idea"
    );
    workingIdea = { ...workingIdea, viralStructure: workingVs };

    const audienceLocked = workingIdea.locked || ideaHasLockedAudience(workingIdea);
    const skipAudienceWizard = shouldSkipAudienceClarification(workingIdea.idea, onboarding);

    workingVs = await setIdeaScriptProgress(
      ideaId,
      workingIdea,
      "validation",
      "score_idea",
      "match_profile"
    );
    workingIdea = { ...workingIdea, viralStructure: workingVs };

    const needsClarification =
      !audienceLocked && !skipAudienceWizard && shouldAskCreatorContextQuestion(workingIdea.idea);

    if (needsClarification) {
      const wizard = buildClarificationWizard(workingIdea.idea, null);
      const mergedVs = mergeScriptIdeaViralStructure(workingIdea.viralStructure, {
        clarification: wizard,
        pendingQuestion: wizard.steps[0]?.question ?? "Who will watch this Reel?",
        pendingQuestionType: "audience",
      });

      await updateScriptIdea(ideaId, {
        aiSuggestion: null,
        aiReasoning: "We need one quick answer so your script speaks to the right people.",
        viralScore: 7,
        validationStatus: "validated",
        status: "awaiting_approval",
        viralStructure: mergedVs as any,
      } as any);
      console.log(
        `[Ideas] Paused idea ${ideaId} for clarification wizard (${wizard.steps.length} steps): "${wizard.steps[0]?.question}"`
      );
      return;
    }

    await updateScriptIdea(ideaId, {
      aiSuggestion: null,
      aiReasoning: "Your idea is clear. Writing your script now.",
      viralScore: 7,
      validationStatus: "validated",
      status: "validating",
      viralStructure: workingVs as any,
    } as any);

    const refreshed = await getScriptIdeaById(ideaId);
    if (!refreshed) return;
    const canProceed = await ensureFilmingFormatBeforeScript(ideaId, refreshed);
    if (!canProceed) return;

    await updateScriptIdea(ideaId, { status: "processing" } as any);
    await proceedToIdeaScriptGeneration(ideaId, refreshed);

    console.log(`[Ideas] Rule-based validation passed for idea ${ideaId}, starting script generation`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Ideas] Validation failed for idea ${ideaId}:`, message);
    await updateScriptIdea(ideaId, {
      status: "failed",
      errorMessage: formatIdeaScriptErrorForUser(error, "validation"),
    } as any);
  }
}


export const ideasRouter = router({
    /** Submit a new idea — goes through AI validation first */
    submit: protectedProcedure
      .input(z.object({
        idea: z.string().min(3).max(2000),
        niche: z.string().max(128).optional(),
        tone: z.enum(["casual", "professional", "humorous", "educational", "engaging"]).optional().default("engaging"),
        creatorGoal: z
          .enum(["balanced", "growth_virality", "personal_brand", "education_authority", "warm_promo"])
          .optional()
          .default("balanced"),
        gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6"]).optional().default("auto"),
        inputMethod: z.enum(["text", "voice", "video"]).optional().default("text"),
        audioUrl: z.string().optional(),
        filmingFormat: z.string().max(128).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ideaId = await createScriptIdea({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          idea: input.idea,
          niche: input.niche || null,
          tone: input.tone,
          viralStructure: { ideaMeta: { creatorGoal: input.creatorGoal } },
          gradeLevel: input.gradeLevel,
          inputMethod: input.inputMethod,
          audioUrl: input.audioUrl || null,
          filmingFormat: input.filmingFormat || null,
          status: "validating",
          validationStatus: "pending",
        } as any);

        // Trigger AI validation in background
        validateIdeaInBackground(ideaId).catch(err =>
          console.error(`[Ideas] Validation failed for idea ${ideaId}:`, err)
        );

        return { id: ideaId, status: "validating" as const };
      }),

    /** Transcribe voice/video recording into text */
    transcribeVoice: protectedProcedure
      .input(z.object({
        audioBase64: z.string(), // base64 encoded audio data
        mimeType: z.string().default("audio/webm"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Decode base64 to buffer and upload to S3
        const audioBuffer = Buffer.from(input.audioBase64, "base64");
        const ext = input.mimeType.includes("webm") ? "webm" : input.mimeType.includes("mp4") ? "m4a" : "webm";
        const key = `voice-ideas/${ctx.user.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
        const { url: audioUrl } = await storagePut(key, audioBuffer, input.mimeType);

        // Transcribe using Whisper
        const result = await transcribeAudio({
          audioUrl,
          language: "en",
          prompt: "Transcribe the user's Instagram Reel content idea",
        });

        if ("error" in result) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Transcription failed",
          });
        }

        return { text: result.text, audioUrl };
      }),

    /** Accept the AI suggestion and proceed to script generation */
    approve: protectedProcedure
      .input(z.object({
        ideaId: z.number(),
        action: z.enum(["accept", "reject", "edit", "clarify"]),
        editedIdea: z.string().optional(),
        clarificationAnswers: z.record(z.string(), z.string()).optional(),
        clarificationCustom: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const idea = await assertIdeaInWorkspace(input.ideaId, ctx);
        if (idea.status !== "awaiting_approval") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Idea is not awaiting approval" });
        }

        if (input.action === "reject") {
          await updateScriptIdea(input.ideaId, {
            validationStatus: "rejected",
            status: "failed",
            errorMessage: "Idea rejected by user",
          } as any);
          return { status: "rejected" as const };
        }

        if (input.action === "clarify" && input.clarificationAnswers) {
          const vs = idea.viralStructure as Record<string, unknown> | null;
          const wizardRaw = vs?.clarification;
          if (!wizardRaw || typeof wizardRaw !== "object" || !Array.isArray((wizardRaw as IdeaClarificationWizard).steps)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "No clarification wizard on this idea" });
          }
          const wizard = wizardRaw as IdeaClarificationWizard;
          const formatted = formatClarificationAnswers(
            idea.idea,
            wizard,
            input.clarificationAnswers,
            input.clarificationCustom
          );
          const filmingRaw = input.clarificationAnswers.filming_format?.trim();
          const filmingLabel = filmingRaw
            ? filmingFormatLabelFromId(filmingRaw)
            : undefined;
          const mergedVs = mergeScriptIdeaViralStructure(idea.viralStructure, {
            ideaMeta: {
              targetAudience: formatted.targetAudience,
              audienceType: formatted.audienceType,
              clarificationAnswers: formatted.answerSummary,
              ...(filmingLabel ? { filmingFormat: filmingLabel } : {}),
            },
            pendingQuestion: undefined,
            pendingQuestionType: undefined,
            clarification: undefined,
          });
          delete mergedVs.pendingQuestion;
          delete mergedVs.pendingQuestionType;
          delete mergedVs.clarification;

          await updateScriptIdea(input.ideaId, {
            idea: formatted.enrichedIdea,
            validationStatus: "edited",
            status: "validating",
            aiSuggestion: null,
            aiReasoning: null,
            viralStructure: mergedVs as any,
            ...(filmingLabel ? { filmingFormat: filmingLabel } : {}),
          } as any);

          validateIdeaInBackground(input.ideaId).catch(err =>
            console.error(`[Ideas] Re-validation after clarification failed for idea ${input.ideaId}:`, err)
          );

          return { status: "validating" as const };
        }

        if (input.action === "edit" && input.editedIdea) {
          // User edited the idea — re-validate the edited version (back-and-forth loop)
          // No usage credit charged for re-validation, only for final script generation
          await updateScriptIdea(input.ideaId, {
            idea: input.editedIdea,
            validationStatus: "edited",
            status: "validating",
            aiSuggestion: null,
            aiReasoning: null,
          } as any);

          // Re-validate instead of generating script — creates a proper feedback loop
          validateIdeaInBackground(input.ideaId).catch(err =>
            console.error(`[Ideas] Re-validation failed for idea ${input.ideaId}:`, err)
          );

          return { status: "validating" as const };
        }

        // Check usage limit before generating script (only for accept action)
        const recreateCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
        if (!recreateCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly AI script limit (${recreateCheck.used}/${recreateCheck.limit}). Upgrade to ${recreateCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "recreateCount");

        {
          // Accept — use AI suggestion as the idea if available
          const finalIdea = idea.aiSuggestion || idea.idea;
          await updateScriptIdea(input.ideaId, {
            idea: finalIdea,
            validationStatus: "accepted",
            status: "queued",
          } as any);
        }

        // Now generate the script (only for accept action)
        processIdeaInBackground(input.ideaId).catch(err =>
          console.error(`[Ideas] Background processing failed for idea ${input.ideaId}:`, err)
        );

        return { status: "queued" as const };
      }),

    /** Submit multiple ideas at once (batch mode) */
    submitBatch: protectedProcedure
      .input(z.object({
        ideas: z.array(z.object({
          idea: z.string().min(3).max(2000),
          niche: z.string().max(128).optional(),
        })).min(1).max(20),
        tone: z.enum(["casual", "professional", "humorous", "educational", "engaging"]).optional().default("engaging"),
        creatorGoal: z
          .enum(["balanced", "growth_virality", "personal_brand", "education_authority", "warm_promo"])
          .optional()
          .default("balanced"),
        gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6"]).optional().default("auto"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user has enough quota for all ideas
        const recreateCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
        const remaining = recreateCheck.limit - recreateCheck.used;
        if (remaining < input.ideas.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You can only generate ${remaining} more scripts this month (trying to submit ${input.ideas.length}). Upgrade for more.`,
          });
        }

        const results: { id: number; idea: string }[] = [];
        for (const item of input.ideas) {
          await incrementUsage(ctx.user.id, "recreateCount");
          const ideaId = await createScriptIdea({
            userId: ctx.user.id,
            workspaceId: ctx.workspaceId,
            idea: item.idea,
            niche: item.niche || null,
            tone: input.tone,
            viralStructure: { ideaMeta: { creatorGoal: input.creatorGoal } },
            gradeLevel: input.gradeLevel,
          });
          results.push({ id: ideaId, idea: item.idea });
          // Trigger background generation for each
          processIdeaInBackground(ideaId).catch(err =>
            console.error(`[Ideas] Background processing failed for idea ${ideaId}:`, err)
          );
        }

        return { submitted: results.length, ideas: results };
      }),

    /** Get all ideas for the current user */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getScriptIdeasByWorkspace(ctx.workspaceId);
    }),

    /** Get a single idea by ID */
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return assertIdeaInWorkspace(input.id, ctx);
      }),

    /** Save a completed idea's script to My Scripts (auto schedule, tag, caption in background) */
    saveToScripts: protectedProcedure
      .input(
        z.object({
          ideaId: z.number(),
          addToCalendar: z.boolean().optional().default(true),
          calendarHint: z.string().max(200).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const idea = await assertIdeaInWorkspace(input.ideaId, ctx);
        if (idea.status !== "completed" || !idea.generatedScript) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Script not ready yet" });
        }

        const schedule = input.addToCalendar
          ? parseCalendarHint(input.calendarHint)
          : null;
        const plannedLabel = schedule
          ? formatPlannedPostLabel(schedule.postDate, schedule.postTime)
          : null;

        if (idea.savedScriptId) {
          return {
            savedScriptId: idea.savedScriptId,
            alreadySaved: true,
            assistantMessage: buildSaveAssistantMessage(plannedLabel),
            plannedPostLabel: plannedLabel,
          };
        }

        const title = idea.generatedTitle || `Script: ${idea.idea.substring(0, 60)}`;
        const content = idea.generatedScript;
        const wordCount = content.split(/\s+/).filter(Boolean).length;

        await ensureDefaultTags(ctx.workspaceId, ctx.user.id);
        const savedScriptId = await createSavedScript({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          title,
          content,
          originalContent: content,
          sourceHandle: "idea",
          gradeLevel: idea.gradeLevel || "auto",
          wordCount,
          postDate: schedule?.postDate ?? null,
          postTime: schedule?.postTime ?? null,
          status: "draft",
        });

        await createScriptVersion({
          scriptId: savedScriptId,
          content,
          versionNumber: 1,
          changeType: "initial",
          changeDescription: `Generated from idea: ${idea.idea.substring(0, 100)}`,
        });

        await assignScriptingTag(savedScriptId, ctx.workspaceId, ctx.user.id);
        await updateScriptIdea(input.ideaId, { savedScriptId });

        enrichIdeaSavedScriptInBackground(savedScriptId, content).catch((err) =>
          console.error(`[Ideas] Background caption failed for script ${savedScriptId}:`, err)
        );

        const assistantMessage = buildSaveAssistantMessage(plannedLabel);

        return {
          savedScriptId,
          alreadySaved: false,
          assistantMessage,
          plannedPostLabel: plannedLabel,
        };
      }),

    /** AI follow-up suggestions for a completed idea script */
    getFollowUps: protectedProcedure
      .input(z.object({ ideaId: z.number() }))
      .query(async ({ ctx, input }) => {
        const idea = await assertIdeaInWorkspace(input.ideaId, ctx);
        if (idea.status !== "completed" || !idea.generatedScript?.trim()) {
          return { followUps: [] as string[] };
        }

        const cached = readFollowUpsFromIdeaMeta(idea.viralStructure);
        if (cached?.length) return { followUps: cached };

        try {
          const profile = await getOnboardingState(ctx.user.id);
          const profileContext = [
            profile?.businessDescription?.trim()
              ? `Business: ${profile.businessDescription.trim()}`
              : null,
            profile?.targetAudience?.trim()
              ? `Audience: ${profile.targetAudience.trim()}`
              : null,
          ]
            .filter(Boolean)
            .join("\n");

          const followUps = await generateIdeaFollowUps(
            idea.idea,
            idea.generatedScript,
            idea.generatedTitle,
            profileContext || null
          );
          if (followUps.length > 0) {
            const merged = mergeScriptIdeaViralStructure(idea.viralStructure, {
              ideaMeta: { followUps },
            });
            await updateScriptIdea(input.ideaId, { viralStructure: merged as any });
          }
          return { followUps };
        } catch (err) {
          console.error(`[Ideas] getFollowUps failed for idea ${input.ideaId}:`, err);
          return { followUps: [] as string[] };
        }
      }),

    /** Delete an idea */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertIdeaInWorkspace(input.id, ctx);
        await deleteScriptIdea(input.id);
        return { success: true };
      }),

    /** Retry a failed idea — re-validate or re-generate */
    retry: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const idea = await assertIdeaInWorkspace(input.id, ctx);
        if (idea.status !== "failed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only failed ideas can be retried" });
        }
        // If it failed during validation, re-validate; otherwise re-generate
        if (!idea.validationStatus || idea.validationStatus === "pending") {
          await updateScriptIdea(input.id, { status: "validating", errorMessage: null, validationStatus: "pending" } as any);
          validateIdeaInBackground(input.id).catch(err =>
            console.error(`[Ideas] Retry validation failed for idea ${input.id}:`, err)
          );
        } else {
          await updateScriptIdea(input.id, { status: "queued", errorMessage: null } as any);
          processIdeaInBackground(input.id).catch(err =>
            console.error(`[Ideas] Retry failed for idea ${input.id}:`, err)
          );
        }
        return { status: "queued" as const };
      }),
});
