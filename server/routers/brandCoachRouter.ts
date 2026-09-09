import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { featuredAccounts, users } from "../../drizzle/schema";
import type { Reel } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { assertUserScrapeReelInWorkspace } from "../assertUserScrapeReelInWorkspace";
import { getBrandCoachScoreByReelId, getBrandCoachScoreByFeaturedReelId, getBrandCoachScoresBatch, getTranscriptionByReelId, getFeaturedReelById, getReelById, createTranscription, updateFeaturedReelTranscription, getScrapeJob, getDb, deleteBrandCoachScoreByReelId, deleteBrandCoachScoreByFeaturedReelId, createBrandCoachScore } from "../db";
import { getUserSubscription, checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "../utils/sanitizeAiOutput";
import { or, not, and, eq, like } from "drizzle-orm";
import { extractHookTextFromSegments, runFeaturedReelTranscription, runTranscription } from "./_shared";

type BrandCoachVerdict = "viral" | "strong" | "average" | "weak";

function brandCoachCacheIsFresh(row: { scoreVersion?: number | null }): boolean {
  return (row.scoreVersion ?? 0) >= BRAND_COACH_SCORE_VERSION;
}


function durationBucketLabel(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 15) return "under_15s (ultra-short; every word must earn attention)";
  if (sec <= 30) return "15_30s (common viral slot)";
  if (sec <= 60) return "30_60s (needs strong mid-rehooks)";
  return "over_60s (needs exceptional density and payoff)";
}


const BRAND_COACH_SCORE_VERSION = 3 as const; // keep in sync with client BrandCoachBadge BRAND_COACH_SCORE_VERSION

interface BrandCoachAnalysis {
  overallScore: number;
  hookScore: number;
  retentionScore: number;
  payoffScore: number;
  replicabilityScore: number;
  verdict: BrandCoachVerdict;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  reasoning: string;
}


function verdictForScore(score: number): BrandCoachVerdict {
  if (score >= 85) return "viral";
  if (score >= 70) return "strong";
  if (score >= 50) return "average";
  return "weak";
}


function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}


function clampCoachLine(s: string, maxLen: number): string {
  const t = s
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*–\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t.length <= maxLen) return t;
  const budget = maxLen - 3;
  const cut = t.slice(0, budget);
  const dot = cut.lastIndexOf(". ");
  if (dot >= Math.floor(budget * 0.35)) return cut.slice(0, dot + 1).trim();
  const sp = cut.lastIndexOf(" ");
  return (sp > 24 ? cut.slice(0, sp) : cut).trim() + "...";
}


async function runBrandCoachLLM(input: {
  caption: string | null;
  transcript: string | null;
  hookText: string | null;
  ownerUsername: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number | null;
  duration: number | null;
  niche: string | null;
  hookPattern: string | null;
  followerCount: number | null;
  commentToLikeRatio: number | null;
  viewsToFollowersRatio: number | null;
  durationBucket: string | null;
}): Promise<BrandCoachAnalysis> {
  const transcriptSection = input.transcript?.trim()
    ? `Full transcript (recorded speech):\n"${input.transcript.trim().slice(0, 4000)}"`
    : `(No usable transcript. Score from caption + metrics only. State lower confidence on hook and payoff.)`;

  const hookLine = input.hookText?.trim()
    ? `First ~3 seconds of speech (from timed transcript segments):\n"${input.hookText.trim().slice(0, 600)}"`
    : `(No timed hook extract. If a full transcript exists above, infer the opener from its start; otherwise grade hook mainly from caption and pacing hints.)`;

  const followerLine =
    input.followerCount != null && input.followerCount > 0
      ? `Account follower count (approximate): ${input.followerCount.toLocaleString()}`
      : `Account follower count: unknown (do not infer audience size from the username alone)`;

  const vfrLine =
    input.viewsToFollowersRatio != null
      ? `Views per follower on this reel (computed): ${input.viewsToFollowersRatio.toFixed(3)} (higher usually means stronger breakout vs existing audience)`
      : `Views per follower: not computable (missing follower count)`;

  const clrLine =
    input.commentToLikeRatio != null
      ? `Comments per like (computed): ${input.commentToLikeRatio.toFixed(4)} (higher often means debate, story stakes, or save-worthy tension)`
      : `Comments per like: not computable (no likes on record)`;

  const metricsSection = [
    `Owner: @${input.ownerUsername ?? "unknown"}`,
    followerLine,
    `Views: ${input.viewCount.toLocaleString()}`,
    `Likes: ${input.likeCount.toLocaleString()}`,
    `Comments: ${input.commentCount.toLocaleString()}`,
    vfrLine,
    clrLine,
    input.engagementRate != null
      ? `Engagement rate (likes + comments + shares proxy, as stored): ${input.engagementRate.toFixed(2)}%`
      : null,
    input.duration != null && input.duration > 0
      ? `Duration: ${input.duration}s`
      : null,
    input.durationBucket ? `Duration bucket: ${input.durationBucket}` : null,
    input.niche ? `Niche: ${input.niche}` : null,
    input.hookPattern ? `Hook pattern (auto-classified label): ${input.hookPattern}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `You are Brand Coach, a senior Instagram Reels strategist and short-form editor. Score ONE reel for viral TEMPLATE quality: how strong the hook, retention, payoff, and replicability are if a solo creator remade the idea with a phone.

You are not predicting guaranteed views. You judge structure, clarity, and repeatability. Penalize luck-only wins: huge views with weak structure still score lower. Reward sharp structure even with modest views.

OVERALL (0-100) must blend hook, retention, payoff, and replicability. Give replicability roughly one quarter of your mental weight: a reel that needs a film crew, rare location, or A-list identity is a weaker template for most SpyReels users.

ANCHOR BANDS (overall and sub-scores):
- 85-100: elite pattern, would teach this in a workshop
- 70-84: strong, clear template worth borrowing
- 50-69: mixed, needs one major rewrite axis
- 0-49: weak template or high copy risk

SUB-SCORES (each 0-100):
- hookScore: first 1-3 seconds. Use HOOK TEXT when provided; otherwise caption first line + metrics. Map to patterns: curiosity gap, contrarian, specificity or numbers, bold claim, question, open loop, pattern interrupt, "you" callout, mistake reveal, comparison, listicle promise, confession, POV.
- retentionScore: middle holds attention. Look for chained open loops, escalating stakes, info density, payoff teases, mid-point re-hook, clear one-idea-per-beat progression. If transcript is missing, infer cautiously from caption length, numbers, and comment-to-like ratio.
- payoffScore: ending lands. Types: insight payoff, emotional payoff, twist, comment-bait (intentional tension), transformation, clear CTA, loop-back to the opening line (rewatch bait). Penalize abrupt stops with no resolution.
- replicabilityScore: can a typical solo creator reproduce the FORMAT this week without a big budget? Penalize heavy production, rare props, location dependency, cast size, faceless brand-only shots that need a full team, or identity that is not borrowable. Reward simple talking-head + b-roll, one-location, repeatable series formats.

ENGAGEMENT RATE (if present) is total engagement over views as stored in our app. Rough calibration for Reels (not universal): below 1% weak, 1-3% typical, 3-5% strong, above 5% excellent for non-fanbase reach. Mention this only if it helps; do not worship a single metric.

VIEWS PER FOLLOWER: above 0.5 often means strong breakout for that account size; above 1.0 is exceptional. Below 0.05 may mean mostly followers or older reach; do not call a reel "viral template" on reach alone.

UI COPY LIMITS (strict, the product shows this on a phone):
- strengths, weaknesses, suggestions: exactly 2 or 3 strings each. Each string is ONE short sentence, max 20 words. No second sentence. No semicolons. Lead with the insight, not setup like "This reel" or "The creator".
- reasoning: max 3 short sentences, max 70 words total. Punchy, no recap filler.

Never say "great content" or parrot the caption.

STYLE RULES (strict):
- Never use em dashes (—) or en dashes (–). Use commas, periods, semicolons, or parentheses instead.
- Use straight ASCII punctuation only.
- No filler phrases like "in conclusion", "overall", "it is worth noting".`;

  const userPrompt = `Reel caption:
"${(input.caption ?? "(no caption)").slice(0, 1500)}"

${hookLine}

${transcriptSection}

Metrics:
${metricsSection}

Score this reel. Return structured JSON with all sub-scores plus overallScore.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: withAiFormattingRules(systemPrompt) },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "brand_coach_score",
        strict: true,
        schema: {
          type: "object",
          properties: {
            overallScore: { type: "number", description: "0-100 blended weighted score" },
            hookScore: { type: "number", description: "0-100 first 1-3 seconds" },
            retentionScore: { type: "number", description: "0-100 middle holds attention" },
            payoffScore: { type: "number", description: "0-100 ending lands" },
            replicabilityScore: {
              type: "number",
              description: "0-100 solo creator can copy the format this week",
            },
            strengths: {
              type: "array",
              items: { type: "string" },
              description: "2-3 bullets, each one sentence under 20 words",
            },
            weaknesses: {
              type: "array",
              items: { type: "string" },
              description: "2-3 bullets, each one sentence under 20 words",
            },
            suggestions: {
              type: "array",
              items: { type: "string" },
              description: "2-3 bullets, each one sentence under 20 words",
            },
            reasoning: {
              type: "string",
              description: "Max 70 words, max 3 short sentences",
            },
          },
          required: [
            "overallScore",
            "hookScore",
            "retentionScore",
            "payoffScore",
            "replicabilityScore",
            "strengths",
            "weaknesses",
            "suggestions",
            "reasoning",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No response from Brand Coach LLM");
  const text = typeof raw === "string" ? raw : "";
  const parsed = sanitizeAiOutputDeep(
    JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
  );

  const overallScore = clampScore(parsed.overallScore);
  const hookScore = clampScore(parsed.hookScore);
  const retentionScore = clampScore(parsed.retentionScore);
  const payoffScore = clampScore(parsed.payoffScore);
  const replicabilityScore = clampScore(parsed.replicabilityScore);

  const stripDashes = (s: string): string =>
    s
      .replace(/\s*—\s*/g, ", ")
      .replace(/\s*–\s*/g, ", ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+,/g, ",")
      .trim();

  const sanitizeBullets = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((v) =>
        typeof v === "string" ? clampCoachLine(stripDashes(v.trim()), 160) : ""
      )
      .filter((s) => s.length > 0)
      .slice(0, 4);
  };

  return {
    overallScore,
    hookScore,
    retentionScore,
    payoffScore,
    replicabilityScore,
    verdict: verdictForScore(overallScore),
    strengths: sanitizeBullets(parsed.strengths),
    weaknesses: sanitizeBullets(parsed.weaknesses),
    suggestions: sanitizeBullets(parsed.suggestions),
    reasoning:
      typeof parsed.reasoning === "string"
        ? clampCoachLine(stripDashes(parsed.reasoning.trim()), 360)
        : "",
  };
}


export const brandCoachRouter = router({
    /** Fetch a cached score for a single reel (no LLM call). */
    get: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().int().positive().optional(),
            featuredReelId: z.number().int().positive().optional(),
          })
          .refine((d) => d.reelId != null || d.featuredReelId != null, {
            message: "reelId or featuredReelId is required",
          })
      )
      .query(async ({ input }) => {
        if (input.reelId != null) {
          return (await getBrandCoachScoreByReelId(input.reelId)) ?? null;
        }
        return (await getBrandCoachScoreByFeaturedReelId(input.featuredReelId!)) ?? null;
      }),

    /** Batch fetch cached scores for many reels at once (dashboard render). */
    getBatch: protectedProcedure
      .input(
        z.object({
          reelIds: z.array(z.number().int().positive()).optional(),
          featuredReelIds: z.array(z.number().int().positive()).optional(),
        })
      )
      .query(async ({ input }) => {
        return getBrandCoachScoresBatch({
          reelIds: input.reelIds,
          featuredReelIds: input.featuredReelIds,
        });
      }),

    /**
     * Score a reel. Pro+ only. Cached per reel; rows below the current
     * rubric version are re-scored on the next click.
     */
    score: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().int().positive().optional(),
            featuredReelId: z.number().int().positive().optional(),
          })
          .refine((d) => d.reelId != null || d.featuredReelId != null, {
            message: "reelId or featuredReelId is required",
          })
      )
      .mutation(async ({ ctx, input }) => {
        const sub = await getUserSubscription(ctx.user.id);
        const allowed = new Set(["pro", "business", "agency"]);
        if (!allowed.has(sub.plan)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Brand Coach is a Pro feature. Upgrade to score Reels for viral potential.",
          });
        }

        // Cache: fresh rows match the current rubric (scoreVersion).
        const cached = input.reelId != null
          ? await getBrandCoachScoreByReelId(input.reelId)
          : await getBrandCoachScoreByFeaturedReelId(input.featuredReelId!);
        if (cached && brandCoachCacheIsFresh(cached)) return cached;

        let caption: string | null = null;
        let ownerUsername: string | null = null;
        let viewCount = 0;
        let likeCount = 0;
        let commentCount = 0;
        let engagementRate: number | null = null;
        let duration: number | null = null;
        let niche: string | null = null;
        let hookPattern: string | null = null;
        let transcript: string | null = null;
        // True if a transcription was already attempted (any status). Lets
        // us skip retrying known-failed or no-speech reels in the auto
        // transcribe step below.
        let priorTranscribeAttempt = false;

        if (input.reelId != null) {
          const reel = await assertUserScrapeReelInWorkspace(input.reelId, ctx);
          caption = reel.caption ?? null;
          ownerUsername = reel.ownerUsername ?? null;
          viewCount = Number(reel.viewCount ?? 0);
          likeCount = Number(reel.likeCount ?? 0);
          commentCount = Number(reel.commentCount ?? 0);
          engagementRate =
            reel.engagementRate != null ? Number(reel.engagementRate) : null;
          duration = reel.duration ?? null;
          niche = reel.niche ?? null;
          hookPattern = reel.hookPattern ?? null;

          const tx = await getTranscriptionByReelId(input.reelId);
          if (tx) {
            priorTranscribeAttempt = true;
            if (tx.status === "completed" && tx.transcript) {
              transcript = tx.transcript;
            }
          }
        } else {
          const fr = await getFeaturedReelById(input.featuredReelId!);
          if (!fr) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Reel not found" });
          }
          caption = fr.caption ?? null;
          ownerUsername = null;
          viewCount = Number(fr.viewCount ?? 0);
          likeCount = Number(fr.likeCount ?? 0);
          commentCount = Number(fr.commentCount ?? 0);
          engagementRate =
            fr.engagementRate != null ? Number(fr.engagementRate) : null;
          duration = fr.duration ?? null;
          niche = fr.niche ?? null;
          hookPattern = fr.hookPattern ?? null;
          if (fr.transcriptionStatus != null) {
            priorTranscribeAttempt = true;
          }
          if (fr.transcriptionStatus === "completed" && fr.transcript) {
            transcript = fr.transcript;
          }
        }

        // ── Auto-transcribe before scoring (best-effort) ──
        // Transcripts dramatically improve hook and payoff accuracy
        // because the LLM can grade what was actually said instead of
        // inferring from the caption. When the reel has never been
        // transcribed we run the same Deepgram pipeline that the manual
        // Transcribe button uses, then fall through to the LLM with a
        // fuller picture. Any failure here (quota exhausted, no speech,
        // vendor flake) is non-blocking: we still score from caption
        // and engagement signals so the click never returns empty.
        if (transcript == null && !priorTranscribeAttempt) {
          try {
            const txCheck = await checkUsageLimit(
              ctx.user.id,
              "transcribeCount",
              ctx.user.openId
            );
            if (txCheck.allowed) {
              await incrementUsage(ctx.user.id, "transcribeCount");
              if (input.reelId != null) {
                const reel = await getReelById(input.reelId);
                if (reel) {
                  const transcriptionId = await createTranscription({
                    reelId: input.reelId,
                    status: "processing",
                    queuedAt: new Date(),
                  });
                  await runTranscription(transcriptionId, {
                    id: reel.id,
                    shortcode: reel.shortcode,
                    videoUrl: reel.videoUrl,
                    caption: reel.caption,
                    thumbnailUrl: reel.thumbnailUrl,
                  });
                  const refreshed = await getTranscriptionByReelId(input.reelId);
                  if (
                    refreshed?.status === "completed" &&
                    refreshed.transcript
                  ) {
                    transcript = refreshed.transcript;
                  }
                }
              } else {
                const fr = await getFeaturedReelById(input.featuredReelId!);
                if (fr) {
                  await updateFeaturedReelTranscription(fr.id, {
                    transcriptionStatus: "processing",
                  });
                  await runFeaturedReelTranscription({
                    id: fr.id,
                    shortcode: fr.reelShortcode,
                    videoUrl: fr.videoUrl,
                  });
                  const refreshed = await getFeaturedReelById(
                    input.featuredReelId!
                  );
                  if (
                    refreshed?.transcriptionStatus === "completed" &&
                    refreshed.transcript
                  ) {
                    transcript = refreshed.transcript;
                  }
                }
              }
            }
          } catch (err) {
            console.warn(
              `[brandCoach.score] auto-transcribe failed for ${
                input.reelId != null
                  ? `reel ${input.reelId}`
                  : `featured ${input.featuredReelId}`
              }:`,
              err
            );
          }
        }

        // Final transcript + timed hook extract + follower context (after any auto-transcribe).
        let hookText: string | null = null;
        let followerCount: number | null = null;

        if (input.reelId != null) {
          const reelForSignals = await getReelById(input.reelId);
          if (reelForSignals && reelForSignals.jobId > 0) {
            const job = await getScrapeJob(reelForSignals.jobId);
            const fc = job?.followerCount ?? 0;
            if (fc > 0) followerCount = fc;
          }
          const txFinal = await getTranscriptionByReelId(input.reelId);
          if (txFinal?.status === "completed" && typeof txFinal.transcript === "string") {
            transcript = txFinal.transcript;
          }
          hookText = extractHookTextFromSegments(txFinal?.segments ?? null);
        } else {
          const frFinal = await getFeaturedReelById(input.featuredReelId!);
          if (frFinal) {
            if (
              frFinal.transcriptionStatus === "completed" &&
              typeof frFinal.transcript === "string"
            ) {
              transcript = frFinal.transcript;
            }
            hookText = extractHookTextFromSegments(frFinal.transcriptSegments ?? null);
            const db = await getDb();
            if (db) {
              const acc = await db
                .select({ followerCount: featuredAccounts.followerCount })
                .from(featuredAccounts)
                .where(eq(featuredAccounts.id, frFinal.featuredAccountId))
                .limit(1);
              const fc = acc[0]?.followerCount ?? 0;
              if (fc > 0) followerCount = fc;
            }
          }
        }

        const commentToLikeRatio = likeCount > 0 ? commentCount / likeCount : null;
        const viewsToFollowersRatio =
          followerCount != null && followerCount > 0
            ? viewCount / followerCount
            : null;
        const durationBucket = durationBucketLabel(duration);

        const analysis = await runBrandCoachLLM({
          caption,
          transcript,
          hookText,
          ownerUsername,
          viewCount,
          likeCount,
          commentCount,
          engagementRate,
          duration,
          niche,
          hookPattern,
          followerCount,
          commentToLikeRatio,
          viewsToFollowersRatio,
          durationBucket,
        });

        try {
          if (cached && !brandCoachCacheIsFresh(cached)) {
            if (input.reelId != null) {
              await deleteBrandCoachScoreByReelId(input.reelId);
            } else {
              await deleteBrandCoachScoreByFeaturedReelId(input.featuredReelId!);
            }
          }
          await createBrandCoachScore({
            reelId: input.reelId ?? null,
            featuredReelId: input.featuredReelId ?? null,
            requestedByUserId: ctx.user.id,
            overallScore: analysis.overallScore,
            hookScore: analysis.hookScore,
            retentionScore: analysis.retentionScore,
            payoffScore: analysis.payoffScore,
            replicabilityScore: analysis.replicabilityScore,
            scoreVersion: BRAND_COACH_SCORE_VERSION,
            verdict: analysis.verdict,
            strengths: analysis.strengths,
            weaknesses: analysis.weaknesses,
            suggestions: analysis.suggestions,
            reasoning: analysis.reasoning,
            usedTranscript: Boolean(transcript && transcript.trim().length > 0),
          });
        } catch (err) {
          // Race - another caller scored the same reel between our cache
          // check and insert. Return the winning row.
          const winner = input.reelId != null
            ? await getBrandCoachScoreByReelId(input.reelId)
            : await getBrandCoachScoreByFeaturedReelId(input.featuredReelId!);
          if (winner) return winner;
          throw err;
        }

        const fresh = input.reelId != null
          ? await getBrandCoachScoreByReelId(input.reelId)
          : await getBrandCoachScoreByFeaturedReelId(input.featuredReelId!);
        return fresh!;
      }),
});
