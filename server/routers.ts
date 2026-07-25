import { COOKIE_NAME } from "@shared/const";
import { EXPORT_SCOPES, resolveExportScope } from "@shared/exportScope";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminPanelProcedure, router } from "./_core/trpc";
import { workspacesRouter } from "./routers/workspacesRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  normalizeInstagramHandle,
  isValidInstagramHandleNormalized,
  INSTAGRAM_HANDLE_INVALID_MESSAGE,
} from "@shared/instagramHandle";
import { REEL_NICHE_VALUES } from "@shared/reelNiches";
import {
  buildClarificationWizard,
  buildFilmingFormatWizard,
  filmingFormatLabelFromId,
  formatClarificationAnswers,
  inferAudienceFromIdea,
  audienceLockFromProfile,
  ideaHasLockedAudience,
  inferFilmingFormatFromIdea,
  rankHooksForAudience,
  readTargetAudienceFromIdeaMeta,
  readFollowUpsFromIdeaMeta,
  shouldSkipAudienceClarification,
  type ClarificationAudienceType,
  type IdeaClarificationWizard,
} from "../shared/ideaClarification";
import {
  inferAudienceFromText,
  inferNicheFromText,
} from "../shared/creatorContextInference";

const reelNicheInputEnum = z.enum(
  REEL_NICHE_VALUES as unknown as [string, ...string[]]
);
import { classifyScrapeFailureMessage } from "./scrapeFailureReason";
import { accountEngagementRatePercent } from "./accountEngagementRate";
import {
  createCheckoutSession,
  createPortalSession,
  getUserSubscription,
  getMonthlyUsage,
  checkUsageLimit,
  incrementUsage,
  decrementUsage,
} from "./stripe/stripe-service";
import { PLANS, getPlanLimits, isUnlimited } from "./stripe/products";
import type { PlanId, BillingInterval } from "./stripe/products";
import { hasUnlimitedUsage } from "./usageBypass";
import {
  countCombinedDiscoverySearchesThisMonth,
  countSucceededSearchesThisMonth,
} from "./discovery/db";
import { countViralityDiagnosticJobsThisMonth } from "./virality/db";
import { runViralityDiagnosticJob } from "./virality/runJob";
import { runTikTokScrapeJob } from "./tiktokScrape/runJob";
import { runTikTokTranscription } from "./tiktokScrape/runTranscription";
import { runYouTubeScrapeJob } from "./youtubeScrape/runJob";
import { fetchYouTubeTranscript } from "./youtube";
import { discoveryProcedure } from "./discovery/trpc";
import { outreachRouter } from "./outreach/router";
import { founderInterviewRouter } from "./founderInterview/router";
import { featureRequestRouter } from "./featureRequest/router";
import { coachScriptFeedbackRouter } from "./coachScriptFeedback/router";
import { planRouter, studioRouter } from "./routers/planCoachRouter";
import { audienceResearchRouter } from "./routers/audienceResearchRouter";
import {
  buildPanelUserReport,
  panelUserFiltersSchema,
} from "./adminUserMetrics";
import {
  buildTrafficConversionReport,
  trafficReportFiltersSchema,
} from "./adminTrafficMetrics";
import {
  buildCoachScriptQualityDownload,
  buildCoachScriptQualityReport,
  coachScriptQualityFiltersSchema,
} from "./adminCoachScriptQuality";

const panelUserSummaryFiltersSchema = panelUserFiltersSchema.omit({
  limit: true,
  offset: true,
  sortBy: true,
  sortOrder: true,
});
import { routeNiche as routeNichePrompt } from "./ai/prompts/niche-routing";
import {
  inferOnboardingSlugsFromDescription,
  shouldAskCreatorContextQuestion,
} from "../shared/onboardingDescription";
import { mergeInferredNicheSlugs } from "../shared/primaryNiche";
import {
  assignScriptingTag,
  buildSaveAssistantMessage,
  enrichIdeaSavedScriptInBackground,
  formatPlannedPostLabel,
  generateAndStoreFollowUps,
  generateIdeaFollowUps,
  parseCalendarHint,
  pickAutoPostSchedule,
} from "./ideaScriptExtras";
import { generateSeoInstagramCaption } from "./generateSeoCaption";
import { runOnboardingStartCreating } from "./onboardingStartCreating";
import { expandHookToScript } from "./hookGeneratorExpandScript";
import { buildHookTeaserPartial } from "@shared/hookGenerator";
import { toSavedListTranscriptionSummary } from "@shared/savedListTranscription";
import type { SavedListTranscriptionSummary } from "@shared/savedListTranscription";
import { getOnboardingGenerationProgress } from "./onboardingGenerationProgress";
import { ONBOARDING_NICHES } from "@/data/onboardingNiches";
import {
  createScrapeJob,
  getScrapeJob,
  updateScrapeJob,
  getScrapeJobsByWorkspace,
  insertReels,
  getReelsByJobId,
  getReelById,
  createTranscription,
  getTranscriptionByReelId,
  getTranscriptionByTiktokVideoId,
  getTranscriptionByYoutubeVideoId,
  updateTranscription,
  getTranscriptionsByJobId,
  createRecreatedScript,
  getRecreatedScript,
  updateRecreatedScript,
  getRecreatedScriptsByReelId,
  getRecreatedScriptsByTiktokVideoId,
  getRecreatedScriptsByYoutubeVideoId,
  saveReel,
  unsaveReel,
  isReelSaved,
  getSavedReelsWithDetails,
  getSavedDiscoverReelsWithDetails,
  saveTiktokVideo,
  unsaveTiktokVideo,
  isTiktokVideoSaved,
  getSavedTiktokVideosWithDetails,
  saveYoutubeVideo,
  unsaveYoutubeVideo,
  isYoutubeVideoSaved,
  getSavedYoutubeVideosWithDetails,
  createScriptTag,
  getScriptTagsByWorkspace,
  updateScriptTag,
  deleteScriptTag,
  ensureDefaultTags,
  createSavedScript,
  getSavedScriptsByWorkspace,
  updateSavedScript,
  deleteSavedScript,
  assignTagToScript,
  removeTagFromScript,
  getTagsForScript,
  getTagsForScripts,
  getScriptsByTag,
  createScriptVersion,
  getScriptVersions,
  getLatestVersionNumber,
  getUserPreferences,
  upsertUserPreferences,
  getPublishedBlogPosts,
  getPublishedIndexableBlogPosts,
  getBlogPostBySlug,
  getAllBlogPosts,
  getBlogPostById,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  createTelegramConnection,
  getTelegramConnectionByUserId,
  updateTelegramConnection,
  deleteTelegramConnection,
  getCollectedReelsByWorkspace,
  collectedReelsColumnsForQuery,
  getCollectedReelById,
  deleteCollectedReel,
  deleteFailedCollectedReelsByWorkspace,
  createCollectedReel,
  updateCollectedReel,
  createScriptIdea,
  getScriptIdeasByWorkspace,
  getScriptIdeaById,
  updateScriptIdea,
  deleteScriptIdea,
  getQueuedScriptIdeas,
  getLibraryTranscripts,
  getLibraryScripts,
  getExistingShortcodes,
  updateReelsForJobFromScrape,
  dedupeReelsForJob,
  updateScrapeJobResync,
  deleteScrapeJob,
  countReelsForJob,
  createExportJob,
  getExportJobById,
  getActiveExportJobForScrapeJob,
  getLatestCompletedExportForScrapeJob,
  getOnboardingState,
  updateOnboardingState,
  updateUserPersonalization,
  seedDemoScrape,
  seedFeaturedReelsIntoJob,
  markOnboardingComplete,
  markOnboardingSkipped,
  getFeaturedReelById,
  getTranscriptionByFeaturedReelId,
  transcriptionViewFromFeaturedReelRow,
  updateFeaturedReelTranscription,
  getRecreatedScriptsByFeaturedReelId,
  saveFeaturedReel,
  unsaveFeaturedReel,
  isFeaturedReelSaved,
  createBrandCoachScore,
  getBrandCoachScoreByReelId,
  getBrandCoachScoreByFeaturedReelId,
  deleteBrandCoachScoreByReelId,
  deleteBrandCoachScoreByFeaturedReelId,
  getBrandCoachScoresBatch,
  getSavedFeaturedReelsWithDetails,
} from "./db";
import { assertScriptInWorkspace } from "./assertScriptInWorkspace";
import { toSourceReel } from "./sourceReel";
import {
  enrichScriptsWithSendMeta,
  sendScriptToWorkspace,
} from "./scriptsSendToWorkspace";
import {
  createShareLinkForScript,
  getShareLinkInfoForScript,
  revokeShareLinkForScript,
} from "./scriptShareLinks";
import { assertCollectedReelInWorkspace } from "./assertCollectedReelInWorkspace";
import { assertIdeaInWorkspace } from "./assertIdeaInWorkspace";
import { assertTagInWorkspace } from "./assertTagInWorkspace";
import { assertRecreatedScriptInWorkspace } from "./assertRecreatedScriptInWorkspace";
import { assertUserScrapeReelInWorkspace } from "./assertUserScrapeReelInWorkspace";
import {
  scrapeReels,
  fetchReelByShortcode,
  fetchProfile,
  searchReelsByKeyword,
  searchReelsByHandle,
  runWithScrapeCallContext,
} from "./instagram";
import { fetchTikTokVideoInfo } from "./tiktok";
import { isDurableReelVideoUrl } from "./reelVideoR2";
import {
  isDurableTiktokVideoUrl,
  scheduleTiktokVideoMirror,
} from "./tiktokVideoR2";
import {
  enqueueCollectedReelIngest,
  enqueueCollectedReelRefresh,
} from "./collectedReelWorker";
import { ingestCollectedReelByShortcode } from "./collectedReelIngest";
import {
  canonicalInstagramReelUrl,
  parseInstagramReelShortcode,
} from "./instagramUrl";
import { sendHookGeneratorHooksEmail } from "./utils/email";
import { classifyTranscript } from "./_core/classifyTranscript";
import { invokeLLM } from "./_core/llm";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";
import {
  buildIdeaScriptProgressSteps,
  type IdeaScriptProgressStepId,
} from "@shared/ideaScriptProgress";
import {
  buildHeitWriterRules,
  buildHeitStructurePrompt,
  HEIT_STRUCTURE_JSON_SCHEMA,
  normalizeHeitStructure,
  readHeitHookType,
  buildHeitDraftUserPrompt,
  HEIT_JUDGE_CRITERIA,
  HEIT_FRAMEWORK,
} from "@shared/ideaScriptHeit";
import {
  buildRecreateTopicPrompt,
  buildRecreateDefaultTopicPrompt,
  RECREATE_EXPLICIT_ANGLE_RULES,
  RECREATE_DEFAULT_TOPIC_RULES,
} from "@shared/recreateAnglePrompt";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import { getCreatorCoachProfile } from "./planCoachProfile";
import { getOrFetchAudienceSignals } from "./audienceResearch/service";
import {
  buildIdeaScriptCompletedProps,
  buildIdeaScriptFailedProps,
  buildRemakeScriptCompletedProps,
  buildRemakeScriptFailedProps,
} from "@shared/scriptGenerationAnalytics";
import {
  capturePostHogEvent,
  posthogDistinctIdForUser,
} from "./analytics/posthogServer";
import { sanitizeAiOutputDeep } from "./utils/sanitizeAiOutput";
import { transcribeAudio } from "./_core/voiceTranscription";
import { analyzeHook } from "./analyzeHook";
import {
  acquireTranscriptionSlot,
  getActiveTranscriptions,
  MAX_CONCURRENT_TRANSCRIPTIONS,
  releaseTranscriptionSlot,
} from "./transcriptionSemaphore";
import { storagePut } from "./storage";
import { ensureProfilePicOnR2 } from "./profilePicR2";
import { ensureReelThumbnailOnR2 } from "./reelThumbnailR2";
import { ensureReelVideoOnR2, scheduleReelVideoMirror } from "./reelVideoR2";
import {
  scheduleScrapeJobPostCompleteWork,
  scheduleScrapeReelPostCompleteWork,
  reelIdsForJobShortcodes,
} from "./scrapePostComplete";
import {
  monthlyUsage,
  users,
  subscriptions,
  savedScripts,
  savedReels,
  scrapeJobs,
  collectedReels,
  niches,
  featuredAccounts,
  featuredAccountNiches,
  featuredReels,
  recreatedScripts,
  reels as reelsTable,
  transcriptions,
  creatorViewEvents,
  nicheViewEvents,
  emailEvents,
  emailTemplates,
  hookGeneratorLeads,
  discoverySearches,
  discoveryJobs,
  creatorDiscoverySearches,
  creatorDiscoveryJobs,
  viralityDiagnosticJobs,
  tiktokScrapeJobs,
  tiktokVideos,
  youtubeScrapeJobs,
  youtubeVideos,
} from "../drizzle/schema";
import type { Transcription, Reel, User } from "../drizzle/schema";
import { eq, ne, desc, asc, sql, and, inArray, not, getTableColumns, isNotNull, or, like } from "drizzle-orm";
import { getDb } from "./db";
import { classifyReelsByIds, ensureThumbnailTextForReels } from "./services/classifyReels.js";
import { refreshViralFlagsForScrapeJob } from "./reelViralFlag";
import { buildExportRows, prepareReelsForExport } from "./exportPipeline";
import { runExportJob, getExportJobIfAccessible } from "./exportJobRunner";
import { isGoogleSheetsConfigured, exportToGoogleSheets } from "./googleSheets";
import { storageReadBuffer } from "./storage";
import { isGoogleDocsConfigured, exportToGoogleDocs } from "./googleDocs";
import { getTelegramBotInfo, setupTelegramWebhook } from "./telegramBot";
import crypto from "crypto";

/** Batched IN() for saved.checkBatch; keeps chunks under typical MySQL placeholder limits. */
const SAVED_CHECK_BATCH = 200;

/**
 * Parse a date string safely to avoid timezone shift.
 * When given a date-only string like "2025-03-10", new Date() creates UTC midnight
 * which can shift back a day in local timezone. This helper appends T12:00:00 to
 * date-only strings to keep the date stable across timezones.
 */
function parseDateSafe(dateStr: string): Date {
  // If it's already a full ISO string (has T), parse as-is
  if (dateStr.includes("T")) return new Date(dateStr);
  // Date-only string: append noon to avoid timezone day-shift
  return new Date(dateStr + "T12:00:00");
}

/**
 * Formats the precomputed best posting day+hour into a human-readable
 * phrase for the featured dashboard header (Commit 6). Returns null
 * when either input is missing so the header hides the segment cleanly
 * instead of saying "Posts null around null o'clock".
 *
 * Hour is stored in UTC (matches featured_reels.postedAt) but formatting
 * uses UTC here — per-user timezone conversion is a Commit 6+ follow-up;
 * spec copy ("weekdays around 2 PM") is rough enough that UTC is fine.
 */
function formatBestPostingTime(
  day: string | null,
  hour: number | null
): string | null {
  if (day == null || hour == null) return null;
  const weekendDays = new Set(["saturday", "sunday"]);
  const dayLower = day.toLowerCase();
  const is12h = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? "AM" : "PM";
  const timeStr = `${is12h} ${ampm}`;
  // "Posts weekdays around 2 PM" vs "Posts Sundays around 10 AM".
  if (weekendDays.has(dayLower)) {
    const capitalized = dayLower.charAt(0).toUpperCase() + dayLower.slice(1);
    return `Posts ${capitalized}s around ${timeStr}`;
  }
  return `Posts weekdays around ${timeStr}`;
}

function inferPanelTestAccount(u: (typeof users.$inferSelect)): boolean {
  if (u.isTestAccount) return true;
  const e = (u.email || "").toLowerCase();
  const o = (u.openId || "").toLowerCase();
  if (e.includes("+test") || e.endsWith("@example.com") || e.endsWith("@example.org")) return true;
  if (o.includes("test_") || o.startsWith("demo_")) return true;
  return false;
}

const HOOK_GENERATOR_JSON_SCHEMA = {
  name: "viral_hooks",
  strict: true,
  schema: {
    type: "object",
    properties: {
      hooks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            hook: { type: "string" },
            onScreenText: { type: "string" },
            pattern: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["hook", "onScreenText", "pattern", "reasoning"],
          additionalProperties: false,
        },
      },
    },
    required: ["hooks"],
    additionalProperties: false,
  },
} as const;

const hookGeneratorRouter = router({
  generate: publicProcedure
    .input(z.object({
      content: z.string().min(10).max(500),
      hookStyle: z.string().max(64).optional(),
      videoFormat: z.string().max(64).optional(),
      tone: z.string().max(64).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
      const startedAt = Date.now();
      const reelContent = input.content.trim();
      const styleHint = input.hookStyle?.trim() || "mix of viral patterns";
      const formatHint = input.videoFormat?.trim() || "talking head";
      const toneHint = input.tone?.trim() || "direct and authentic";
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: withAiFormattingRules(
              "You are a viral Instagram Reels hook strategist working with nano and micro creators under 50K followers. You write hooks that stop the scroll in the first 2 seconds. You understand what works on Reels specifically: high specificity, personal stakes, counter-intuitive truths, and emotional triggers. You reject generic AI-sounding language and clichés. Respond with valid JSON only, no prose, no markdown, no code fences."
            ),
          },
          {
            role: "user",
            content: `Write viral Instagram Reels hooks.

Reel content (idea, outline, or script draft): "${reelContent}"
Hook style preference: ${styleHint}
Video format: ${formatHint}
Tone: ${toneHint}

INPUT INTERPRETATION:
- Use the reel content for topic, angle, and specific details
- Infer the target audience from the content when not stated explicitly

SPOKEN HOOK RULES (field: hook):
- 6 to 14 words. Vary length across the set.
- This is what the creator SAYS on camera in the first 2 seconds.
- Use specific numbers, dollar amounts, or time frames where natural.
- No em dashes anywhere.
- No clichés: avoid "Did you know", "Here is the thing", "Get ready", "Wait until you see", "POV:", "Tell me why", "Imagine if", "What if I told you".
- Each hook should feel like a real creator wrote it, not AI.

ON-SCREEN TEXT RULES (field: onScreenText):
- 3 to 7 words, maximum 30 characters total.
- ALL CAPS or Title Case for emphasis. Short punchy phrase.
- Must use DIFFERENT words than the spoken hook (complementary, not duplicate).
- Designed for white text on a semi-transparent black box in the upper third of a vertical Reel.
- Must fit Instagram safe zone (center 80%, avoid bottom UI strip).

PATTERN MIX (use as inspiration):

Cost reveal: "I was paying $4,000 a month on X until I changed this"
Mistake call-out: "Stop doing X if you actually want Y"
Result-first: "I cut my X by 40 percent in 30 days, here is what I did"
Curiosity loop: "The real reason your X is failing is not what you think"
Contrarian: "Everyone says X. They are wrong. Here is why."
Specific number: "3 things I wish I knew before starting X"
Personal stake: "If you are stuck at X, this changed everything for me"
Time-bound: "I tried X for 30 days. The results shocked me."
Authority flip: "I am a [credential]. Here is what your [field] will not tell you about X"
Question hook: "Why does X never work the way they promise?"

QUALITY CHECK before outputting:
- Would a real creator making this video actually say the spoken hook on camera?
- Is onScreenText short enough to read in under 2 seconds on a phone?
- Are onScreenText words different from the spoken hook?
- Are the first 3 words of the spoken hook attention-grabbing?
- Is each hook meaningfully different from the others?

Return JSON with this exact structure:
{
  "hooks": [
    {
      "hook": "<spoken line, 6 to 14 words>",
      "onScreenText": "<3 to 7 words, max 30 chars, different from spoken>",
      "pattern": "<one of: cost_reveal | mistake_callout | result_first | curiosity_loop | contrarian | specific_number | personal_stake | time_bound | authority_flip | question_hook>",
      "reasoning": "<one short sentence explaining why this works>"
    }
  ]
}

The hooks array must contain exactly 10 unique items. No two hooks should sound similar. Do not use em dashes anywhere. Do not include any text outside the JSON object.`
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: HOOK_GENERATOR_JSON_SCHEMA,
        },
      });

      const raw = String(response.choices[0]?.message?.content ?? "").trim();

      let parsed: { hooks?: Array<{ hook?: unknown; onScreenText?: unknown; pattern?: unknown; reasoning?: unknown }> };
      try {
        parsed = sanitizeAiOutputDeep(JSON.parse(raw));
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Hook generation returned non-JSON output. Please try again.",
        });
      }

      if (!parsed.hooks || !Array.isArray(parsed.hooks) || parsed.hooks.length < 5) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Hook generation incomplete. Please try again.",
        });
      }

      const hooks = parsed.hooks.slice(0, 10).map(h => ({
        hook: String(h.hook ?? "").trim(),
        onScreenText: String(h.onScreenText ?? "").trim().slice(0, 30),
        pattern: String(h.pattern ?? "").trim(),
        reasoning: String(h.reasoning ?? "").trim(),
      })).filter(h => h.hook.length > 0);

      if (hooks.length < 5) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Hook generation incomplete. Please try again.",
        });
      }

      const sessionToken = Buffer.from(
        JSON.stringify({
          content: reelContent,
          hooks,
          ts: Date.now(),
        })
      ).toString("base64");

      void capturePostHogEvent({
        distinctId: `hook_generator_${Date.now()}`,
        event: "hook_generator_completed",
        properties: {
          pipeline: "hook_generator",
          video_idea: reelContent.slice(0, 500),
          hooks_count: hooks.length,
          first_hook: hooks[0]?.hook?.slice(0, 200) ?? null,
          duration_ms: Date.now() - startedAt,
          model: response.model,
        },
      });

      const locked = hooks.slice(2);
      return {
        free: hooks.slice(0, 2),
        lockedCount: Math.max(0, hooks.length - 2),
        teasers: locked.map((h) => ({
          pattern: h.pattern,
          partial: buildHookTeaserPartial(h.hook),
        })),
        sessionToken,
      };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Hook generator] generate failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: formatIdeaScriptErrorForUser(error, "hooks"),
        });
      }
    }),

  unlock: publicProcedure
    .input(z.object({
      email: z.string().email().max(255),
      sessionToken: z.string(),
      utmSource: z.string().max(100).optional(),
      utmMedium: z.string().max(100).optional(),
      utmCampaign: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      let session: {
        content?: string;
        niche?: string;
        targetAudience?: string;
        hooks?: Array<{ hook: string; onScreenText?: string; pattern: string; reasoning: string }>;
        ts?: number;
      };
      try {
        session = JSON.parse(Buffer.from(input.sessionToken, "base64").toString());
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid session. Please regenerate your hooks.",
        });
      }

      const reelContent =
        typeof session.content === "string" && session.content.trim()
          ? session.content.trim()
          : typeof session.niche === "string" && session.niche.trim()
            ? session.niche.trim()
            : "";

      const targetAudience =
        typeof session.targetAudience === "string" && session.targetAudience.trim()
          ? session.targetAudience.trim()
          : "Instagram Reels viewers";

      if (!reelContent || !session.hooks || !session.ts || Date.now() - session.ts > 1000 * 60 * 30) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Session expired. Please regenerate your hooks.",
        });
      }

      const xff = ctx.req?.headers?.["x-forwarded-for"];
      const ipFromXff = Array.isArray(xff) ? xff[0] : (typeof xff === "string" ? xff.split(",")[0]?.trim() : null);
      const ip = ipFromXff || ctx.req?.socket?.remoteAddress || null;
      const ua = ctx.req?.headers?.["user-agent"];
      const uaString = typeof ua === "string" ? ua.slice(0, 500) : null;

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });
      }

      const insertResult = await db.insert(hookGeneratorLeads).values({
        email: input.email,
        niche: reelContent,
        targetAudience,
        hooksGenerated: session.hooks,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        ipAddress: ip,
        userAgent: uaString,
      });
      const insertId = insertResult[0].insertId;

      try {
        await sendHookGeneratorHooksEmail(
          input.email,
          reelContent,
          session.hooks,
          targetAudience
        );
        await db
          .update(hookGeneratorLeads)
          .set({ emailedAt: new Date() })
          .where(eq(hookGeneratorLeads.id, insertId));
      } catch (err) {
        console.error("[Hook generator] Failed to send unlock email:", err);
      }

      return {
        hooks: session.hooks,
        content: reelContent,
      };
      }),

  expandToScript: protectedProcedure
    .input(z.object({
      reelContent: z.string().min(10).max(500),
      hook: z.string().min(3).max(500),
      onScreenText: z.string().min(2).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await expandHookToScript({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          openId: ctx.user.openId,
          reelContent: input.reelContent.trim(),
          hook: input.hook.trim(),
          onScreenText: input.onScreenText.trim(),
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Hook generator] expandToScript failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: formatIdeaScriptErrorForUser(error, "script"),
        });
      }
    }),
});

function firstDayOfNextMonthUtc(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 1)).toISOString();
}

function onboardingSlugForNicheName(name: string): string | null {
  const trimmed = name.trim();
  const hit = ONBOARDING_NICHES.find(
    (n) => n.name === trimmed || n.name.toLowerCase() === trimmed.toLowerCase()
  );
  return hit?.slug ?? null;
}

function selectedSlugsFromNicheRouting(result: {
  primary_niche: string;
  secondary_niches: string[];
}): string[] {
  const slugs: string[] = [];
  const primary = onboardingSlugForNicheName(result.primary_niche);
  if (primary) slugs.push(primary);
  for (const secondary of result.secondary_niches) {
    if (slugs.length >= 3) break;
    const slug = onboardingSlugForNicheName(secondary);
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  if (slugs.length === 0) {
    slugs.push("business-entrepreneurship");
  }
  return slugs.slice(0, 3);
}

/**
 * Detects whether a business description clearly signals a B2C hospitality/venue creator
 * (posting content for guests, diners, travellers) vs a B2B seller targeting operators.
 *
 * Returns a clarification string to inject into the niche routing prompt,
 * or null if no strong signal is found.
 */
function detectHospitalityB2CContext(description: string): string | null {
  const d = description.toLowerCase();

  const b2cPatterns = [
    /\bmy (hotel|motel|resort|boutique hotel|bed and breakfast|b&b|airbnb|bnb)\b/,
    /\bmy (restaurant|cafe|coffee shop|bistro|brasserie|diner|eatery|bar|pub|tavern|lounge|rooftop bar|speakeasy)\b/,
    /\bmy (venue|event space|wedding venue|banquet hall)\b/,
    /\b(we (are|run|own|operate)|i (run|own|operate)) a (hotel|resort|restaurant|cafe|bar|venue|spa)\b/,
    /content (for|about) (our |my )?(guests|visitors|diners|customers|travellers|tourists)/,
    /show(ing)? (guests|visitors|diners|people) (around|what|how|why)/,
    /attract (guests|visitors|diners|tourists|customers) (to|for)/,
    /\b(guest experience|guest journey|dining experience|hotel experience)\b/,
  ];

  const b2bPatterns = [
    /sell(ing)? to (hotels|restaurants|operators|hospitality businesses)/,
    /\b(hospitality software|hotel management system|pos system|restaurant tech|property management)\b/,
    /\b(wholesale|distributor|supplier)\b.*\b(hotel|restaurant)\b/,
    /\b(hotel|restaurant) owner(s)?\b.*\b(buy|purchase|invest|subscribe)\b/,
  ];

  const hasB2CSignal = b2cPatterns.some((p) => p.test(d));
  const hasB2BSignal = b2bPatterns.some((p) => p.test(d));

  if (hasB2CSignal && !hasB2BSignal) {
    return "This creator owns or runs a hospitality or food and beverage venue. They are making content FOR their guests, diners, or visitors to attract and inspire them. They are a B2C creator. Route to Restaurants & Cafes, Travel, Food & Cooking, or similar consumer-facing niches. Do NOT route to Business & Entrepreneurship.";
  }

  return null;
}

export const appRouter = router({
  system: systemRouter,

  workspaces: workspacesRouter,

  activity: router({
    recordHeartbeat: protectedProcedure
      .input(z.object({ seconds: z.number().min(1).max(120).default(60) }))
      .mutation(async ({ ctx, input }) => {
        const { addUserActiveSeconds } = await import("./userActivity");
        await addUserActiveSeconds(ctx.user.id, input.seconds);
        return { ok: true as const };
      }),
  }),

  // ── Billing & Subscription ──
  billing: router({
    subscription: protectedProcedure.query(async ({ ctx }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const limits = getPlanLimits(sub.plan as PlanId);
      const usage = await getMonthlyUsage(ctx.user.id);
      return { ...sub, limits, usage };
    }),

    usage: protectedProcedure.query(async ({ ctx }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const limits = getPlanLimits(sub.plan as PlanId);
      const usage = await getMonthlyUsage(ctx.user.id);
      return { limits, usage, plan: sub.plan };
    }),

    plans: publicProcedure.query(() => {
      return Object.entries(PLANS).map(([id, plan]) => ({
        planId: id,
        ...plan,
      }));
    }),

    checkout: protectedProcedure
      .input(z.object({
        planId: z.enum(["starter", "pro", "business", "agency"]),
        interval: z.enum(["monthly", "yearly"]),
        origin: z.string(),
        referralId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const url = await createCheckoutSession({
          userId: ctx.user.id,
          email: ctx.user.email || "",
          name: ctx.user.name || "",
          planId: input.planId as PlanId,
          interval: input.interval as BillingInterval,
          origin: input.origin,
          referralId: input.referralId,
        });
        return { url };
      }),

    portal: protectedProcedure
      .input(z.object({ origin: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const url = await createPortalSession(ctx.user.id, input.origin);
        return { url };
      }),

    checkLimit: protectedProcedure
      .input(z.object({
        action: z.enum([
          "scrapeCount", "searchCount", "transcribeCount",
          "recreateCount", "rewriteCount", "exportCount",
          "extensionSortCount", "extensionSaveCount",
          "extensionTranscribeCount", "extensionRecreateCount",
        ]),
      }))
      .query(async ({ ctx, input }) => {
        return checkUsageLimit(ctx.user.id, input.action as any, ctx.user.openId, {
          email: ctx.user.email,
          role: ctx.user.role,
        });
      }),

    trackUsage: protectedProcedure
      .input(z.object({
        action: z.enum([
          "scrapeCount", "searchCount", "transcribeCount",
          "recreateCount", "rewriteCount", "exportCount",
          "extensionSortCount", "extensionSaveCount",
          "extensionTranscribeCount", "extensionRecreateCount",
        ]),
      }))
      .mutation(async ({ ctx, input }) => {
        await incrementUsage(ctx.user.id, input.action as any);
        return { success: true };
      }),
  }),

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Scrape Jobs ──
  scrape: router({
    start: protectedProcedure
      .input(
        z
          .object({
            handle: z.string().min(1).max(128),
            timeframeDays: z.number().refine((v) => [30, 90, 180].includes(v)),
          })
          .superRefine((data, ctx) => {
            const norm = normalizeInstagramHandle(data.handle);
            if (!isValidInstagramHandleNormalized(norm)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: INSTAGRAM_HANDLE_INVALID_MESSAGE,
                path: ["handle"],
              });
            }
          })
      )
      .mutation(async ({ ctx, input }) => {
        // Check if handle already exists in monitoring
        const normalizedHandle = normalizeInstagramHandle(input.handle);
        const existingJobs = await getScrapeJobsByWorkspace(ctx.workspaceId);
        const existingRunningJob = existingJobs.find(
          (j) => j.handle.toLowerCase() === normalizedHandle && j.status === "running"
        );
        if (existingRunningJob) {
          return { jobId: existingRunningJob.id, resumed: true as const };
        }
        const existingCompletedJob = existingJobs.find(
          (j) => j.handle.toLowerCase() === normalizedHandle && j.status === "completed"
        );
        if (existingCompletedJob) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `@${normalizedHandle} is already in your Creator Radar. Open Creator Radar and tap Refresh to pull new reels (fresh window from your last sync, not a full archive backfill).`,
          });
        }

        // Featured handles: seed cached catalog reels into the user's job
        // for instant dashboard display, then pull live reels in background.
        let featuredAccountId: number | undefined;
        const db = await getDb();
        if (db) {
          const featuredMatch = await db
            .select({ id: featuredAccounts.id })
            .from(featuredAccounts)
            .where(
              and(
                sql`LOWER(${featuredAccounts.handle}) = ${normalizedHandle}`,
                eq(featuredAccounts.isActive, true)
              )
            )
            .limit(1);
          if (featuredMatch.length > 0) {
            featuredAccountId = featuredMatch[0].id;
          }
        }

        // Check usage limit before starting
        const usageCheck = await checkUsageLimit(ctx.user.id, "scrapeCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You have reached your monthly account research limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }

        const jobId = await createScrapeJob({
          userId: ctx.user.id,
          handle: normalizedHandle,
          timeframeDays: input.timeframeDays,
          status: "running",
          currentStep: "connecting",
        });

        // Track usage. Refunded inside runScrapeJob when the failure is
        // vendor-side (rate limit / temporary restriction) so flaky scrapes
        // don't burn the user's monthly quota.
        await incrementUsage(ctx.user.id, "scrapeCount");

        let seededFromFeatured = false;
        if (featuredAccountId != null) {
          await seedFeaturedReelsIntoJob(
            jobId,
            featuredAccountId,
            input.timeframeDays
          );
          seededFromFeatured = true;
        }

        // Run scraping in background
        runScrapeJob(jobId, ctx.user.id, normalizedHandle, input.timeframeDays).catch((err) => {
          console.error(`Scrape job ${jobId} failed:`, err);
        });

        return seededFromFeatured ? { jobId, seededFromFeatured: true as const } : { jobId };
      }),

    status: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        return job;
      }),

    /**
     * Lightweight progress poll used by the dedicated scraping UI. Returns
     * just the fields needed for the multi-step view so we can hit this on
     * a 1.5s interval without shipping the full job row every time.
     */
    progress: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        return {
          status: job.status,
          currentStep: job.currentStep,
          reelsFound: job.reelsFound,
          estimatedTotal: job.estimatedTotal,
          progressPercent: job.progressPercent,
          errorMessage: job.errorMessage,
          failureReason: job.failureReason,
          handle: job.handle,
          timeframeDays: job.timeframeDays,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const jobs = await getScrapeJobsByWorkspace(ctx.workspaceId);
      const db = await getDb();
      const jobIds = jobs.map((j) => j.id);

      type Rollup = {
        reelCountRollup: number;
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        avgEngagementPct: number | null;
      };
      const rollupMap = new Map<number, Rollup>();

      if (db && jobIds.length > 0) {
        const rollupRows = await db
          .select({
            jobId: reelsTable.jobId,
            reelCount: sql<number>`cast(count(*) as signed)`.mapWith(Number),
            totalViews: sql<number>`coalesce(sum(cast(${reelsTable.viewCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalLikes: sql<number>`coalesce(sum(cast(${reelsTable.likeCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalComments: sql<number>`coalesce(sum(cast(${reelsTable.commentCount} as signed)), 0)`.mapWith(
              Number
            ),
            avgEngagementPct: sql<number | null>`avg(
              (cast(${reelsTable.likeCount} as signed) + cast(${reelsTable.commentCount} as signed))
              / nullif(cast(${scrapeJobs.followerCount} as signed), 0) * 100
            )`,
          })
          .from(reelsTable)
          .innerJoin(scrapeJobs, eq(reelsTable.jobId, scrapeJobs.id))
          .where(and(inArray(reelsTable.jobId, jobIds), eq(scrapeJobs.workspaceId, ctx.workspaceId)))
          .groupBy(reelsTable.jobId);

        for (const row of rollupRows) {
          if (row.jobId == null) continue;
          const raw = row.avgEngagementPct;
          const n =
            raw == null ? null : typeof raw === "number" ? raw : Number.parseFloat(String(raw));
          rollupMap.set(row.jobId, {
            reelCountRollup: row.reelCount,
            totalViews: row.totalViews,
            totalLikes: row.totalLikes,
            totalComments: row.totalComments,
            avgEngagementPct: n != null && Number.isFinite(n) ? n : null,
          });
        }
      }

      // Hide failed scrapes that never produced reels — they're just
      // noise on Creator Radar (no metrics, no insights, retry path is
      // already available via "Spy A Creator"). Failed jobs that DID
      // collect reels (e.g. a refresh that failed after a successful
      // initial scrape) stay visible so the user keeps their data.
      // Running and completed jobs always pass through.
      return jobs
        .map((j) => ({
          ...j,
          reelStats: rollupMap.get(j.id) ?? null,
        }))
        .filter((j) => {
          if (j.status !== "failed") return true;
          const reelCount = j.reelStats?.reelCountRollup ?? 0;
          return reelCount > 0;
        });
    }),

    /** Delete a scrape job and its associated reels */
    delete: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteScrapeJob(input.jobId);
        return { success: true };
      }),

    /** Re-sync a completed scrape job — fetches only new reels since last sync */
    resync: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        if (job.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Job is already running" });

        // Calculate days since last sync (updatedAt) — only fetch reels from that period
        const lastSyncDate = new Date(job.updatedAt);
        const now = new Date();
        const daysSinceSync = Math.max(1, Math.ceil((now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60 * 24)));

        // Mark as running
        await updateScrapeJob(input.jobId, {
          status: "running",
          errorMessage: null,
          failureReason: null,
        });

        // Run resync in background
        runResyncJob(input.jobId, job.handle, daysSinceSync).catch((err) => {
          console.error(`Resync job ${input.jobId} failed:`, err);
        });

        return { jobId: input.jobId, daysSinceSync };
      }),

    /** Preview an Instagram profile before scraping */
    profilePreview: protectedProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ input }) => {
        try {
          const profile = await fetchProfile(input.handle);
          const cleanHandle = profile.username.replace(/^@/, "").trim().toLowerCase();
          const proxiedPicUrl = await ensureProfilePicOnR2(
            cleanHandle,
            profile.profilePicUrl
          );
          return {
            found: true as const,
            username: profile.username,
            fullName: profile.fullName,
            biography: profile.biography,
            profilePicUrl: proxiedPicUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
            postCount: profile.postCount,
            isVerified: profile.isVerified,
            isPrivate: profile.isPrivate,
            category: profile.category,
            externalUrl: profile.externalUrl,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Profile not found";
          return {
            found: false as const,
            error: message,
          };
        }
      }),
  }),

  // ── Reels ──
  reels: router({
    list: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          niche: reelNicheInputEnum.optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        const reelsList = await getReelsByJobId(input.jobId, input.niche as NonNullable<Reel["niche"]>);
        const transcriptionsList = await getTranscriptionsByJobId(input.jobId);
        const transcriptionMap = new Map(
          transcriptionsList.map((t) => [t.reelId, t])
        );
        const followerCount = job?.followerCount || 0;

        return {
          followerCount,
          reels: reelsList.map((r) => ({
            ...r,
            engagementRate: accountEngagementRatePercent(
              r.likeCount,
              r.commentCount,
              followerCount
            ),
            transcription: transcriptionMap.get(r.id) || null,
          })),
        };
      }),

    /** Fetch a fresh Instagram video URL for playback; mirror to R2 in the background. */
    refreshVideoUrl: protectedProcedure
      .input(
        z.object({
          shortcode: z.string().min(1),
          reelId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const shortcode = input.shortcode.trim();
        const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

        if (input.reelId != null) {
          const reel = await getReelById(input.reelId);
          if (!reel) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Reel not found" });
          }
          const job = await getScrapeJob(reel.jobId);
          if (!job || job.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          const existing = (reel.videoUrl ?? "").trim();
          if (publicBase && existing.startsWith(publicBase)) {
            return { videoUrl: existing };
          }
        }

        const freshData = await fetchReelByShortcode(shortcode, {
          mode: "interactive",
        });
        if (!freshData?.videoUrl?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not retrieve a fresh video URL for this reel.",
          });
        }

        const videoUrl = freshData.videoUrl.trim();

        if (input.reelId != null) {
          scheduleReelVideoMirror(input.reelId, shortcode, videoUrl);
          const db = await getDb();
          if (db) {
            const { reels: reelsTable } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db
              .update(reelsTable)
              .set({ videoUrl })
              .where(eq(reelsTable.id, input.reelId));
          }
        }

        return { videoUrl };
      }),
  }),

  // ── Featured Accounts (pre-scraped catalog browsed by niche) ──
  featured: router({
    /**
     * All niches grouped by `groupName`, with a per-niche count of active
     * accounts that have at least one reel stored. Used by the initial
     * "browse by niche" UI — the 5 group cards and their niche subcards.
     * Niches with zero usable accounts are filtered out (they look broken).
     */
    nicheGroups: protectedProcedure.query(async () => {
      const db = await getDb();
      const rows = await db!
        .select({
          id: niches.id,
          slug: niches.slug,
          name: niches.name,
          iconName: niches.iconName,
          description: niches.description,
          groupName: niches.groupName,
          sortOrder: niches.sortOrder,
          // Count distinct active accounts with at least one reel. The
          // LEFT JOIN chain keeps niches with zero matches visible in the
          // raw rows; we filter those out in JS below.
          accountCount: sql<number>`COUNT(DISTINCT ${featuredReels.featuredAccountId})`,
        })
        .from(niches)
        .leftJoin(featuredAccountNiches, eq(featuredAccountNiches.nicheId, niches.id))
        .leftJoin(
          featuredAccounts,
          and(
            eq(featuredAccounts.id, featuredAccountNiches.accountId),
            eq(featuredAccounts.isActive, true)
          )
        )
        .leftJoin(
          featuredReels,
          and(
            eq(featuredReels.featuredAccountId, featuredAccounts.id),
            ne(featuredReels.transcriptionStatus, "failed")
          )
        )
        .groupBy(
          niches.id,
          niches.slug,
          niches.name,
          niches.iconName,
          niches.description,
          niches.groupName,
          niches.sortOrder
        )
        .orderBy(asc(niches.groupName), asc(niches.sortOrder));

      // Drop empty niches and group by groupName in a single pass.
      const groupMap = new Map<
        string,
        {
          id: number;
          slug: string;
          name: string;
          iconName: string;
          description: string;
          accountCount: number;
        }[]
      >();
      for (const row of rows) {
        const accountCount = Number(row.accountCount);
        if (accountCount <= 0) continue;
        const bucket = groupMap.get(row.groupName) ?? [];
        bucket.push({
          id: row.id,
          slug: row.slug,
          name: row.name,
          iconName: row.iconName,
          description: row.description ?? "",
          accountCount,
        });
        groupMap.set(row.groupName, bucket);
      }

      return {
        groups: Array.from(groupMap, ([groupName, nichesInGroup]) => ({
          groupName,
          niches: nichesInGroup,
        })),
      };
    }),

    /**
     * Read-only featured catalog dashboard: account + reels from
     * `featured_*` tables (no per-user scrape_jobs copy). Transcription
     * join via `transcriptions.featuredReelId` is stubbed empty until
     * migration 0028 / Commit 3a.
     */
    getDashboardData: protectedProcedure
      .input(
        z.object({
          featuredAccountId: z.number().int().positive(),
          niche: reelNicheInputEnum.optional(),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database unavailable",
          });
        }

        const accountRows = await db
          .select({
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            profilePicUrl: featuredAccounts.profilePicUrl,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            bestPostingHour: featuredAccounts.bestPostingHour,
            bestPostingDay: featuredAccounts.bestPostingDay,
          })
          .from(featuredAccounts)
          .where(
            and(
              eq(featuredAccounts.id, input.featuredAccountId),
              eq(featuredAccounts.isActive, true)
            )
          )
          .limit(1);

        if (accountRows.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This creator isn't available",
          });
        }

        const acc = accountRows[0];

        const nicheRows = await db
          .select({ slug: niches.slug, name: niches.name })
          .from(featuredAccountNiches)
          .innerJoin(niches, eq(niches.id, featuredAccountNiches.nicheId))
          .where(
            and(
              eq(featuredAccountNiches.accountId, acc.id),
              eq(featuredAccountNiches.isPrimary, true)
            )
          )
          .limit(1);

        const classifiedNicheSlug = nicheRows[0]?.slug ?? null;
        const primaryNicheName = nicheRows[0]?.name ?? "";

        const reelRows = await db
          .select()
          .from(featuredReels)
          .where(
            and(
              eq(featuredReels.featuredAccountId, acc.id),
              ne(featuredReels.transcriptionStatus, "failed"),
              ...(input.niche ? [eq(featuredReels.niche, input.niche as NonNullable<Reel["niche"]>)] : [])
            )
          )
          .orderBy(desc(featuredReels.viewCount));

        const fc = acc.followerCount || 0;

        const reels = reelRows.map((r) => ({
          id: r.id,
          featuredReelId: r.id,
          shortcode: r.reelShortcode,
          thumbnailUrl: r.thumbnailUrl ?? "",
          videoUrl: r.videoUrl ?? "",
          caption: r.caption ?? "",
          viewCount: r.viewCount,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          duration: r.duration,
          postedAt: r.postedAt,
          reelUrl: `https://www.instagram.com/reel/${r.reelShortcode}/`,
          ownerUsername: acc.handle,
          engagementRate: accountEngagementRatePercent(
            r.likeCount,
            r.commentCount,
            fc
          ),
          transcription: transcriptionViewFromFeaturedReelRow(r),
          contentType: r.contentType ?? null,
          remakeabilityScore: r.remakeabilityScore ?? null,
          suggestedAction: r.suggestedAction ?? null,
          classificationReason: r.classificationReason ?? null,
          classifiedAt: r.classifiedAt ?? null,
          niche: r.niche ?? null,
          hookPattern: r.hookPattern ?? null,
          productionFormat: r.productionFormat ?? null,
          thumbnailText: r.thumbnailText ?? null,
          viralFlag: r.viralFlag ?? false,
          confidence: r.confidence ?? null,
        }));

        return {
          isFeaturedView: true as const,
          account: {
            id: acc.id,
            handle: acc.handle,
            displayName: acc.displayName ?? "",
            profilePicUrl: acc.profilePicUrl ?? "",
            followerCount: acc.followerCount,
            avgEngagement: Number(acc.avgEngagementRate),
            classifiedNicheSlug,
            primaryNicheName,
            // Commit 6 — formatted best posting window for the dashboard
            // header. Null when either column is null (backfill hasn't
            // run or the account has zero reels). Formatting lives on the
            // server so mobile + desktop + any future surface render
            // identically.
            bestPostingTime: formatBestPostingTime(
              acc.bestPostingDay,
              acc.bestPostingHour
            ),
          },
          followerCount: fc,
          reels,
        };
      }),

    /**
     * All active featured accounts tagged with `nicheSlug`, sorted by
     * follower count desc. Accounts with zero stored reels are omitted —
     * clicking them would show an empty state, which isn't the goal.
     */
    accountsByNiche: protectedProcedure
      .input(z.object({ nicheSlug: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const nicheMatch = await db!
          .select({ id: niches.id })
          .from(niches)
          .where(eq(niches.slug, input.nicheSlug))
          .limit(1);
        if (nicheMatch.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Niche not found" });
        }
        const nicheId = nicheMatch[0].id;

        const rows = await db!
          .select({
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            profilePicUrl: featuredAccounts.profilePicUrl,
            totalReelsEver: featuredAccounts.totalReelsEver,
            reelsAvailable: sql<number>`COUNT(${featuredReels.id})`,
          })
          .from(featuredAccounts)
          .innerJoin(
            featuredAccountNiches,
            eq(featuredAccountNiches.accountId, featuredAccounts.id)
          )
          .leftJoin(
            featuredReels,
            and(
              eq(featuredReels.featuredAccountId, featuredAccounts.id),
              ne(featuredReels.transcriptionStatus, "failed")
            )
          )
          .where(
            and(
              eq(featuredAccountNiches.nicheId, nicheId),
              eq(featuredAccounts.isActive, true)
            )
          )
          .groupBy(
            featuredAccounts.id,
            featuredAccounts.handle,
            featuredAccounts.displayName,
            featuredAccounts.followerCount,
            featuredAccounts.avgEngagementRate,
            featuredAccounts.profilePicUrl,
            featuredAccounts.totalReelsEver
          )
          .having(sql`COUNT(${featuredReels.id}) > 0`)
          .orderBy(desc(featuredAccounts.followerCount));

        return rows.map((r) => ({
          id: r.id,
          handle: r.handle,
          displayName: r.displayName ?? "",
          followerCount: r.followerCount,
          // decimal(5,2) comes back from mysql2 as a string — coerce at boundary.
          avgEngagementRate: Number(r.avgEngagementRate),
          profilePicUrl: r.profilePicUrl ?? "",
          totalReelsEver: r.totalReelsEver,
          reelsAvailable: Number(r.reelsAvailable),
        }));
      }),

    /**
     * Batch version of `accountsByNiche` for the /onboarding Step 2 UI
     * (spec §3). Takes N slugs, returns a map of slug → accounts using
     * the exact same creator shape and filter rules as the single-slug
     * endpoint. Keeps the onboarding page to one round-trip regardless
     * of how many niches the user picked.
     *
     * Slugs are deduped up front. Unknown slugs resolve to an empty
     * array rather than throwing — the UI shows an empty state for
     * empty sections, which is the same behavior it needs for niches
     * with zero active creators anyway (edge case #3).
     */
    accountsByNicheSlugs: protectedProcedure
      .input(z.object({ slugs: z.array(z.string().trim().min(1)).min(1).max(30) }))
      .query(async ({ input }) => {
        const db = await getDb();
        const dedupedSlugs = Array.from(new Set(input.slugs));

        // Seed the output map so every requested slug has an entry
        // (empty array for unknowns / no-creator niches). Downstream
        // code can rely on `result[slug]` existing without a defined
        // check.
        const grouped: Record<
          string,
          {
            id: number;
            handle: string;
            displayName: string;
            followerCount: number;
            avgEngagementRate: number;
            profilePicUrl: string;
            totalReelsEver: number;
            reelsAvailable: number;
          }[]
        > = {};
        for (const slug of dedupedSlugs) grouped[slug] = [];

        // Single join covers all slugs; we partition by slug client-
        // side (cheaper than N queries). Filter rules match
        // `accountsByNiche` exactly: active accounts with ≥1 stored
        // reel, sorted by follower count desc within each niche.
        const rows = await db!
          .select({
            slug: niches.slug,
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            profilePicUrl: featuredAccounts.profilePicUrl,
            totalReelsEver: featuredAccounts.totalReelsEver,
            reelsAvailable: sql<number>`COUNT(${featuredReels.id})`,
          })
          .from(niches)
          .innerJoin(featuredAccountNiches, eq(featuredAccountNiches.nicheId, niches.id))
          .innerJoin(
            featuredAccounts,
            and(
              eq(featuredAccounts.id, featuredAccountNiches.accountId),
              eq(featuredAccounts.isActive, true)
            )
          )
          .leftJoin(
            featuredReels,
            and(
              eq(featuredReels.featuredAccountId, featuredAccounts.id),
              ne(featuredReels.transcriptionStatus, "failed")
            )
          )
          .where(inArray(niches.slug, dedupedSlugs))
          .groupBy(
            niches.slug,
            featuredAccounts.id,
            featuredAccounts.handle,
            featuredAccounts.displayName,
            featuredAccounts.followerCount,
            featuredAccounts.avgEngagementRate,
            featuredAccounts.profilePicUrl,
            featuredAccounts.totalReelsEver
          )
          .having(sql`COUNT(${featuredReels.id}) > 0`)
          .orderBy(asc(niches.slug), desc(featuredAccounts.followerCount));

        for (const r of rows) {
          grouped[r.slug].push({
            id: r.id,
            handle: r.handle,
            displayName: r.displayName ?? "",
            followerCount: r.followerCount,
            avgEngagementRate: Number(r.avgEngagementRate),
            profilePicUrl: r.profilePicUrl ?? "",
            totalReelsEver: r.totalReelsEver,
            reelsAvailable: Number(r.reelsAvailable),
          });
        }

        return { groups: grouped };
      }),

    /**
     * Pre-ranked top 30 reels for a featured account. `rank` was computed
     * at scrape time (1 = highest engagement rate), so we just read it
     * back in order. This is the "magic moment" — zero-latency reels.
     */
    topReels: protectedProcedure
      .input(z.object({ accountId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const rows = await db!
          .select()
          .from(featuredReels)
          .where(
            and(
              eq(featuredReels.featuredAccountId, input.accountId),
              ne(featuredReels.transcriptionStatus, "failed")
            )
          )
          // `rank` is a MySQL 8 reserved word, but drizzle auto-backticks
          // identifiers on the query-builder path so this is safe.
          .orderBy(asc(featuredReels.rank))
          .limit(30);

        return rows.map((r) => ({
          id: r.id,
          reelShortcode: r.reelShortcode,
          caption: r.caption,
          viewCount: r.viewCount,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          // decimal(5,2) → string; null possible on older rows.
          engagementRate: r.engagementRate == null ? 0 : Number(r.engagementRate),
          thumbnailUrl: r.thumbnailUrl ?? "",
          videoUrl: r.videoUrl ?? "",
          duration: r.duration ?? 0,
          postedAt: r.postedAt,
          rank: r.rank ?? 0,
        }));
      }),

    /**
     * Resolve a catalog featured account by Instagram handle: stable id
     * plus primary niche (or first niche by `sortOrder` when no primary
     * flag). Used by the job dashboard sidebar to (a) exclude the current
     * creator from `relatedCreators` and (b) derive niche for demo jobs
     * when `classifiedNicheSlug` is unset.
     */
    accountContextByHandle: protectedProcedure
      .input(z.object({ handle: z.string().trim().min(1).max(128) }))
      .query(async ({ input }) => {
        const db = await getDb();
        const normalized = input.handle.replace(/^@/, "").trim().toLowerCase();

        const rows = await db!
          .select({
            featuredAccountId: featuredAccounts.id,
            nicheSlug: niches.slug,
            nicheName: niches.name,
            isPrimary: featuredAccountNiches.isPrimary,
          })
          .from(featuredAccounts)
          .innerJoin(
            featuredAccountNiches,
            eq(featuredAccountNiches.accountId, featuredAccounts.id)
          )
          .innerJoin(niches, eq(niches.id, featuredAccountNiches.nicheId))
          .where(
            and(eq(featuredAccounts.handle, normalized), eq(featuredAccounts.isActive, true))
          )
          .orderBy(desc(featuredAccountNiches.isPrimary), asc(niches.sortOrder))
          .limit(1);

        if (rows.length === 0) {
          return {
            featuredAccountId: null as number | null,
            nicheSlug: null as string | null,
            nicheName: null as string | null,
          };
        }

        return {
          featuredAccountId: rows[0].featuredAccountId,
          nicheSlug: rows[0].nicheSlug,
          nicheName: rows[0].nicheName,
        };
      }),

    /**
     * Related creators for the dashboard right sidebar ("Top creators in
     * this niche"). Returns other active featured accounts tagged with
     * `nicheSlug`, ordered by follower count desc, optionally excluding
     * the account currently being viewed (so we don't show @garyvee as
     * "related" on @garyvee's own dashboard).
     *
     * Uses INNER JOINs — an account only shows up if it actually has the
     * niche tag. The `nicheName` field comes from `niches.name` for the
     * matched row, which is convenient for the sidebar eyebrow copy.
     *
     * Mirrors `accountsByNiche`'s LEFT JOIN + HAVING guard so we never
     * surface a creator with zero stored reels — clicking them would
     * land on an empty dashboard. `isActive=true` is not a strong enough
     * invariant on its own (a future row could be active without a
     * successful scrape yet).
     */
    relatedCreators: protectedProcedure
      .input(
        z.object({
          nicheSlug: z.string(),
          excludeAccountId: z.number().int().positive().optional(),
          // Cap at 50 so a misconfigured caller can't pull the whole catalog.
          limit: z.number().int().positive().max(50).default(5),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();

        const whereClauses = [
          eq(niches.slug, input.nicheSlug),
          eq(featuredAccounts.isActive, true),
        ];
        if (input.excludeAccountId !== undefined) {
          whereClauses.push(ne(featuredAccounts.id, input.excludeAccountId));
        }

        const rows = await db!
          .select({
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            profilePicUrl: featuredAccounts.profilePicUrl,
            nicheName: niches.name,
          })
          .from(niches)
          .innerJoin(
            featuredAccountNiches,
            eq(featuredAccountNiches.nicheId, niches.id)
          )
          .innerJoin(
            featuredAccounts,
            eq(featuredAccounts.id, featuredAccountNiches.accountId)
          )
          .leftJoin(
            featuredReels,
            and(
              eq(featuredReels.featuredAccountId, featuredAccounts.id),
              ne(featuredReels.transcriptionStatus, "failed")
            )
          )
          .where(and(...whereClauses))
          .groupBy(
            featuredAccounts.id,
            featuredAccounts.handle,
            featuredAccounts.displayName,
            featuredAccounts.followerCount,
            featuredAccounts.avgEngagementRate,
            featuredAccounts.profilePicUrl,
            niches.name
          )
          .having(sql`COUNT(${featuredReels.id}) > 0`)
          .orderBy(desc(featuredAccounts.followerCount))
          .limit(input.limit);

        return rows.map((r) => ({
          id: r.id,
          handle: r.handle,
          displayName: r.displayName ?? "",
          followerCount: r.followerCount,
          avgEngagementRate: Number(r.avgEngagementRate),
          profilePicUrl: r.profilePicUrl ?? "",
          nicheName: r.nicheName,
        }));
      }),

    /**
     * Featured accounts matching onboarding “picked” handles. Same
     * anti-empty guard as `relatedCreators` (at least one stored reel),
     * ordered by followers desc.
     */
    creatorsByHandles: protectedProcedure
      .input(
        z.object({
          handles: z.array(z.string().trim().min(1)).min(1).max(5),
          excludeHandle: z.string().trim().optional(),
          limit: z.number().int().positive().max(20).default(5),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          return [] as {
            id: number;
            handle: string;
            displayName: string;
            followerCount: number;
            avgEngagementRate: number;
            profilePicUrl: string;
            nicheName: string;
          }[];
        }
        const exclude = input.excludeHandle
          ?.replace(/^@/, "")
          .trim()
          .toLowerCase();
        const unique = new Set(
          input.handles
            .map((h) => h.replace(/^@/, "").trim().toLowerCase())
            .filter(Boolean)
        );
        if (exclude) unique.delete(exclude);
        const list = Array.from(unique).slice(0, 5);
        if (list.length === 0) return [];

        const whereClauses = [
          inArray(featuredAccounts.handle, list),
          eq(featuredAccounts.isActive, true),
        ];

        const rows = await db
          .select({
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            profilePicUrl: featuredAccounts.profilePicUrl,
          })
          .from(featuredAccounts)
          .leftJoin(
            featuredReels,
            and(
              eq(featuredReels.featuredAccountId, featuredAccounts.id),
              ne(featuredReels.transcriptionStatus, "failed")
            )
          )
          .where(and(...whereClauses))
          .groupBy(
            featuredAccounts.id,
            featuredAccounts.handle,
            featuredAccounts.displayName,
            featuredAccounts.followerCount,
            featuredAccounts.avgEngagementRate,
            featuredAccounts.profilePicUrl
          )
          .having(sql`COUNT(${featuredReels.id}) > 0`)
          .orderBy(desc(featuredAccounts.followerCount))
          .limit(input.limit);

        return rows.map((r) => ({
          id: r.id,
          handle: r.handle,
          displayName: r.displayName ?? "",
          followerCount: r.followerCount,
          avgEngagementRate: Number(r.avgEngagementRate),
          profilePicUrl: r.profilePicUrl ?? "",
          nicheName: "",
        }));
      }),

    /**
     * Top recent reels in the user’s onboarding niches (by primary niche tag),
     * posted in the last 7 days, for the “Going viral” sidebar.
     */
    goingViralByNiches: protectedProcedure
      .input(
        z.object({
          slugs: z.array(z.string().trim().min(1)).max(5),
        })
      )
      .query(async ({ input }) => {
        const slugs = Array.from(
          new Set(input.slugs.map((s) => s.trim().toLowerCase()).filter(Boolean))
        ).slice(0, 5);
        if (slugs.length === 0) return [];

        const db = await getDb();
        if (!db) return [];

        const rows = await db
          .select({
            reelId: featuredReels.id,
            shortcode: featuredReels.reelShortcode,
            caption: featuredReels.caption,
            thumbnailUrl: featuredReels.thumbnailUrl,
            viewCount: featuredReels.viewCount,
            creatorHandle: featuredAccounts.handle,
            creatorName: featuredAccounts.displayName,
            profilePicUrl: featuredAccounts.profilePicUrl,
            featuredAccountId: featuredAccounts.id,
          })
          .from(featuredReels)
          .innerJoin(
            featuredAccounts,
            eq(featuredReels.featuredAccountId, featuredAccounts.id)
          )
          .innerJoin(
            featuredAccountNiches,
            and(
              eq(featuredAccountNiches.accountId, featuredAccounts.id),
              eq(featuredAccountNiches.isPrimary, true)
            )
          )
          .innerJoin(
            niches,
            and(
              eq(niches.id, featuredAccountNiches.nicheId),
              inArray(niches.slug, slugs)
            )
          )
          .where(
            and(
              eq(featuredAccounts.isActive, true),
              ne(featuredReels.transcriptionStatus, "failed"),
              sql`${featuredReels.postedAt} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
            )
          )
          .orderBy(desc(featuredReels.viewCount))
          .limit(5);

        return rows.map((r) => ({
          reelId: String(r.reelId),
          shortcode: r.shortcode,
          caption: r.caption ?? "",
          thumbnailUrl: r.thumbnailUrl ?? "",
          viewCount: r.viewCount,
          creatorHandle: r.creatorHandle,
          creatorName: r.creatorName ?? "",
          profilePicUrl: r.profilePicUrl ?? "",
          featuredAccountId: String(r.featuredAccountId),
        }));
      }),

    /**
     * Classify an arbitrary Instagram handle into one of the 30 niches
     * using Claude Sonnet. Only called for handles outside the featured
     * catalog — the "AI ✦" niche badge on the dashboard flags this
     * classified-on-the-fly path.
     *
     * Caching design:
     *   - When `scrapeJobId` is provided AND the job belongs to the
     *     caller, we read-through / write-through the cache columns on
     *     the `scrape_jobs` row so the dashboard can re-read without
     *     spending another LLM call on every page load.
     *   - Without a job id we just classify and return — useful for
     *     ad-hoc callers (admin tools, batch scripts).
     *
     * Note on input shape: the spec (§1.2) lists only `{handle, bio,
     * captions}`. Adding the optional `scrapeJobId` is the cleanest way
     * to satisfy the "cache on the job row" directive from the same
     * section without introducing a second mutation. Clients that don't
     * need caching can simply omit it.
     *
     * Mutation (not query) because (a) it writes cache state and (b)
     * the LLM call has real billing side effects — tRPC conventionally
     * treats queries as idempotent/cacheable, which this isn't.
     */
    classifyHandle: protectedProcedure
      .input(
        z.object({
          handle: z.string().trim().min(1),
          bio: z.string().optional(),
          // Cap at 5 captions per spec; the helper below also trims
          // each one so a pathological caller can't blow the prompt.
          captions: z.array(z.string()).max(5).optional(),
          scrapeJobId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();

        // 1) If caller provided a job id, authorize and check the cache.
        type ScrapeJobRow = typeof scrapeJobs.$inferSelect;
        let cacheableJob: ScrapeJobRow | undefined;
        if (input.scrapeJobId !== undefined) {
          const found = await db!
            .select()
            .from(scrapeJobs)
            .where(
              and(
                eq(scrapeJobs.id, input.scrapeJobId),
                eq(scrapeJobs.workspaceId, ctx.workspaceId)
              )
            )
            .limit(1);
          if (found.length === 0) {
            // NOT_FOUND (not FORBIDDEN) to avoid leaking existence of
            // other users' jobs.
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Scrape job not found",
            });
          }
          cacheableJob = found[0];

          // Cache hit — skip the LLM call entirely.
          if (
            cacheableJob.classifiedNicheSlug &&
            cacheableJob.classifiedConfidence
          ) {
            const nicheRow = await db!
              .select({ name: niches.name })
              .from(niches)
              .where(eq(niches.slug, cacheableJob.classifiedNicheSlug))
              .limit(1);
            if (nicheRow.length > 0) {
              return {
                nicheSlug: cacheableJob.classifiedNicheSlug,
                nicheName: nicheRow[0].name,
                confidence: cacheableJob.classifiedConfidence,
              };
            }
            // Cache has a stale slug (niche renamed/deleted). Fall
            // through and re-classify rather than 500.
          }
        }

        // 2) Pull the full niche list for both prompt and validation.
        const allNiches = await db!
          .select({ slug: niches.slug, name: niches.name })
          .from(niches)
          .orderBy(asc(niches.sortOrder));
        if (allNiches.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No niches configured",
          });
        }

        // 3) Build the prompt. Caption text is flattened + length-capped
        //    to bound the prompt and keep the model on-task.
        const nicheList = allNiches
          .map((n) => `- ${n.slug}: ${n.name}`)
          .join("\n");
        const captionLines = (input.captions ?? [])
          .slice(0, 5)
          .map((c) => `- ${c.replace(/\s+/g, " ").slice(0, 400)}`)
          .join("\n");

        const prompt = `You are classifying an Instagram creator into one of 30 niches for a content analytics tool.

Creator handle: @${input.handle}
Bio: ${input.bio?.trim() ? input.bio.trim() : "(none)"}
Recent reel captions:
${captionLines || "(none)"}

Available niches (slug: name):
${nicheList}

Return JSON only:
{
  "nicheSlug": "<one slug from the list>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence>"
}`;

        // 4) Call Claude Sonnet via the existing invokeLLM wrapper.
        //    json_object mode (not json_schema) keeps things simple;
        //    we validate the slug against the DB below anyway.
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                "You classify Instagram creators into niches. Respond with valid JSON only, no prose, no markdown, no code fences."
              ),
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });

        const raw = String(
          response.choices[0]?.message?.content ?? ""
        ).trim();
        let parsed: { nicheSlug?: unknown; confidence?: unknown };
        try {
          parsed = sanitizeAiOutputDeep(JSON.parse(raw));
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Classifier returned non-JSON output",
          });
        }

        // 5) Validate slug — the model can hallucinate niches that
        //    aren't in our list. Also coerce confidence to the enum.
        const nicheMatch = allNiches.find(
          (n) => typeof parsed.nicheSlug === "string" && n.slug === parsed.nicheSlug
        );
        if (!nicheMatch) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Classifier returned unknown niche slug: ${String(parsed.nicheSlug)}`,
          });
        }
        const confidence: "high" | "medium" | "low" =
          parsed.confidence === "high" ||
          parsed.confidence === "medium" ||
          parsed.confidence === "low"
            ? parsed.confidence
            : "low";

        // 6) Write-through the cache if we authorized a job row.
        if (cacheableJob) {
          await updateScrapeJob(cacheableJob.id, {
            classifiedNicheSlug: nicheMatch.slug,
            classifiedConfidence: confidence,
            classifiedAt: new Date(),
          });
        }

        return {
          nicheSlug: nicheMatch.slug,
          nicheName: nicheMatch.name,
          confidence,
        };
      }),

    /**
     * Resolve a user-scoped demo scrape job for a featured account id.
     * Used by /dashboard?featuredAccountId=<id> deep-links from /research:
     *
     * - If this user already has a demo job for the creator handle, reuse it.
     * - Otherwise seed one on demand via seedDemoScrape.
     *
     * Mutation (not query) because it may write a new scrape_jobs row.
     */
    ensureDemoJob: protectedProcedure
      .input(z.object({ featuredAccountId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();

        const accountRows = await db!
          .select({
            handle: featuredAccounts.handle,
            isActive: featuredAccounts.isActive,
          })
          .from(featuredAccounts)
          .where(eq(featuredAccounts.id, input.featuredAccountId))
          .limit(1);

        if (accountRows.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Featured creator not found",
          });
        }

        const account = accountRows[0];
        const existingDemo = await db!
          .select({ id: scrapeJobs.id })
          .from(scrapeJobs)
          .where(
            and(
              eq(scrapeJobs.workspaceId, ctx.workspaceId),
              eq(scrapeJobs.handle, account.handle),
              eq(scrapeJobs.isDemo, true),
              eq(scrapeJobs.status, "completed")
            )
          )
          .orderBy(desc(scrapeJobs.createdAt))
          .limit(1);

        // If the creator was deactivated after this user already got a demo
        // copy, keep serving the existing job.
        if (existingDemo.length > 0) {
          return { jobId: existingDemo[0].id };
        }

        if (!account.isActive) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Featured creator is unavailable",
          });
        }

        const ENSURE_DEMO_SEED_TIMEOUT_MS = 30_000;
        let seededJobId: number | null;
        try {
          seededJobId = await Promise.race([
            seedDemoScrape(ctx.user.id, account.handle),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                const err = new Error("ENSURE_DEMO_JOB_SEED_TIMEOUT");
                err.name = "EnsureDemoJobTimeout";
                reject(err);
              }, ENSURE_DEMO_SEED_TIMEOUT_MS);
            }),
          ]);
        } catch (raceErr: unknown) {
          const e = raceErr as { name?: string; message?: string };
          if (e?.name === "EnsureDemoJobTimeout" && e?.message === "ENSURE_DEMO_JOB_SEED_TIMEOUT") {
            console.error(
              `[ensureDemoJob] timeout after 30s for featuredAccountId=${input.featuredAccountId}, userId=${ctx.user.id}`
            );
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Couldn't load this creator right now. Please try again.",
            });
          }
          throw raceErr;
        }
        if (seededJobId == null) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not prepare creator reels right now",
          });
        }
        return { jobId: seededJobId };
      }),
  }),

  // ── Transcription ──
  transcribe: router({
    start: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        const source: "user" | "featured" | "tiktok" | "youtube" =
          input.featuredReelId != null
            ? "featured"
            : input.tiktokVideoId != null
              ? "tiktok"
              : input.youtubeVideoId != null
                ? "youtube"
                : "user";

        // ────────────────────────────────────────────────────────────
        // Featured branch — cache-first (Commit 4b). The catalog owns
        // a single shared transcript per reel in `featured_reels`, so:
        //  1. If the cache is warm (completed / no_speech), return
        //     immediately. No usage burn, no Deepgram call, no row
        //     in `transcriptions`.
        //  2. If another user is already transcribing (`processing`),
        //     return the same key so the UI polls the same cache.
        //  3. Otherwise, kick off Deepgram in the background and
        //     mark the cache `processing`. Retry path clears a prior
        //     `failed` before re-kicking.
        // ────────────────────────────────────────────────────────────
        if (source === "featured") {
          const fr = await getFeaturedReelById(input.featuredReelId!);
          if (!fr) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Featured reel not found" });
          }
          if (
            fr.transcriptionStatus === "completed" ||
            fr.transcriptionStatus === "no_speech"
          ) {
            return { transcriptionId: fr.id, status: "completed" as const };
          }
          if (fr.transcriptionStatus === "processing") {
            return {
              transcriptionId: fr.id,
              status: "processing" as const,
              queuePending: false,
            };
          }

          // pending | failed → charge usage + kick Deepgram.
          const bypassTranscribeLimit = await isFirstRemakeUsageBypassEligible(
            ctx.user.id,
            ctx.user.hasCompletedFirstSpy,
            "transcribeCount"
          );
          if (!bypassTranscribeLimit) {
            const usageCheck = await checkUsageLimit(
              ctx.user.id,
              "transcribeCount",
              ctx.user.openId
            );
            if (!usageCheck.allowed) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
              });
            }
          }
          const queuePending =
            getActiveTranscriptions() >= MAX_CONCURRENT_TRANSCRIPTIONS;
          await updateFeaturedReelTranscription(fr.id, {
            transcriptionStatus: "processing",
          });
          await incrementUsage(ctx.user.id, "transcribeCount");
          runFeaturedReelTranscription({
            id: fr.id,
            shortcode: fr.reelShortcode,
            videoUrl: fr.videoUrl,
          }).catch((err) => {
            console.error(`Featured transcription ${fr.id} failed:`, err);
          });
          return {
            transcriptionId: fr.id,
            status: "processing" as const,
            queuePending,
          };
        }

        if (source === "tiktok") {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }

          const rows = await db
            .select()
            .from(tiktokVideos)
            .where(eq(tiktokVideos.id, input.tiktokVideoId!))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "TikTok video not found",
            });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }

          const existing = await getTranscriptionByTiktokVideoId(video.id);
          if (existing && existing.status === "completed") {
            return {
              transcriptionId: existing.id,
              status: "completed" as const,
            };
          }
          if (existing && existing.status === "processing") {
            return {
              transcriptionId: existing.id,
              status: "processing" as const,
              queuePending: false,
            };
          }

          const bypassTranscribeLimit =
            await isFirstRemakeUsageBypassEligible(
              ctx.user.id,
              ctx.user.hasCompletedFirstSpy,
              "transcribeCount"
            );
          if (!bypassTranscribeLimit) {
            const usageCheck = await checkUsageLimit(
              ctx.user.id,
              "transcribeCount",
              ctx.user.openId
            );
            if (!usageCheck.allowed) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
              });
            }
          }

          if (existing && existing.status === "failed") {
            await db
              .delete(transcriptions)
              .where(eq(transcriptions.id, existing.id));
          }

          const transcriptionId = await createTranscription({
            reelId: null,
            featuredReelId: null,
            tiktokVideoId: video.id,
            workspaceId: ctx.workspaceId,
            status: "processing",
            queuedAt: new Date(),
          });

          await incrementUsage(ctx.user.id, "transcribeCount");

          const queuePending =
            getActiveTranscriptions() >= MAX_CONCURRENT_TRANSCRIPTIONS;
          runTikTokTranscription(transcriptionId, {
            id: video.id,
            awemeId: video.awemeId,
            videoUrl: video.videoUrl,
            videoPageUrl: video.videoPageUrl,
            caption: video.caption,
            thumbnailUrl: video.thumbnailUrl,
          }).catch((error) => {
            console.error(
              `TikTok transcription ${transcriptionId} failed:`,
              error
            );
          });

          return {
            transcriptionId,
            status: "processing" as const,
            queuePending,
          };
        }

        if (source === "youtube") {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }

          const rows = await db
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.id, input.youtubeVideoId!))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "YouTube video not found",
            });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }

          const existing = await getTranscriptionByYoutubeVideoId(video.id);
          if (existing && existing.status === "completed") {
            return {
              transcriptionId: existing.id,
              status: "completed" as const,
            };
          }

          const bypassTranscribeLimit =
            await isFirstRemakeUsageBypassEligible(
              ctx.user.id,
              ctx.user.hasCompletedFirstSpy,
              "transcribeCount"
            );
          if (!bypassTranscribeLimit) {
            const usageCheck = await checkUsageLimit(
              ctx.user.id,
              "transcribeCount",
              ctx.user.openId
            );
            if (!usageCheck.allowed) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
              });
            }
          }

          if (
            existing &&
            (existing.status === "failed" || existing.status === "processing")
          ) {
            await db
              .delete(transcriptions)
              .where(eq(transcriptions.id, existing.id));
          }

          const transcriptResult = await fetchYouTubeTranscript(
            video.videoPageUrl
          );

          if (!transcriptResult) {
            const transcriptionId = await createTranscription({
              reelId: null,
              featuredReelId: null,
              tiktokVideoId: null,
              youtubeVideoId: video.id,
              workspaceId: ctx.workspaceId,
              transcript: "",
              segments: [],
              hookAnalysis: "",
              status: "completed",
              queuedAt: new Date(),
              startedAt: new Date(),
            });
            await incrementUsage(ctx.user.id, "transcribeCount");
            return {
              transcriptionId,
              status: "completed" as const,
            };
          }

          const hookAnalysis = await analyzeHook(
            transcriptResult.transcript,
            video.title || video.description || "",
            video.thumbnailUrl || "",
            transcriptResult.segments,
            "YouTube Short"
          );

          const transcriptionId = await createTranscription({
            reelId: null,
            featuredReelId: null,
            tiktokVideoId: null,
            youtubeVideoId: video.id,
            workspaceId: ctx.workspaceId,
            transcript: transcriptResult.transcript,
            segments: transcriptResult.segments,
            hookAnalysis,
            status: "completed",
            queuedAt: new Date(),
            startedAt: new Date(),
          });

          await incrementUsage(ctx.user.id, "transcribeCount");

          return {
            transcriptionId,
            status: "completed" as const,
          };
        }

        // ────────────────────────────────────────────────────────────
        // User-scrape branch — unchanged behavior. Each user owns
        // their own row in `transcriptions`.
        // ────────────────────────────────────────────────────────────
        const reel = await assertUserScrapeReelInWorkspace(input.reelId!, ctx);
        const reelForRun = {
          id: reel.id,
          shortcode: reel.shortcode,
          videoUrl: reel.videoUrl,
          caption: reel.caption,
          thumbnailUrl: reel.thumbnailUrl,
        };

        const existing = await getTranscriptionByReelId(input.reelId!);
        if (existing && existing.status === "completed") {
          return { transcriptionId: existing.id, status: "completed" as const };
        }
        if (existing && existing.status === "processing") {
          return {
            transcriptionId: existing.id,
            status: "processing" as const,
            queuePending: false,
          };
        }

        const bypassTranscribeLimit = await isFirstRemakeUsageBypassEligible(
          ctx.user.id,
          ctx.user.hasCompletedFirstSpy,
          "transcribeCount"
        );
        if (!bypassTranscribeLimit) {
          const usageCheck = await checkUsageLimit(
            ctx.user.id,
            "transcribeCount",
            ctx.user.openId
          );
          if (!usageCheck.allowed) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
            });
          }
        }
        if (existing && existing.status === "failed") {
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const { transcriptions: transcriptionsTable } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db.delete(transcriptionsTable).where(eq(transcriptionsTable.id, existing.id));
          }
        }

        const transcriptionId = await createTranscription({
          reelId: input.reelId!,
          featuredReelId: null,
          status: "processing",
          queuedAt: new Date(),
        });

        await incrementUsage(ctx.user.id, "transcribeCount");

        const queuePending =
          getActiveTranscriptions() >= MAX_CONCURRENT_TRANSCRIPTIONS;
        runTranscription(transcriptionId, reelForRun).catch((err) => {
          console.error(`Transcription ${transcriptionId} failed:`, err);
        });

        return { transcriptionId, status: "processing" as const, queuePending };
      }),

    status: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .query(async ({ input }) => {
        const transcription =
          input.featuredReelId != null
            ? await getTranscriptionByFeaturedReelId(input.featuredReelId)
            : input.tiktokVideoId != null
              ? await getTranscriptionByTiktokVideoId(input.tiktokVideoId)
              : input.youtubeVideoId != null
                ? await getTranscriptionByYoutubeVideoId(input.youtubeVideoId)
                : await getTranscriptionByReelId(input.reelId!);
        return transcription || null;
      }),
  }),

  // ── Discovery (Creator Radar) ──
  discovery: router({
    routeNiche: discoveryProcedure
      .input(z.object({ description: z.string().min(10).max(500) }))
      .mutation(async ({ input }) => {
        const result = await routeNichePrompt({
          businessDescription: input.description,
        });
        return {
          routedNiche: result.primary_niche,
          confidence: result.confidence,
          clarifyingQuestion: result.clarifying_question ?? null,
        };
      }),

    clarifyRouting: discoveryProcedure
      .input(
        z.object({
          description: z.string().min(10).max(500),
          clarification: z.enum(["peers", "audience"]),
        })
      )
      .mutation(async ({ input }) => {
        const clarificationContext =
          input.clarification === "audience"
            ? "The creator confirmed they are making content FOR their end customers or audience (B2C). They are not selling to other businesses."
            : "The creator confirmed they sell to or target other businesses or peers in their industry (B2B). Route to the niche where their business buyers pay attention.";

        const result = await routeNichePrompt({
          businessDescription: input.description,
          clarificationContext,
        });
        return {
          routedNiche: result.primary_niche,
          confidence: result.confidence,
          clarifyingQuestion: result.clarifying_question ?? null,
        };
      }),

    search: discoveryProcedure
      .input(
        z.object({
          businessDescription: z.string().min(20).max(1000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const insertResult = await db.insert(discoveryJobs).values({
          userId: ctx.user.id,
          businessDescription: input.businessDescription,
          status: "pending",
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create discovery job",
          });
        }

        runDiscoveryJob(jobId, ctx.user.id, input.businessDescription).catch(
          (err) => {
            console.error(`Discovery job ${jobId} failed:`, err);
          }
        );

        return { jobId };
      }),

    jobStatus: discoveryProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select({
            status: discoveryJobs.status,
            routedNiche: discoveryJobs.routedNiche,
            creatorsTotal: discoveryJobs.creatorsTotal,
            creatorsDrilled: discoveryJobs.creatorsDrilled,
            reelsFound: discoveryJobs.reelsFound,
            partialJson: discoveryJobs.partialJson,
            errorMessage: discoveryJobs.errorMessage,
          })
          .from(discoveryJobs)
          .where(
            and(
              eq(discoveryJobs.id, input.jobId),
              eq(discoveryJobs.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!rows[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          });
        }

        return rows[0];
      }),

    recentSearches: discoveryProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          id: discoverySearches.id,
          businessDescription: discoverySearches.businessDescription,
          routedNiche: discoverySearches.routedNiche,
          reelCount: discoverySearches.reelCount,
          createdAt: discoverySearches.createdAt,
        })
        .from(discoverySearches)
        .where(eq(discoverySearches.userId, ctx.user.id))
        .orderBy(desc(discoverySearches.createdAt))
        .limit(10);
    }),

    getSearch: discoveryProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select({ resultJson: discoverySearches.resultJson })
          .from(discoverySearches)
          .where(
            and(
              eq(discoverySearches.id, input.id),
              eq(discoverySearches.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!rows[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Search not found",
          });
        }

        return rows[0].resultJson;
      }),

    deleteSearch: discoveryProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const existing = await db
          .select({ id: discoverySearches.id })
          .from(discoverySearches)
          .where(
            and(
              eq(discoverySearches.id, input.id),
              eq(discoverySearches.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!existing[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Search not found",
          });
        }

        await db
          .delete(discoverySearches)
          .where(eq(discoverySearches.id, input.id));

        return { ok: true as const };
      }),

    getQuota: discoveryProcedure.query(async ({ ctx }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const limits = getPlanLimits(sub.plan as PlanId);
      const used = await countSucceededSearchesThisMonth(ctx.user.id);
      const resetsAt = firstDayOfNextMonthUtc();
      return {
        used,
        limit: limits.discoverySearches,
        resetsAt,
      };
    }),
  }),

  // ── Creator-first Discovery ──
  creatorDiscovery: router({
    search: discoveryProcedure
      .input(
        z.object({
          businessDescription: z.string().min(20).max(1000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const sub = await getUserSubscription(ctx.user.id);
        const limits = getPlanLimits(sub.plan as PlanId);
        const used = await countCombinedDiscoverySearchesThisMonth(ctx.user.id);
        if (used >= limits.discoverySearches) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Monthly discovery search limit reached (${used}/${limits.discoverySearches}). Resets ${firstDayOfNextMonthUtc()}.`,
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const insertResult = await db.insert(creatorDiscoveryJobs).values({
          userId: ctx.user.id,
          businessDescription: input.businessDescription,
          status: "pending",
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create creator discovery job",
          });
        }

        runCreatorDiscoveryJob(
          jobId,
          ctx.user.id,
          input.businessDescription
        ).catch((err) => {
          console.error(`Creator discovery job ${jobId} failed:`, err);
        });

        return { jobId };
      }),

    jobStatus: discoveryProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select({
            status: creatorDiscoveryJobs.status,
            routedNiche: creatorDiscoveryJobs.routedNiche,
            topicsTotal: creatorDiscoveryJobs.topicsTotal,
            topicsSearched: creatorDiscoveryJobs.topicsSearched,
            creatorsFound: creatorDiscoveryJobs.creatorsFound,
            partialJson: creatorDiscoveryJobs.partialJson,
            errorMessage: creatorDiscoveryJobs.errorMessage,
          })
          .from(creatorDiscoveryJobs)
          .where(
            and(
              eq(creatorDiscoveryJobs.id, input.jobId),
              eq(creatorDiscoveryJobs.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!rows[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          });
        }

        return rows[0];
      }),

    recentSearches: discoveryProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          id: creatorDiscoverySearches.id,
          businessDescription: creatorDiscoverySearches.businessDescription,
          routedNiche: creatorDiscoverySearches.routedNiche,
          creatorCount: creatorDiscoverySearches.creatorCount,
          createdAt: creatorDiscoverySearches.createdAt,
        })
        .from(creatorDiscoverySearches)
        .where(eq(creatorDiscoverySearches.userId, ctx.user.id))
        .orderBy(desc(creatorDiscoverySearches.createdAt))
        .limit(10);
    }),

    getSearch: discoveryProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select({ resultJson: creatorDiscoverySearches.resultJson })
          .from(creatorDiscoverySearches)
          .where(
            and(
              eq(creatorDiscoverySearches.id, input.id),
              eq(creatorDiscoverySearches.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!rows[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Search not found",
          });
        }

        return rows[0].resultJson;
      }),

    deleteSearch: discoveryProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const existing = await db
          .select({ id: creatorDiscoverySearches.id })
          .from(creatorDiscoverySearches)
          .where(
            and(
              eq(creatorDiscoverySearches.id, input.id),
              eq(creatorDiscoverySearches.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!existing[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Search not found",
          });
        }

        await db
          .delete(creatorDiscoverySearches)
          .where(eq(creatorDiscoverySearches.id, input.id));

        return { ok: true as const };
      }),

    getQuota: discoveryProcedure.query(async ({ ctx }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const limits = getPlanLimits(sub.plan as PlanId);
      const used = await countCombinedDiscoverySearchesThisMonth(ctx.user.id);
      const resetsAt = firstDayOfNextMonthUtc();
      return {
        used,
        limit: limits.discoverySearches,
        resetsAt,
      };
    }),
  }),

  viralityDiagnostic: router({
    start: discoveryProcedure
      .input(
        z.object({
          handle: z.string().min(1).max(128),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (
          !hasUnlimitedUsage({
            openId: ctx.user.openId,
            email: ctx.user.email,
            role: ctx.user.role,
          })
        ) {
          const sub = await getUserSubscription(ctx.user.id);
          const limits = getPlanLimits(sub.plan as PlanId);
          const used = await countViralityDiagnosticJobsThisMonth(ctx.user.id);
          if (used >= limits.viralityDiagnostics) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Monthly virality diagnostic limit reached (${used}/${limits.viralityDiagnostics}). Resets ${firstDayOfNextMonthUtc()}.`,
            });
          }
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const insertResult = await db.insert(viralityDiagnosticJobs).values({
          userId: ctx.user.id,
          handle: input.handle,
          status: "pending",
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create virality diagnostic job",
          });
        }

        runViralityDiagnosticJob(jobId, ctx.user.id, input.handle).catch(
          (err) => {
            console.error(`Virality diagnostic job ${jobId} failed:`, err);
          }
        );

        return { jobId };
      }),

    jobStatus: discoveryProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select({
            status: viralityDiagnosticJobs.status,
            reelsFound: viralityDiagnosticJobs.reelsFound,
            reelsAnalyzed: viralityDiagnosticJobs.reelsAnalyzed,
            resultJson: viralityDiagnosticJobs.resultJson,
            errorMessage: viralityDiagnosticJobs.errorMessage,
          })
          .from(viralityDiagnosticJobs)
          .where(
            and(
              eq(viralityDiagnosticJobs.id, input.jobId),
              eq(viralityDiagnosticJobs.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!rows[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          });
        }

        return rows[0];
      }),
  }),

  // ── Export ──
  export: router({
    sheetsAvailable: protectedProcedure.query(() => {
      return { available: isGoogleSheetsConfigured() };
    }),

    /** Latest cached Excel export for a scrape job (free re-download if valid). */
    latestForScrapeJob: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          scope: z.enum(EXPORT_SCOPES).optional().default("top_viral_30"),
        })
      )
      .query(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });

        const currentReelCount = await countReelsForJob(input.jobId);
        const effectiveScope = resolveExportScope(currentReelCount, input.scope);

        const active = await getActiveExportJobForScrapeJob(input.jobId, ctx.workspaceId);
        if (active) {
          return {
            exportJobId: active.id,
            status: active.status,
            exportScope: active.exportScope,
            currentStep: active.currentStep,
            progressPercent: active.progressPercent,
            stepDone: active.stepDone,
            stepTotal: active.stepTotal,
            progressLabel: active.progressLabel,
            filename: active.filename,
            isStale: false,
            isExpired: false,
            cached: false,
          };
        }

        const cached = await getLatestCompletedExportForScrapeJob(
          input.jobId,
          ctx.workspaceId,
          effectiveScope
        );
        if (!cached) {
          return null;
        }

        const isExpired =
          cached.expiresAt != null && new Date(cached.expiresAt) < new Date();
        const isStale =
          cached.reelCountAtExport != null &&
          cached.reelCountAtExport < currentReelCount;

        return {
          exportJobId: cached.id,
          status: cached.status,
          exportScope: cached.exportScope,
          currentStep: cached.currentStep,
          progressPercent: cached.progressPercent,
          stepDone: cached.stepDone,
          stepTotal: cached.stepTotal,
          progressLabel: cached.progressLabel,
          filename: cached.filename,
          completedAt: cached.completedAt,
          reelCountAtExport: cached.reelCountAtExport,
          currentReelCount,
          isStale,
          isExpired,
          cached: !isExpired && !isStale,
        };
      }),

    /** Poll export job progress. */
    status: protectedProcedure
      .input(z.object({ exportJobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const row = await getExportJobIfAccessible(input.exportJobId, ctx.workspaceId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });

        const currentReelCount = await countReelsForJob(row.scrapeJobId);
        const isExpired =
          row.expiresAt != null && new Date(row.expiresAt) < new Date();
        const isStale =
          row.reelCountAtExport != null &&
          row.reelCountAtExport < currentReelCount;

        return {
          exportJobId: row.id,
          scrapeJobId: row.scrapeJobId,
          status: row.status,
          exportScope: row.exportScope,
          currentStep: row.currentStep,
          progressPercent: row.progressPercent,
          stepDone: row.stepDone,
          stepTotal: row.stepTotal,
          progressLabel: row.progressLabel,
          filename: row.filename,
          errorMessage: row.errorMessage,
          completedAt: row.completedAt,
          isStale,
          isExpired,
          cached: row.status === "completed" && !isExpired && !isStale,
        };
      }),

    /** Start background export (or return existing in-flight job). */
    start: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          regenerate: z.boolean().optional().default(false),
          scope: z.enum(EXPORT_SCOPES).optional().default("top_viral_30"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });

        const currentReelCount = await countReelsForJob(input.jobId);
        const effectiveScope = resolveExportScope(currentReelCount, input.scope);

        if (!input.regenerate) {
          const active = await getActiveExportJobForScrapeJob(
            input.jobId,
            ctx.workspaceId
          );
          if (active) {
            return {
              exportJobId: active.id,
              status: active.status as "pending" | "processing",
              exportScope: active.exportScope,
              started: false,
              cached: false,
            };
          }

          const cached = await getLatestCompletedExportForScrapeJob(
            input.jobId,
            ctx.workspaceId,
            effectiveScope
          );
          if (cached) {
            const isExpired =
              cached.expiresAt != null && new Date(cached.expiresAt) < new Date();
            const isStale =
              cached.reelCountAtExport != null &&
              cached.reelCountAtExport < currentReelCount;
            if (!isExpired && !isStale) {
              return {
                exportJobId: cached.id,
                status: "completed" as const,
                exportScope: cached.exportScope,
                started: false,
                cached: true,
              };
            }
          }
        }

        const usageCheck = await checkUsageLimit(
          ctx.user.id,
          "exportCount",
          ctx.user.openId
        );
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your export limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "exportCount");

        const exportJobId = await createExportJob({
          userId: ctx.user.id,
          scrapeJobId: input.jobId,
          exportScope: effectiveScope,
          status: "pending",
          currentStep: "pending",
          progressPercent: 0,
          progressLabel: "Queued…",
        });

        runExportJob(
          exportJobId,
          ctx.user.id,
          ctx.user.openId,
          input.jobId,
          ctx.workspaceId
        ).catch((err) => {
          console.error(`[export.start] background job ${exportJobId} failed:`, err);
        });

        return {
          exportJobId,
          status: "pending" as const,
          exportScope: effectiveScope,
          started: true,
          cached: false,
        };
      }),

    /** Download a completed export (no credits). */
    download: protectedProcedure
      .input(z.object({ exportJobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const row = await getExportJobIfAccessible(input.exportJobId, ctx.workspaceId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });
        if (row.status !== "completed" || !row.fileR2Key || !row.filename) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Export is not ready yet.",
          });
        }
        if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This export expired. Regenerate to create a new file.",
          });
        }

        const buffer = await storageReadBuffer(row.fileR2Key);
        return {
          fileBase64: buffer.toString("base64"),
          filename: row.filename,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
      }),

    /** @deprecated Use export.start + export.download */
    csv: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });

        const cached = await getLatestCompletedExportForScrapeJob(
          input.jobId,
          ctx.workspaceId
        );
        const currentReelCount = await countReelsForJob(input.jobId);
        if (
          cached?.fileR2Key &&
          cached.filename &&
          cached.reelCountAtExport === currentReelCount &&
          (!cached.expiresAt || new Date(cached.expiresAt) >= new Date())
        ) {
          const buffer = await storageReadBuffer(cached.fileR2Key);
          return {
            fileBase64: buffer.toString("base64"),
            filename: cached.filename,
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          };
        }

        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Use export.start for background exports.",
        });
      }),

    /** Export to Google Sheets */
    googleSheets: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          email: z.string().email().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!isGoogleSheetsConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Google Sheets is not configured. Please add your Google service account credentials in Settings.",
          });
        }

        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "exportCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your export limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "exportCount");

        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });

        await prepareReelsForExport(input.jobId, ctx.user.id, ctx.user.openId);
        const { rows } = await buildExportRows(input.jobId);

        const title = `Reels - @${job.handle || "export"} - ${new Date().toLocaleDateString()}`;

        const result = await exportToGoogleSheets(title, rows, input.email);

        return {
          spreadsheetUrl: result.spreadsheetUrl,
          spreadsheetId: result.spreadsheetId,
        };
      }),
  }),

  // ── Re-Create Script ──
  recreate: router({
    /** Start script re-creation: analyze viral structure + generate new script */
    generate: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
            topic: z.string().max(2000).optional().default(""),
            gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6", "7", "8"]),
            /** When true and plan allows AI cues, first-generation matches Rewrite behavior. */
            addCues: z.boolean().optional().default(true),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        const source: "user" | "featured" | "tiktok" | "youtube" =
          input.featuredReelId != null
            ? "featured"
            : input.tiktokVideoId != null
              ? "tiktok"
              : input.youtubeVideoId != null
                ? "youtube"
                : "user";
        let caption = "";
        let transcription: Awaited<ReturnType<typeof getTranscriptionByReelId>>;
        let reelForGeneration: any;

        if (source === "featured") {
          const fr = await getFeaturedReelById(input.featuredReelId!);
          if (!fr) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Featured reel not found" });
          }
          caption = fr.caption ?? "";
          reelForGeneration = fr;
          transcription = await getTranscriptionByFeaturedReelId(input.featuredReelId!);
        } else if (source === "tiktok") {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }
          const rows = await db
            .select()
            .from(tiktokVideos)
            .where(eq(tiktokVideos.id, input.tiktokVideoId!))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "TikTok video not found",
            });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          caption = video.caption ?? "";
          reelForGeneration = video;
          transcription = await getTranscriptionByTiktokVideoId(video.id);
        } else if (source === "youtube") {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }
          const rows = await db
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.id, input.youtubeVideoId!))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "YouTube video not found",
            });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          caption = video.title ?? "";
          reelForGeneration = video;
          transcription = await getTranscriptionByYoutubeVideoId(video.id);
        } else {
          const reel = await assertUserScrapeReelInWorkspace(input.reelId!, ctx);
          caption = reel.caption ?? "";
          reelForGeneration = reel;
          transcription = await getTranscriptionByReelId(input.reelId!);
        }

        if (!transcription || transcription.status !== "completed" || !transcription.transcript) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Reel must be transcribed first before re-creating a script.",
          });
        }

        // Check usage limit before generating (first script generation is free)
        const bypassRecreateLimit = await isFirstRemakeUsageBypassEligible(
          ctx.user.id,
          ctx.user.hasCompletedFirstSpy,
          "recreateCount"
        );
        if (!bypassRecreateLimit) {
          const usageCheck = await checkUsageLimit(
            ctx.user.id,
            "recreateCount",
            ctx.user.openId
          );
          if (!usageCheck.allowed) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `You've reached your monthly AI re-creation limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
            });
          }
        }

        const typed = input.topic.trim();
        const biz = (ctx.user.businessDescription ?? "").trim();
        const aud = (ctx.user.targetAudience ?? "").trim();

        const hasExplicitUserAngle = typed.length > 0;

        let promptAngle: string;
        if (hasExplicitUserAngle) {
          promptAngle = buildRecreateTopicPrompt({
            angle: typed,
            targetAudience: aud || null,
            businessDescription: biz || null,
          });
        } else if (aud || biz) {
          const profile = await getCreatorCoachProfile(ctx.user.id);
          const { signals } = await getOrFetchAudienceSignals({
            workspaceId: ctx.workspaceId,
            nicheSlug: profile.nicheSlug,
            nicheLabel: profile.niche,
            targetAudience: profile.targetAudience,
          });
          promptAngle = buildRecreateDefaultTopicPrompt({
            niche: profile.niche,
            targetAudience: profile.targetAudience,
            businessDescription: biz || profile.brandDescription,
            audienceResearchBlock: formatAudienceSignalsForPrompt(signals.slice(0, 5)),
          });
        } else {
          promptAngle = "SAME_TOPIC";
        }

        // storedTopic = what we persist to recreated_scripts.topic (for display, NOT the prompt)
        let storedTopic: string;
        if (typed) storedTopic = typed;
        else if (promptAngle === "SAME_TOPIC") storedTopic = "SAME_TOPIC";
        else storedTopic = "Personalized";

        // Track usage
        await incrementUsage(ctx.user.id, "recreateCount");

        const scriptId = await createRecreatedScript({
          reelId: source === "user" ? input.reelId! : null,
          featuredReelId: source === "featured" ? input.featuredReelId! : null,
          tiktokVideoId: source === "tiktok" ? input.tiktokVideoId! : null,
          youtubeVideoId: source === "youtube" ? input.youtubeVideoId! : null,
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          topic: storedTopic,
          gradeLevel: input.gradeLevel,
          status: "processing",
        });

        const subGen = await getUserSubscription(ctx.user.id);
        const limitsGen = getPlanLimits(subGen.plan as PlanId);
        const effectiveAddCues = Boolean(input.addCues && limitsGen.hasAiCues);

        // Run generation in background
        runScriptGeneration(
          scriptId,
          ctx.user.id,
          transcription.transcript,
          transcription.segments,
          caption,
          reelForGeneration,
          promptAngle,
          input.gradeLevel,
          effectiveAddCues,
          source === "tiktok"
            ? "TikTok video"
            : source === "youtube"
              ? "YouTube Short"
              : "Instagram Reel"
        ).catch((err: unknown) => {
          console.error(`Script generation ${scriptId} failed:`, err);
        });

        return { scriptId, status: "processing" as const };
      }),

    /** Rewrite an existing script with new grade level, target duration, and delivery cues */
    rewrite: protectedProcedure
      .input(
        z.object({
          scriptId: z.number(),
          gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6", "7", "8"]),
          targetDuration: z.enum(["any", "15", "30", "45", "60", "90"]),
          addCues: z.boolean().default(true),
          angle: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existingScript = await assertRecreatedScriptInWorkspace(input.scriptId, ctx);
        if (!existingScript.generatedScript) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Script has no content to rewrite" });
        }

        // Check usage limit before rewriting
        const usageCheck = await checkUsageLimit(ctx.user.id, "rewriteCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your rewrite limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "rewriteCount");

        const subRw = await getUserSubscription(ctx.user.id);
        const limitsRw = getPlanLimits(subRw.plan as PlanId);
        const effectiveAddCues = Boolean(input.addCues && limitsRw.hasAiCues);

        // Get the original source (user-scrape reel OR featured reel) for
        // caption + transcript context. The new rewrite row inherits whichever
        // id the previous row carried so the "exactly one" invariant holds.
        let reelCaption = "";
        let reelTranscript = "";
        if (existingScript.featuredReelId != null) {
          const fr = await getFeaturedReelById(existingScript.featuredReelId);
          reelCaption = fr?.caption ?? "";
          const t = await getTranscriptionByFeaturedReelId(existingScript.featuredReelId);
          reelTranscript = t?.transcript ?? "";
        } else if (existingScript.reelId != null) {
          const reel = await getReelById(existingScript.reelId);
          reelCaption = reel?.caption ?? "";
          const t = await getTranscriptionByReelId(existingScript.reelId);
          reelTranscript = t?.transcript ?? "";
        }

        const trimmedAngle = input.angle?.trim() ?? "";
        let storedTopic = existingScript.topic || "SAME_TOPIC";
        let promptAngle: string | undefined;
        const hasExplicitUserAngle = trimmedAngle.length > 0;
        if (hasExplicitUserAngle) {
          const aud = (ctx.user.targetAudience ?? "").trim();
          const biz = (ctx.user.businessDescription ?? "").trim();
          promptAngle = buildRecreateTopicPrompt({
            angle: trimmedAngle,
            targetAudience: aud || null,
            businessDescription: biz || null,
          });
          storedTopic = trimmedAngle;
        }

        // Create a new script entry for the rewrite
        const newScriptId = await createRecreatedScript({
          reelId: existingScript.reelId,
          featuredReelId: existingScript.featuredReelId,
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          topic: storedTopic,
          gradeLevel: input.gradeLevel,
          status: "processing",
        });

        // Run rewrite in background
        runScriptRewrite(
          newScriptId,
          existingScript.generatedScript,
          existingScript.viralStructure as Record<string, unknown> | null,
          reelTranscript,
          reelCaption,
          input.gradeLevel,
          input.targetDuration,
          effectiveAddCues,
          promptAngle,
          hasExplicitUserAngle
        ).catch((err: unknown) => {
          console.error(`Script rewrite ${newScriptId} failed:`, err);
        });

        return { scriptId: newScriptId, status: "processing" as const };
      }),

    /** Get status of a specific recreated script */
    status: protectedProcedure
      .input(z.object({ scriptId: z.number() }))
      .query(async ({ ctx, input }) => {
        return assertRecreatedScriptInWorkspace(input.scriptId, ctx);
      }),

    /** List all recreated scripts for a reel (either source). */
    list: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .query(async ({ ctx, input }) => {
        if (input.featuredReelId != null) {
          return getRecreatedScriptsByFeaturedReelId(
            input.featuredReelId,
            ctx.workspaceId
          );
        }
        if (input.tiktokVideoId != null) {
          return getRecreatedScriptsByTiktokVideoId(
            input.tiktokVideoId,
            ctx.workspaceId
          );
        }
        if (input.youtubeVideoId != null) {
          return getRecreatedScriptsByYoutubeVideoId(
            input.youtubeVideoId,
            ctx.workspaceId
          );
        }
        return getRecreatedScriptsByReelId(input.reelId!, ctx.workspaceId);
      }),

    /**
     * Latest recreated script per reel (max row id) for the current user.
     * Dashboard list/grid uses this to show Make My Version / Generating /
     * Open My Script. Missing keys = no row yet. Exactly one of reelIds /
     * featuredReelIds / tiktokVideoIds / youtubeVideoIds must be non-empty.
     */
    checkBatch: protectedProcedure
      .input(
        z
          .object({
            reelIds: z.array(z.number()).optional(),
            featuredReelIds: z.array(z.number()).optional(),
            tiktokVideoIds: z.array(z.number()).optional(),
            youtubeVideoIds: z.array(z.number()).optional(),
          })
          .refine(
            (d) =>
              [
                d.reelIds && d.reelIds.length > 0,
                d.featuredReelIds && d.featuredReelIds.length > 0,
                d.tiktokVideoIds && d.tiktokVideoIds.length > 0,
                d.youtubeVideoIds && d.youtubeVideoIds.length > 0,
              ].filter(Boolean).length === 1,
            {
              message:
                "Provide exactly one of reelIds, featuredReelIds, tiktokVideoIds, or youtubeVideoIds (non-empty)",
            }
          )
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const map: Record<
          number,
          { latestScriptId: number; status: (typeof recreatedScripts.$inferSelect)["status"] }
        > = {};

        const fillBest = (
          rows: Array<{
            sourceId: number | null;
            id: number;
            status: (typeof recreatedScripts.$inferSelect)["status"];
          }>
        ) => {
          const best = new Map<
            number,
            { id: number; status: (typeof recreatedScripts.$inferSelect)["status"] }
          >();
          for (const r of rows) {
            if (r.sourceId == null) continue;
            const cur = best.get(r.sourceId);
            if (!cur || r.id > cur.id) {
              best.set(r.sourceId, { id: r.id, status: r.status });
            }
          }
          for (const [sid, v] of best) {
            map[sid] = { latestScriptId: v.id, status: v.status };
          }
        };

        if (input.featuredReelIds && input.featuredReelIds.length > 0) {
          const rows = await db
            .select({
              sourceId: recreatedScripts.featuredReelId,
              id: recreatedScripts.id,
              status: recreatedScripts.status,
            })
            .from(recreatedScripts)
            .where(
              and(
                eq(recreatedScripts.workspaceId, ctx.workspaceId),
                inArray(
                  recreatedScripts.featuredReelId as any,
                  input.featuredReelIds
                )
              )
            );
          fillBest(rows);
          return map;
        }

        if (input.tiktokVideoIds && input.tiktokVideoIds.length > 0) {
          const rows = await db
            .select({
              sourceId: recreatedScripts.tiktokVideoId,
              id: recreatedScripts.id,
              status: recreatedScripts.status,
            })
            .from(recreatedScripts)
            .where(
              and(
                eq(recreatedScripts.workspaceId, ctx.workspaceId),
                inArray(
                  recreatedScripts.tiktokVideoId as any,
                  input.tiktokVideoIds
                )
              )
            );
          fillBest(rows);
          return map;
        }

        if (input.youtubeVideoIds && input.youtubeVideoIds.length > 0) {
          const rows = await db
            .select({
              sourceId: recreatedScripts.youtubeVideoId,
              id: recreatedScripts.id,
              status: recreatedScripts.status,
            })
            .from(recreatedScripts)
            .where(
              and(
                eq(recreatedScripts.workspaceId, ctx.workspaceId),
                inArray(
                  recreatedScripts.youtubeVideoId as any,
                  input.youtubeVideoIds
                )
              )
            );
          fillBest(rows);
          return map;
        }

        const rows = await db
          .select({
            sourceId: recreatedScripts.reelId,
            id: recreatedScripts.id,
            status: recreatedScripts.status,
          })
          .from(recreatedScripts)
          .where(
            and(
              eq(recreatedScripts.workspaceId, ctx.workspaceId),
              inArray(recreatedScripts.reelId as any, input.reelIds!)
            )
          );
        fillBest(rows);
        return map;
      }),
  }),

  // ── Saved Reels ──
  saved: router({
    /**
     * Toggle save/unsave a reel. Accepts exactly one of:
     * (`reelId` + `jobId`), `featuredReelId`, `tiktokVideoId`, or `youtubeVideoId`.
     * The db helpers keep the keyspaces separate so the
     * "exactly-one-column-populated" invariant holds.
     */
    toggle: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            jobId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) => {
              const userPair = d.reelId != null && d.jobId != null;
              const userPartial =
                (d.reelId != null) !== (d.jobId != null); // one but not both
              if (userPartial) return false;
              const modes = [
                userPair,
                d.featuredReelId != null,
                d.tiktokVideoId != null,
                d.youtubeVideoId != null,
              ].filter(Boolean);
              return modes.length === 1;
            },
            {
              message:
                "Provide exactly one of (reelId + jobId), featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        if (input.featuredReelId != null) {
          const alreadySaved = await isFeaturedReelSaved(
            ctx.workspaceId,
            ctx.user.id,
            input.featuredReelId
          );
          if (alreadySaved) {
            await unsaveFeaturedReel(ctx.workspaceId, ctx.user.id, input.featuredReelId);
            return { saved: false } as const;
          }
          await saveFeaturedReel(ctx.user.id, input.featuredReelId, ctx.workspaceId);
          return { saved: true } as const;
        }
        if (input.tiktokVideoId != null) {
          const alreadySaved = await isTiktokVideoSaved(
            ctx.workspaceId,
            ctx.user.id,
            input.tiktokVideoId
          );
          if (alreadySaved) {
            await unsaveTiktokVideo(ctx.workspaceId, ctx.user.id, input.tiktokVideoId);
            return { saved: false } as const;
          }
          await saveTiktokVideo(ctx.user.id, input.tiktokVideoId, ctx.workspaceId);
          return { saved: true } as const;
        }
        if (input.youtubeVideoId != null) {
          const alreadySaved = await isYoutubeVideoSaved(
            ctx.workspaceId,
            ctx.user.id,
            input.youtubeVideoId
          );
          if (alreadySaved) {
            await unsaveYoutubeVideo(ctx.workspaceId, ctx.user.id, input.youtubeVideoId);
            return { saved: false } as const;
          }
          await saveYoutubeVideo(ctx.user.id, input.youtubeVideoId, ctx.workspaceId);
          return { saved: true } as const;
        }
        const alreadySaved = await isReelSaved(ctx.workspaceId, ctx.user.id, input.reelId!);
        if (alreadySaved) {
          await unsaveReel(ctx.workspaceId, ctx.user.id, input.reelId!);
          return { saved: false } as const;
        }
        await saveReel({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          reelId: input.reelId!,
          jobId: input.jobId!,
        });
        return { saved: true } as const;
      }),

    /** Check if a reel is saved (either source). */
    check: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
          })
          .refine(
            (d) => (d.reelId != null) !== (d.featuredReelId != null),
            { message: "Provide exactly one of reelId or featuredReelId" }
          )
      )
      .query(async ({ ctx, input }) => {
        if (input.featuredReelId != null) {
          return {
            saved: await isFeaturedReelSaved(
              ctx.workspaceId,
              ctx.user.id,
              input.featuredReelId
            ),
          };
        }
        return { saved: await isReelSaved(ctx.workspaceId, ctx.user.id, input.reelId!) };
      }),

    /**
     * Check which reels from a list are saved. Callers pass exactly one of
     * `reelIds`, `featuredReelIds`, `tiktokVideoIds`, or `youtubeVideoIds`.
     * Returned map is keyed by whichever id type was supplied.
     */
    checkBatch: protectedProcedure
      .input(
        z
          .object({
            reelIds: z.array(z.number()).optional(),
            featuredReelIds: z.array(z.number()).optional(),
            tiktokVideoIds: z.array(z.number()).optional(),
            youtubeVideoIds: z.array(z.number()).optional(),
          })
          .refine(
            (d) =>
              [
                d.reelIds,
                d.featuredReelIds,
                d.tiktokVideoIds,
                d.youtubeVideoIds,
              ].filter((ids) => ids != null).length === 1,
            {
              message:
                "Provide exactly one of reelIds, featuredReelIds, tiktokVideoIds, or youtubeVideoIds",
            }
          )
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { workspaceId } = ctx;
        const userId = ctx.user.id;
        const savedMap: Record<number, boolean> = {};

        if (input.featuredReelIds) {
          const ids = input.featuredReelIds;
          for (const id of ids) savedMap[id] = false;
          if (ids.length === 0) return savedMap;
          const savedSet = new Set<number>();
          for (let i = 0; i < ids.length; i += SAVED_CHECK_BATCH) {
            const chunk = ids.slice(i, i + SAVED_CHECK_BATCH);
            const rows = await db
              .select({ featuredReelId: savedReels.featuredReelId })
              .from(savedReels)
              .where(
                and(
                  eq(savedReels.workspaceId, workspaceId),
                  eq(savedReels.userId, userId),
                  inArray(savedReels.featuredReelId, chunk)
                )
              );
            for (const r of rows) {
              if (r.featuredReelId != null) savedSet.add(r.featuredReelId);
            }
          }
          for (const id of ids) savedMap[id] = savedSet.has(id);
          return savedMap;
        }

        if (input.tiktokVideoIds) {
          const ids = input.tiktokVideoIds;
          for (const id of ids) savedMap[id] = false;
          if (ids.length === 0) return savedMap;
          const savedSet = new Set<number>();
          for (let i = 0; i < ids.length; i += SAVED_CHECK_BATCH) {
            const chunk = ids.slice(i, i + SAVED_CHECK_BATCH);
            const rows = await db
              .select({ tiktokVideoId: savedReels.tiktokVideoId })
              .from(savedReels)
              .where(
                and(
                  eq(savedReels.workspaceId, workspaceId),
                  eq(savedReels.userId, userId),
                  inArray(savedReels.tiktokVideoId, chunk)
                )
              );
            for (const r of rows) {
              if (r.tiktokVideoId != null) savedSet.add(r.tiktokVideoId);
            }
          }
          for (const id of ids) savedMap[id] = savedSet.has(id);
          return savedMap;
        }

        if (input.youtubeVideoIds) {
          const ids = input.youtubeVideoIds;
          for (const id of ids) savedMap[id] = false;
          if (ids.length === 0) return savedMap;
          const savedSet = new Set<number>();
          for (let i = 0; i < ids.length; i += SAVED_CHECK_BATCH) {
            const chunk = ids.slice(i, i + SAVED_CHECK_BATCH);
            const rows = await db
              .select({ youtubeVideoId: savedReels.youtubeVideoId })
              .from(savedReels)
              .where(
                and(
                  eq(savedReels.workspaceId, workspaceId),
                  eq(savedReels.userId, userId),
                  inArray(savedReels.youtubeVideoId, chunk)
                )
              );
            for (const r of rows) {
              if (r.youtubeVideoId != null) savedSet.add(r.youtubeVideoId);
            }
          }
          for (const id of ids) savedMap[id] = savedSet.has(id);
          return savedMap;
        }

        const ids = input.reelIds!;
        for (const id of ids) savedMap[id] = false;
        if (ids.length === 0) return savedMap;
        const savedSet = new Set<number>();
        for (let i = 0; i < ids.length; i += SAVED_CHECK_BATCH) {
          const chunk = ids.slice(i, i + SAVED_CHECK_BATCH);
          const rows = await db
            .select({ reelId: savedReels.reelId })
            .from(savedReels)
            .where(
              and(
                eq(savedReels.workspaceId, workspaceId),
                eq(savedReels.userId, userId),
                inArray(savedReels.reelId, chunk)
              )
            );
          for (const r of rows) {
            if (r.reelId != null) savedSet.add(r.reelId);
          }
        }
        for (const id of ids) savedMap[id] = savedSet.has(id);
        return savedMap;
      }),

    /**
     * List all saved reels with full details. Merges the sources
     * behind a single normalized shape — each item exposes `source`
     * ("scraped" | "featured" | "discover" | "tiktok" | "youtube") so the
     * frontend can route clicks to the correct URL. Shape keeps the
     * `reel` + `job` fields the existing UI already consumes for scraped
     * rows; other sources synth the same keys.
     */
    list: protectedProcedure.query(async ({ ctx }) => {
      const scraped = await getSavedReelsWithDetails(ctx.workspaceId);
      const featured = await getSavedFeaturedReelsWithDetails(ctx.workspaceId);
      const discover = await getSavedDiscoverReelsWithDetails(ctx.workspaceId);
      const tiktok = await getSavedTiktokVideosWithDetails(ctx.workspaceId);
      const youtube = await getSavedYoutubeVideosWithDetails(ctx.workspaceId);

      type ListedSaved = {
        id: number;
        userId: number;
        createdAt: Date;
        source: "scraped" | "featured" | "discover" | "tiktok" | "youtube";
        reelId: number | null;
        jobId: number | null;
        featuredReelId: number | null;
        tiktokVideoId: number | null;
        youtubeVideoId: number | null;
        reel: {
          id: number;
          shortcode: string;
          thumbnailUrl: string | null;
          videoUrl: string | null;
          caption: string | null;
          viewCount: number;
          likeCount: number;
          commentCount: number;
          duration: number | null;
          postedAt: Date;
          reelUrl: string;
          ownerUsername: string | null;
          contentType: string | null;
          remakeabilityScore: number | null;
          suggestedAction: string | null;
          classificationReason: string | null;
          classifiedAt: Date | null;
        };
        job: {
          id: number;
          handle: string;
          followerCount: number;
          featuredAccountId: number | null;
        };
        transcription?: SavedListTranscriptionSummary;
      };

      const scrapedItems: ListedSaved[] = scraped.map((s) => ({
        id: s.id,
        userId: s.userId,
        createdAt: s.createdAt,
        source: "scraped" as const,
        reelId: s.reelId,
        jobId: s.jobId,
        featuredReelId: null,
        tiktokVideoId: null,
        youtubeVideoId: null,
        reel: {
          id: s.reel.id,
          shortcode: s.reel.shortcode,
          thumbnailUrl: s.reel.thumbnailUrl,
          videoUrl: s.reel.videoUrl,
          caption: s.reel.caption,
          viewCount: s.reel.viewCount ?? 0,
          likeCount: s.reel.likeCount ?? 0,
          commentCount: s.reel.commentCount ?? 0,
          duration: s.reel.duration,
          postedAt: s.reel.postedAt,
          reelUrl: s.reel.reelUrl,
          ownerUsername: s.reel.ownerUsername,
          contentType: s.reel.contentType ?? null,
          remakeabilityScore: s.reel.remakeabilityScore ?? null,
          suggestedAction: s.reel.suggestedAction ?? null,
          classificationReason: s.reel.classificationReason ?? null,
          classifiedAt: s.reel.classifiedAt ?? null,
        },
        job: {
          id: s.job.id,
          handle: s.job.handle,
          followerCount: s.job.followerCount ?? 0,
          featuredAccountId: null,
        },
        transcription: toSavedListTranscriptionSummary(s.transcription),
      }));

      const featuredItems: ListedSaved[] = featured.map((f) => ({
        id: f.id,
        userId: f.userId,
        createdAt: f.createdAt,
        source: "featured" as const,
        reelId: null,
        jobId: null,
        featuredReelId: f.featuredReelId,
        tiktokVideoId: null,
        youtubeVideoId: null,
        reel: {
          id: f.featuredReel.id,
          shortcode: f.featuredReel.reelShortcode,
          thumbnailUrl: f.featuredReel.thumbnailUrl,
          videoUrl: f.featuredReel.videoUrl,
          caption: f.featuredReel.caption,
          viewCount: f.featuredReel.viewCount ?? 0,
          likeCount: f.featuredReel.likeCount ?? 0,
          commentCount: f.featuredReel.commentCount ?? 0,
          duration: f.featuredReel.duration,
          postedAt: f.featuredReel.postedAt,
          reelUrl: `https://www.instagram.com/reel/${f.featuredReel.reelShortcode}/`,
          ownerUsername: f.featuredAccount.handle,
          contentType: f.featuredReel.contentType ?? null,
          remakeabilityScore: f.featuredReel.remakeabilityScore ?? null,
          suggestedAction: f.featuredReel.suggestedAction ?? null,
          classificationReason: f.featuredReel.classificationReason ?? null,
          classifiedAt: f.featuredReel.classifiedAt ?? null,
        },
        job: {
          id: f.featuredAccount.id,
          handle: f.featuredAccount.handle,
          followerCount: f.featuredAccount.followerCount ?? 0,
          featuredAccountId: f.featuredAccount.id,
        },
        transcription: toSavedListTranscriptionSummary(f.transcription),
      }));

      const discoverItems: ListedSaved[] = discover.map((d) => ({
        id: d.id,
        userId: d.userId,
        createdAt: d.createdAt,
        source: "discover" as const,
        reelId: d.reelId,
        jobId: d.jobId,
        featuredReelId: null,
        tiktokVideoId: null,
        youtubeVideoId: null,
        reel: {
          id: d.reel.id,
          shortcode: d.reel.shortcode,
          thumbnailUrl: d.reel.thumbnailUrl,
          videoUrl: d.reel.videoUrl,
          caption: d.reel.caption,
          viewCount: d.reel.viewCount ?? 0,
          likeCount: d.reel.likeCount ?? 0,
          commentCount: d.reel.commentCount ?? 0,
          duration: d.reel.duration,
          postedAt: d.reel.postedAt,
          reelUrl: d.reel.reelUrl,
          ownerUsername: d.reel.ownerUsername,
          contentType: d.reel.contentType ?? null,
          remakeabilityScore: d.reel.remakeabilityScore ?? null,
          suggestedAction: d.reel.suggestedAction ?? null,
          classificationReason: d.reel.classificationReason ?? null,
          classifiedAt: d.reel.classifiedAt ?? null,
        },
        job: {
          id: d.job.id,
          handle: d.job.handle,
          followerCount: d.job.followerCount,
          featuredAccountId: d.job.featuredAccountId,
        },
        transcription: toSavedListTranscriptionSummary(d.transcription),
      }));

      const tiktokItems: ListedSaved[] = tiktok.map((t) => ({
        id: t.id,
        userId: t.userId,
        createdAt: t.createdAt,
        source: "tiktok" as const,
        reelId: null,
        jobId: t.job.id,
        featuredReelId: null,
        tiktokVideoId: t.tiktokVideoId,
        youtubeVideoId: null,
        reel: {
          id: t.video.id,
          shortcode: t.video.awemeId,
          thumbnailUrl: t.video.thumbnailUrl,
          videoUrl: t.video.videoUrl,
          caption: t.video.caption,
          viewCount: t.video.viewCount ?? 0,
          likeCount: t.video.likeCount ?? 0,
          commentCount: t.video.commentCount ?? 0,
          duration: t.video.durationSec,
          postedAt: t.video.postedAt,
          reelUrl: t.video.videoPageUrl,
          ownerUsername: t.video.ownerUsername ?? t.job.handle,
          contentType: null,
          remakeabilityScore: null,
          suggestedAction: null,
          classificationReason: null,
          classifiedAt: null,
        },
        job: {
          id: t.job.id,
          handle: t.job.handle,
          followerCount: t.job.followerCount ?? 0,
          featuredAccountId: null,
        },
        transcription: toSavedListTranscriptionSummary(t.transcription),
      }));

      const youtubeItems: ListedSaved[] = youtube.map((y) => ({
        id: y.id,
        userId: y.userId,
        createdAt: y.createdAt,
        source: "youtube" as const,
        reelId: null,
        jobId: y.job.id,
        featuredReelId: null,
        tiktokVideoId: null,
        youtubeVideoId: y.youtubeVideoId,
        reel: {
          id: y.video.id,
          shortcode: y.video.videoId,
          thumbnailUrl: y.video.thumbnailUrl,
          videoUrl: null,
          caption: y.video.title ?? y.video.description,
          viewCount: y.video.viewCount ?? 0,
          likeCount: y.video.likeCount ?? 0,
          commentCount: y.video.commentCount ?? 0,
          duration: y.video.durationSec,
          postedAt: y.video.postedAt,
          reelUrl: y.video.videoPageUrl,
          ownerUsername: y.video.ownerHandle ?? y.job.handle,
          contentType: null,
          remakeabilityScore: null,
          suggestedAction: null,
          classificationReason: null,
          classifiedAt: null,
        },
        job: {
          id: y.job.id,
          handle: y.job.handle,
          followerCount: y.job.subscriberCount ?? 0,
          featuredAccountId: null,
        },
        transcription: toSavedListTranscriptionSummary(y.transcription),
      }));

      const combined = [
        ...scrapedItems,
        ...featuredItems,
        ...discoverItems,
        ...tiktokItems,
        ...youtubeItems,
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return combined;
    }),
  }),

  // ── Script Library ──
  scripts: router({
    /** Save a script to the library */
    save: protectedProcedure
      .input(z.object({
        reelId: z.number().optional(),
        recreatedScriptId: z.number().optional(),
        title: z.string().min(1),
        content: z.string().min(1),
        sourceHandle: z.string().optional(),
        gradeLevel: z.string().optional(),
        postDate: z.string().optional(), // ISO date string
        postTime: z.string().optional(), // HH:MM format
        notes: z.string().optional(),
        tagIds: z.array(z.number()).optional(),
        status: z.enum(["draft", "approved"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await ensureDefaultTags(ctx.workspaceId, ctx.user.id);
        const wordCount = input.content.trim().split(/\s+/).length;
        const scriptId = await createSavedScript({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          reelId: input.reelId ?? null,
          recreatedScriptId: input.recreatedScriptId ?? null,
          title: input.title,
          content: input.content,
          originalContent: input.content,
          sourceHandle: input.sourceHandle ?? null,
          gradeLevel: input.gradeLevel ?? null,
          wordCount,
          postDate: input.postDate ? parseDateSafe(input.postDate) : null,
          postTime: input.postTime ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "draft",
        });
        // Create initial version
        await createScriptVersion({
          scriptId,
          content: input.content,
          versionNumber: 1,
          changeType: "initial",
          changeDescription: "Initial script saved",
        });
        // Assign tags
        if (input.tagIds && input.tagIds.length > 0) {
          for (const tagId of input.tagIds) {
            await assignTagToScript(scriptId, tagId);
          }
        }
        return { id: scriptId };
      }),

    /** Get a single script with tags and versions */
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const script = await assertScriptInWorkspace(input.id, ctx);
        const tags = await getTagsForScript(input.id);
        const versions = await getScriptVersions(input.id);
        const [enriched] = await enrichScriptsWithSendMeta([script]);
        let sourceReel = null;
        if (script.reelId != null) {
          const reel = await getReelById(script.reelId);
          if (reel) {
            sourceReel = toSourceReel(reel);
          }
        }
        return { ...enriched, tags, versions, sourceReel };
      }),

    /** List all scripts for the user */
    list: protectedProcedure
      .input(z.object({
        tagId: z.number().optional(),
        status: z.enum(["draft", "approved"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        await ensureDefaultTags(ctx.workspaceId, ctx.user.id);
        let scripts: Awaited<ReturnType<typeof getSavedScriptsByWorkspace>>;
        if (input?.tagId) {
          scripts = await getScriptsByTag(ctx.workspaceId, input.tagId);
        } else {
          scripts = await getSavedScriptsByWorkspace(ctx.workspaceId);
        }
        if (input?.status) {
          scripts = scripts.filter(s => s.status === input.status);
        }
        const tagMap = await getTagsForScripts(scripts.map((s) => s.id));
        const result = scripts.map((s) => ({
          ...s,
          tags: tagMap.get(s.id) ?? [],
        }));
        return enrichScriptsWithSendMeta(result);
      }),

    /** Update a script (content, title, postDate, notes, status) */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        postDate: z.string().nullable().optional(),
        postTime: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["draft", "approved"]).optional(),
        gradeLevel: z.string().optional(),
        generatedCaption: z.string().nullable().optional(),
        generatedHashtags: z.string().nullable().optional(),
        captionStyle: z.string().nullable().optional(),
        changeType: z.enum(["manual_edit", "ai_rewrite", "grammar_fix"]).optional(),
        changeDescription: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.id, ctx);
        const updateData: Parameters<typeof updateSavedScript>[1] = {};
        if (input.title !== undefined) updateData.title = input.title;
        if (input.postDate !== undefined) updateData.postDate = input.postDate ? parseDateSafe(input.postDate) : null;
        if (input.postTime !== undefined) updateData.postTime = input.postTime;
        if (input.notes !== undefined) updateData.notes = input.notes;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.gradeLevel !== undefined) updateData.gradeLevel = input.gradeLevel;
        if (input.generatedCaption !== undefined) (updateData as any).generatedCaption = input.generatedCaption;
        if (input.generatedHashtags !== undefined) (updateData as any).generatedHashtags = input.generatedHashtags;
        if (input.captionStyle !== undefined) (updateData as any).captionStyle = input.captionStyle;
        if (input.content !== undefined) {
          updateData.content = input.content;
          updateData.wordCount = input.content.trim().split(/\s+/).length;
          // Create a new version
          const versionNum = await getLatestVersionNumber(input.id);
          await createScriptVersion({
            scriptId: input.id,
            content: input.content,
            versionNumber: versionNum + 1,
            changeType: input.changeType || "manual_edit",
            changeDescription: input.changeDescription || "Manual edit",
          });
        }
        await updateSavedScript(input.id, updateData);
        return { success: true };
      }),

    /** Delete a script */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.id, ctx);
        await deleteSavedScript(input.id);
        return { success: true };
      }),

    /** Assign/remove tags */
    assignTag: protectedProcedure
      .input(z.object({ scriptId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        await assignTagToScript(input.scriptId, input.tagId);
        return { success: true };
      }),

    removeTag: protectedProcedure
      .input(z.object({ scriptId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        await removeTagFromScript(input.scriptId, input.tagId);
        return { success: true };
      }),

    bulkAssignTag: protectedProcedure
      .input(
        z.object({
          scriptIds: z.array(z.number()).min(1).max(50),
          tagId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        for (const scriptId of input.scriptIds) {
          await assertScriptInWorkspace(scriptId, ctx);
          await assignTagToScript(scriptId, input.tagId);
        }
        return { success: true, count: input.scriptIds.length };
      }),

    bulkRemoveTag: protectedProcedure
      .input(
        z.object({
          scriptIds: z.array(z.number()).min(1).max(50),
          tagId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        for (const scriptId of input.scriptIds) {
          await assertScriptInWorkspace(scriptId, ctx);
          await removeTagFromScript(scriptId, input.tagId);
        }
        return { success: true, count: input.scriptIds.length };
      }),

    /** AI Grammar Check - fix spelling, grammar, sentence structure */
    grammarCheck: protectedProcedure
      .input(z.object({ scriptId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                "You are a professional editor and grammar checker. Fix spelling mistakes, grammar errors, and improve sentence structure while keeping the original meaning, tone, and style intact. Do NOT change the content or add new ideas. Return ONLY the corrected text, nothing else."
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const corrected = (response.choices[0]?.message?.content as string) || input.content;
        // Save the corrected version
        const wordCount = corrected.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: corrected,
          versionNumber: versionNum + 1,
          changeType: "grammar_fix",
          changeDescription: "AI grammar and spelling correction",
        });
        await updateSavedScript(input.scriptId, { content: corrected, wordCount });
        return { content: corrected };
      }),

    /** AI Rewrite - rewrite the script with AI while keeping the same structure */
    aiRewrite: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        instruction: z.string().optional(), // optional custom instruction
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const instruction = input.instruction || "Rewrite this script to sound more natural and engaging while keeping the exact same structure, topic, and key points. Make it sound like a confident creator speaking to camera.";
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a professional script rewriter for short-form video content. ${instruction} Return ONLY the rewritten script text, nothing else.`
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const rewritten = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = rewritten.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: rewritten,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: input.instruction || "AI rewrite for natural delivery",
        });
        await updateSavedScript(input.scriptId, { content: rewritten, wordCount });
        return { content: rewritten };
      }),

    /** Phrase Swapper - swap key phrases with creative alternatives */
    phraseSwap: protectedProcedure
      .input(z.object({ scriptId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                "You are a creative copywriter for short-form video scripts. Your job is to swap key phrases, power words, and expressions with fresh, punchy alternatives that sound more engaging and viral. Keep the same meaning, structure, and flow. Swap at least 5-8 phrases throughout the script. Do NOT add new sentences or change the topic. Return ONLY the updated script text, nothing else."
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const swapped = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = swapped.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: swapped,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: "AI phrase swap - refreshed key phrases",
        });
        await updateSavedScript(input.scriptId, { content: swapped, wordCount });
        return { content: swapped };
      }),

    /** Simplifier - make script more conversational and easy to understand */
    simplify: protectedProcedure
      .input(z.object({ scriptId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                "You are a script simplifier for short-form video content. Rewrite this script using simpler, everyday language that anyone can understand. Use short sentences. Replace jargon with plain words. Make it sound like you're talking to a friend. Keep the same structure, key points, and hook. Return ONLY the simplified script text, nothing else."
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const simplified = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = simplified.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: simplified,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: "AI simplification - made more conversational",
        });
        await updateSavedScript(input.scriptId, { content: simplified, wordCount });
        return { content: simplified };
      }),

    /** Grade Level - rewrite at a specific tone/level */
    adjustTone: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        tone: z.enum(["casual", "professional", "academic", "gen_z", "storyteller"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const tonePrompts: Record<string, string> = {
          casual: "Rewrite in a super casual, friendly tone, like texting a buddy. Use contractions, slang, and keep it real. Short punchy sentences.",
          professional: "Rewrite in a polished, professional tone suitable for a business audience. Clear, confident, and authoritative. No slang.",
          academic: "Rewrite in an educational, informative tone. Use precise language, cite-worthy phrasing, and structured arguments. Sound like a TED talk.",
          gen_z: "Rewrite in Gen Z internet speak. Use trending phrases, be relatable, add energy. Think TikTok creator vibes. Keep it short and punchy with attitude.",
          storyteller: "Rewrite as a compelling story. Add narrative hooks, build tension, use vivid descriptions. Make the viewer feel like they're watching a mini-movie.",
        };
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a script tone adjuster for short-form video content. ${tonePrompts[input.tone]} Keep the same key points and structure. Return ONLY the rewritten script text, nothing else.`
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const adjusted = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = adjusted.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: adjusted,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Tone adjusted to ${input.tone}`,
        });
        await updateSavedScript(input.scriptId, { content: adjusted, wordCount });
        return { content: adjusted };
      }),

    /** Make Shorter - condense script to fit a target duration */
    makeShorter: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        targetSeconds: z.number().min(15).max(120),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        // Average speaking rate: ~3 words per second
        const targetWords = Math.round(input.targetSeconds * 3);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a script editor specializing in short-form video content. Condense this script to approximately ${targetWords} words (about ${input.targetSeconds} seconds when spoken). Keep the hook, the core message, and the call-to-action. Cut filler, redundant points, and unnecessary details. Make every word count. Return ONLY the shortened script text, nothing else.`
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const shortened = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = shortened.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: shortened,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Shortened to ~${input.targetSeconds}s (${targetWords} words target)`,
        });
        await updateSavedScript(input.scriptId, { content: shortened, wordCount });
        return { content: shortened };
      }),

    /** Rewrite Selected Lines - rewrite only the highlighted portion */
    rewriteSelection: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        fullContent: z.string(),
        selectedText: z.string(),
        instruction: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const instruction = input.instruction || "Make it more engaging and punchy";
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a script editor for short-form video content. The user has selected a specific portion of their script to rewrite. Rewrite ONLY the selected text according to the instruction: "${instruction}". Keep the same approximate length. Return ONLY the rewritten selected text, nothing else. Do NOT return the full script.`
              ),
            },
            {
              role: "user",
              content: `Full script for context:\n---\n${input.fullContent}\n---\n\nSelected text to rewrite:\n"${input.selectedText}"`
            }
          ],
        });
        const rewrittenSelection = (response.choices[0]?.message?.content as string) || input.selectedText;
        // Replace the selected text in the full content
        const newContent = input.fullContent.replace(input.selectedText, rewrittenSelection);
        const wordCount = newContent.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: newContent,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Rewrite selection: "${instruction}"`,
        });
        await updateSavedScript(input.scriptId, { content: newContent, wordCount });
        return { content: newContent, rewrittenPart: rewrittenSelection };
      }),

    /** Rewrite with Angle - rewrite the entire script with a specific angle/idea */
    rewriteWithAngle: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        angle: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: withAiFormattingRules(
                `You are a creative script writer for short-form video content. Rewrite this script with a completely new angle/perspective: "${input.angle}". Keep the same core topic but approach it from this new angle. Maintain a similar length and the hook-body-CTA structure. Make it feel fresh and original. Return ONLY the rewritten script text, nothing else.`
              ),
            },
            { role: "user", content: input.content }
          ],
        });
        const rewritten = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = rewritten.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: rewritten,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Rewritten with angle: "${input.angle}"`,
        });
        await updateSavedScript(input.scriptId, { content: rewritten, wordCount });
        return { content: rewritten };
      }),

    /** Generate an SEO-optimized Instagram caption with 5 strategic hashtags */
    generateCaption: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string().min(1),
        style: z.enum(["storytelling", "question", "cta", "educational", "curiosity", "bold", "relatable"]).default("educational"),
        captionLength: z.enum(["auto", "short", "medium", "long"]).default("auto"),
        niche: z.string().optional(),
        brandHashtag: z.string().optional(),
        targetAudience: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);

        let result;
        try {
          result = await generateSeoInstagramCaption({
            content: input.content,
            style: input.style,
            captionLength: input.captionLength,
            niche: input.niche,
            brandHashtag: input.brandHashtag,
            targetAudience: input.targetAudience,
          });
        } catch (err) {
          console.error(`[scripts.generateCaption] failed for script ${input.scriptId}:`, err);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Caption generation failed",
          });
        }

        await updateSavedScript(input.scriptId, {
          generatedCaption: result.caption,
          generatedHashtags: JSON.stringify(result.hashtags),
          captionStyle: result.style,
        } as any);

        return {
          caption: result.caption,
          hashtags: result.hashtags,
          primaryKeyword: result.primaryKeyword,
          hookType: result.hookType,
          style: result.style,
        };
      }),

    /** Get version history for a script */
    versions: protectedProcedure
      .input(z.object({ scriptId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        return getScriptVersions(input.scriptId);
      }),

    /** Restore a specific version */
    restoreVersion: protectedProcedure
      .input(z.object({ scriptId: z.number(), versionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertScriptInWorkspace(input.scriptId, ctx);
        const versions = await getScriptVersions(input.scriptId);
        const version = versions.find(v => v.id === input.versionId);
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
        const wordCount = version.content.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: version.content,
          versionNumber: versionNum + 1,
          changeType: "manual_edit",
          changeDescription: `Restored from version ${version.versionNumber}`,
        });
        await updateSavedScript(input.scriptId, { content: version.content, wordCount });
        return { content: version.content };
      }),

    /** Copy a script into another workspace the user belongs to */
    sendToWorkspace: protectedProcedure
      .input(
        z.object({
          scriptId: z.number().int().positive(),
          targetWorkspaceId: z.string().uuid(),
          note: z.string().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return sendScriptToWorkspace(ctx, input);
      }),

    createShareLink: protectedProcedure
      .input(z.object({ scriptId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return createShareLinkForScript(ctx, input.scriptId);
      }),

    revokeShareLink: protectedProcedure
      .input(z.object({ scriptId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return revokeShareLinkForScript(ctx, input.scriptId);
      }),

    getShareLinkInfo: protectedProcedure
      .input(z.object({ scriptId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return getShareLinkInfoForScript(ctx, input.scriptId);
      }),
  }),

  // ── Search Reels ──
  search: router({
    /** Search reels by keyword using Instagram's tag/keyword search API (matches Instagram explore results) */
    byKeyword: protectedProcedure
      .input(z.object({
        keyword: z.string().min(1).max(256),
        maxResults: z.number().min(1).max(100).optional().default(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "searchCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your search limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "searchCount");
        try {
          // Use Instagram's actual tag sections API to search reels by keyword
          // This matches what Instagram's explore page shows for the same keyword
          const reels = await searchReelsByKeyword(input.keyword, input.maxResults);

          return {
            reels,
            searchType: "keyword" as const,
            query: input.keyword,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Search failed";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    /** Search reels by handle (fetch creator's reels) */
    byHandle: protectedProcedure
      .input(z.object({
        handle: z.string().min(1).max(128),
        maxResults: z.number().min(1).max(100).optional().default(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "searchCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your search limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "searchCount");
        try {
          const { reels, profile } = await searchReelsByHandle(input.handle, input.maxResults);
          return { reels, searchType: "handle" as const, query: input.handle, profile };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Search failed";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    /** Transcribe a search result reel (not saved in DB yet) */
    transcribe: protectedProcedure
      .input(z.object({
        shortcode: z.string().min(1),
        videoUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const transcribeCheck = await checkUsageLimit(ctx.user.id, "transcribeCount", ctx.user.openId);
        if (!transcribeCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly transcription limit (${transcribeCheck.used}/${transcribeCheck.limit}). Upgrade to ${transcribeCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "transcribeCount");
        await acquireTranscriptionSlot();
        try {
        // Prefer a fresh Instagram URL; fall back to durable R2 when vendor refresh fails.
        const freshData = await fetchReelByShortcode(input.shortcode);
        let videoUrl = freshData?.videoUrl ?? null;
        if (!videoUrl && isDurableReelVideoUrl(input.videoUrl)) {
          console.warn(
            `[search.transcribe] fresh URL unavailable for ${input.shortcode}; falling back to durable stored videoUrl`
          );
          videoUrl = input.videoUrl!.trim();
        }
        if (!videoUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not retrieve video URL for this reel.",
          });
        }

        // Call the new Deepgram-based transcription pipeline
        // This handles: download + retry + ffmpeg + Deepgram Nova-3 + classify
        const { transcribeReel } = await import("./services/transcribeReel.js");
        const result = await transcribeReel({
          videoUrl,
          shortcode: input.shortcode,
        });

        if (!result.success) {
          // No-speech is a valid outcome (music/visual-only reel), not an error.
          // Return empty transcript/segments so the existing frontend fallback
          // ("No speech detected") renders cleanly.
          if (result.errorCode === "NO_SPEECH_DETECTED") {
            return {
              transcript: "",
              segments: [],
            };
          }
          // Map remaining error codes to appropriate TRPC error codes
          const code = result.errorCode === "REEL_TOO_LONG" ? "BAD_REQUEST"
            : result.errorCode === "VIDEO_TOO_LARGE" ? "BAD_REQUEST"
            : result.errorCode === "DEEPGRAM_RATE_LIMIT" ? "TOO_MANY_REQUESTS"
            : "INTERNAL_SERVER_ERROR";
          throw new TRPCError({
            code,
            message: result.userMessage,
            cause: { errorCode: result.errorCode },
          });
        }

        return {
          transcript: result.transcript,
          segments: result.segments,
        };
        } finally {
          releaseTranscriptionSlot();
        }
      }),

    /** Re-create a script from a search result reel transcript */
    recreate: protectedProcedure
      .input(z.object({
        transcript: z.string().min(1),
        caption: z.string().optional().default(""),
        topic: z.string().max(2000).optional().default(""),
        gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const recreateCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
        if (!recreateCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly AI re-creation limit (${recreateCheck.used}/${recreateCheck.limit}). Upgrade to ${recreateCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "recreateCount");
        const effectiveTopic = input.topic.trim() || "SAME_TOPIC";

        // Use the same LLM pipeline as the main recreate feature
        // Step 1: Analyze viral structure
        const structureResponse = await invokeLLM({
          messages: [
            { role: "system", content: withAiFormattingRules("You are a viral content structure analyst. Always respond with valid JSON only.") },
            { role: "user", content: `Analyze the following viral Reel transcript and identify its exact structure. Return JSON with: hook (type, text, technique), body (pacing, structure, keyPoints), transition (type, text), cta (type, text), overallTone, estimatedPace.\n\nCaption: ${input.caption}\n\nTranscript:\n${input.transcript}` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "viral_structure",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  hook: { type: "object", properties: { type: { type: "string" }, text: { type: "string" }, technique: { type: "string" } }, required: ["type", "text", "technique"], additionalProperties: false },
                  body: { type: "object", properties: { pacing: { type: "string" }, structure: { type: "string" }, keyPoints: { type: "array", items: { type: "string" } } }, required: ["pacing", "structure", "keyPoints"], additionalProperties: false },
                  transition: { type: "object", properties: { type: { type: "string" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
                  cta: { type: "object", properties: { type: { type: "string" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
                  overallTone: { type: "string" },
                  estimatedPace: { type: "string" },
                },
                required: ["hook", "body", "transition", "cta", "overallTone", "estimatedPace"],
                additionalProperties: false,
              },
            },
          },
        });

        let viralStructure: Record<string, any>;
        try {
          viralStructure = sanitizeAiOutputDeep(
            JSON.parse((String(structureResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
          );
        } catch {
          viralStructure = { error: "Failed to parse" };
        }

        const gradeLevelInstruction = input.gradeLevel === "auto"
          ? "Choose the most appropriate grade level."
          : `Write at a Grade ${input.gradeLevel} reading level.`;

        const isSameTopic = effectiveTopic === "SAME_TOPIC";
        const scriptPrompt = isSameTopic
          ? `Rewrite this viral Reel script keeping the SAME TOPIC but make it fresh and original.\n\nStructure: ${JSON.stringify(viralStructure)}\n\nOriginal: ${input.transcript}\n\n${gradeLevelInstruction}\n\nWrite as spoken text, short paragraphs for pauses. No labels.`
          : `Using this viral structure, write a NEW script on: ${effectiveTopic}\n\nStructure: ${JSON.stringify(viralStructure)}\n\nOriginal style reference: ${input.transcript}\n\n${gradeLevelInstruction}\n\nWrite as spoken text, short paragraphs for pauses. No labels.`;

        const scriptResponse = await invokeLLM({
          messages: [
            { role: "system", content: withAiFormattingRules("You are an expert Instagram Reels scriptwriter.") },
            { role: "user", content: scriptPrompt },
          ],
        });

        const generatedScript = String(scriptResponse.choices[0].message.content || "");

        return {
          viralStructure,
          generatedScript,
        };
      }),

    /** Fetch reels by direct Instagram URLs (up to 20) */
    byUrl: protectedProcedure
      .input(z.object({
        urls: z.array(z.string().url()).min(1).max(20),
      }))
      .mutation(async ({ input }) => {
        const results: any[] = [];
        const errors: string[] = [];

        for (const rawUrl of input.urls) {
          try {
            // Parse shortcode from URL
            // Supports: /reel/SHORTCODE/, /p/SHORTCODE/, /reels/SHORTCODE/
            const urlObj = new URL(rawUrl);
            const pathParts = urlObj.pathname.split("/").filter(Boolean);
            let shortcode = "";

            // Find the shortcode after /reel/, /p/, or /reels/
            for (let i = 0; i < pathParts.length; i++) {
              if (["reel", "reels", "p"].includes(pathParts[i]) && pathParts[i + 1]) {
                shortcode = pathParts[i + 1];
                break;
              }
            }

            if (!shortcode) {
              errors.push(`Could not parse shortcode from: ${rawUrl}`);
              continue;
            }

            // Fetch reel data using the media info endpoint (returns full metadata)
            const reelData = await fetchReelByShortcode(shortcode);
            if (!reelData) {
              errors.push(`Could not fetch reel data for: ${rawUrl}`);
              continue;
            }

            // Calculate engagement rate (same formula as reels list + CSV exports)
            results.push({
              shortcode,
              caption: reelData.caption || "",
              viewCount: reelData.viewCount,
              likeCount: reelData.likeCount,
              commentCount: reelData.commentCount,
              thumbnailUrl: reelData.thumbnailUrl || "",
              videoUrl: reelData.videoUrl || "",
              reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
              duration: reelData.duration,
              postedAt: reelData.postedAt.toISOString(),
              ownerUsername: reelData.ownerUsername,
              ownerFullName: reelData.ownerFullName,
              ownerProfilePicUrl: reelData.ownerProfilePicUrl,
              ownerFollowerCount: reelData.ownerFollowerCount,
              engagementRate: accountEngagementRatePercent(
                reelData.likeCount,
                reelData.commentCount,
                reelData.ownerFollowerCount
              ),
            });

            // Small delay between requests to avoid rate limiting
            if (input.urls.indexOf(rawUrl) < input.urls.length - 1) {
              await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
            }
          } catch (err) {
            errors.push(`Failed to fetch: ${rawUrl} - ${err instanceof Error ? err.message : "unknown error"}`);
          }
        }

        return {
          reels: results,
          errors,
          searchType: "url" as const,
          totalRequested: input.urls.length,
          totalFetched: results.length,
        };
      }),

    /** Profile preview for handle search (same as scrape.profilePreview) */
    profilePreview: protectedProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ input }) => {
        try {
          const profile = await fetchProfile(input.handle);
          const cleanHandle = profile.username.replace(/^@/, "").trim().toLowerCase();
          const proxiedPicUrl = await ensureProfilePicOnR2(
            cleanHandle,
            profile.profilePicUrl
          );
          return {
            found: true as const,
            username: profile.username,
            fullName: profile.fullName,
            biography: profile.biography,
            profilePicUrl: proxiedPicUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
            postCount: profile.postCount,
            isVerified: profile.isVerified,
            isPrivate: profile.isPrivate,
            category: profile.category,
            externalUrl: profile.externalUrl,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Profile not found";
          return { found: false as const, error: message };
        }
      }),
  }),

  // ── Script Tags ──
  tags: router({
    /** List all tags for the user (creates defaults if needed) */
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureDefaultTags(ctx.workspaceId, ctx.user.id);
      return getScriptTagsByWorkspace(ctx.workspaceId);
    }),

    /** Create a custom tag */
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), color: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const id = await createScriptTag({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          name: input.name,
          color: input.color,
          isDefault: 0,
          sortOrder: 99,
        });
        return { id };
      }),

    /** Update a tag */
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), color: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertTagInWorkspace(input.id, ctx);
        const updateData: Parameters<typeof updateScriptTag>[1] = {};
        if (input.name) updateData.name = input.name;
        if (input.color) updateData.color = input.color;
        await updateScriptTag(input.id, updateData);
        return { success: true };
      }),

    /** Delete a custom tag */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertTagInWorkspace(input.id, ctx);
        await deleteScriptTag(input.id);
        return { success: true };
      }),
  }),

  // ── Google Docs Export ──
  googleDocs: router({
    /** Check if Google Docs credentials are configured */
    isConfigured: protectedProcedure.query(() => {
      return { configured: isGoogleDocsConfigured() };
    }),

    /** Export a script to Google Docs */
    exportScript: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        sourceHandle: z.string().nullable().optional(),
        gradeLevel: z.string().nullable().optional(),
        postDate: z.string().nullable().optional(),
        wordCount: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
        shareWithEmail: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isGoogleDocsConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Google credentials not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in Settings > Secrets.",
          });
        }

        try {
          const result = await exportToGoogleDocs(
            {
              title: input.title,
              content: input.content,
              sourceHandle: input.sourceHandle,
              gradeLevel: input.gradeLevel,
              postDate: input.postDate,
              wordCount: input.wordCount,
              notes: input.notes,
            },
            input.shareWithEmail || ctx.user.email || undefined
          );

          return {
            documentUrl: result.documentUrl,
            documentId: result.documentId,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to create Google Doc";
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
        }
      }),
  }),

  // ── User Preferences ──
  preferences: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const prefs = await getUserPreferences(ctx.user.id);
      return prefs || { timezone: "America/Chicago" };
    }),
    latestDiscoveryBusinessDescription: protectedProcedure.query(
      async ({ ctx }) => {
        const db = await getDb();
        if (!db) return null;

        const rows = await db
          .select({
            businessDescription: discoverySearches.businessDescription,
          })
          .from(discoverySearches)
          .where(eq(discoverySearches.userId, ctx.user.id))
          .orderBy(desc(discoverySearches.createdAt))
          .limit(1);

        const text = rows[0]?.businessDescription?.trim();
        return text && text.length > 0 ? text : null;
      }
    ),
    update: protectedProcedure
      .input(z.object({ timezone: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserPreferences(ctx.user.id, { timezone: input.timezone });
        return { success: true };
      }),
    updateProfile: protectedProcedure
      .input(
        z.object({
          businessDescription: z.string().max(1000).nullable().optional(),
          targetAudience: z.string().max(1000).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const normalize = (
          value: string | null | undefined
        ): string | null | undefined => {
          if (value === undefined) return undefined;
          if (value === null) return null;
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : null;
        };

        const patch: Partial<Pick<User, "businessDescription" | "targetAudience">> =
          {};
        const businessDescription = normalize(input.businessDescription);
        const targetAudience = normalize(input.targetAudience);
        if (businessDescription !== undefined) {
          patch.businessDescription = businessDescription;
        }
        if (targetAudience !== undefined) {
          patch.targetAudience = targetAudience;
        }
        if (Object.keys(patch).length === 0) {
          return { success: true as const };
        }

        await updateUserPersonalization(ctx.user.id, patch);

        const state = await getOnboardingState(ctx.user.id);
        const nextBusiness =
          businessDescription !== undefined
            ? businessDescription
            : state?.businessDescription?.trim() ?? null;
        const nextAudience =
          targetAudience !== undefined
            ? targetAudience
            : state?.targetAudience?.trim() ?? null;

        if (nextBusiness) {
          const combined = [nextBusiness, nextAudience].filter(Boolean).join(" ");
          const inferred = inferOnboardingSlugsFromDescription(combined);
          const existing = state?.selectedNicheSlugs ?? [];
          const merged = mergeInferredNicheSlugs(inferred, existing);
          const changed =
            merged.length !== existing.length ||
            merged.some((slug, index) => slug !== existing[index]);
          if (changed && merged.length > 0) {
            const db = await getDb();
            if (!db) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Database unavailable",
              });
            }
            await db
              .update(users)
              .set({ selectedNicheSlugs: merged })
              .where(eq(users.id, ctx.user.id));
          }
        }

        return { success: true as const };
      }),
  }),

  // ── Onboarding state (first-run experience flags + flow) ──
  onboarding: router({
    /**
     * Returns all 8 onboarding fields in one call. The dashboard demo
     * banner (spec §7.4) keys off `demoSeededAt`, the OnboardingGate
     * keys off the `onboarding{Completed,Skipped}At` timestamps, and
     * the Step 1 niche grid pre-hydrates off `selectedNicheSlugs` —
     * all bundled here so the client only pays one round-trip.
     */
    getState: protectedProcedure.query(async ({ ctx }) => {
      const state = await getOnboardingState(ctx.user.id);
      if (!state) {
        // ctx.user is set by `requireUser`, so the row must exist. If
        // it doesn't, something upstream is very wrong.
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      return {
        hasSeenWelcome: state.hasSeenWelcome,
        hasDismissedHintCard: state.hasDismissedHintCard,
        hasCompletedFirstSpy: state.hasCompletedFirstSpy,
        hasDismissedDemoBanner: state.hasDismissedDemoBanner,
        demoSeededAt: state.demoSeededAt,
        selectedNicheSlugs: state.selectedNicheSlugs ?? [],
        selectedCreatorHandles: state.selectedCreatorHandles ?? null,
        businessDescription: state.businessDescription ?? null,
        targetAudience: state.targetAudience ?? null,
        onboardingCompletedAt: state.onboardingCompletedAt,
        onboardingSkippedAt: state.onboardingSkippedAt,
      };
    }),

    /** Fires on any welcome-modal action (close, tour, demo, overlay). */
    dismissWelcome: protectedProcedure.mutation(async ({ ctx }) => {
      await updateOnboardingState(ctx.user.id, { hasSeenWelcome: true });
      return { success: true };
    }),

    /** 3-step hint card on /research dismissed via its X button. */
    dismissHintCard: protectedProcedure.mutation(async ({ ctx }) => {
      await updateOnboardingState(ctx.user.id, { hasDismissedHintCard: true });
      return { success: true };
    }),

    /** Dashboard demo banner X button (spec §7.4). */
    dismissDemoBanner: protectedProcedure.mutation(async ({ ctx }) => {
      await updateOnboardingState(ctx.user.id, { hasDismissedDemoBanner: true });
      return { success: true };
    }),

    /**
     * Maps free-text business description to onboarding niche slugs via AI.
     * Called before `complete` when the user submits the fill-in-the-blank step.
     */
    routeNiche: protectedProcedure
      .input(
        z.object({
          businessDescription: z.string().min(3).max(500),
        })
      )
      .mutation(async ({ input }) => {
        const clarificationContext = detectHospitalityB2CContext(input.businessDescription);

        const finalizeRouteNicheResponse = (
          routed: Awaited<ReturnType<typeof routeNichePrompt>>,
          businessDescription: string
        ) => {
          const slugs = selectedSlugsFromNicheRouting(routed);
          const keywordSlugs = inferOnboardingSlugsFromDescription(businessDescription);
          const useKeywords =
            slugs.length === 0 ||
            (slugs.length === 1 &&
              slugs[0] === "business-entrepreneurship" &&
              keywordSlugs[0] !== "business-entrepreneurship");
          const askFollowUp = shouldAskCreatorContextQuestion(businessDescription);
          const aiQuestion = routed.clarifying_question?.trim() || null;
          return {
            selectedSlugs: useKeywords ? keywordSlugs : slugs,
            confidence: askFollowUp ? routed.confidence : 0.9,
            clarifyingQuestion: askFollowUp && aiQuestion ? aiQuestion : null,
          };
        };

        try {
          const result = await routeNichePrompt({
            businessDescription: input.businessDescription,
            clarificationContext,
          });

          if (
            clarificationContext &&
            result.business_type === "B2B" &&
            result.confidence > 0.5
          ) {
            const correctedResult = await routeNichePrompt({
              businessDescription: input.businessDescription,
              clarificationContext:
                clarificationContext +
                " IMPORTANT: The user is definitively a B2C creator. business_type must be B2C. Do not route to Business & Entrepreneurship.",
            });
            if (correctedResult.business_type !== "B2B") {
              return finalizeRouteNicheResponse(correctedResult, input.businessDescription);
            }
          }

          return finalizeRouteNicheResponse(result, input.businessDescription);
        } catch (err) {
          console.error("[Onboarding] routeNiche failed, using keyword fallback:", err);
          return {
            selectedSlugs: inferOnboardingSlugsFromDescription(input.businessDescription),
            confidence: 0.75,
            clarifyingQuestion: null as string | null,
          };
        }
      }),

    /**
     * 2-step onboarding finish: save niche + audience, generate first script, then mark complete.
     */
    startCreating: protectedProcedure
      .input(
        z.object({
          businessDescription: z.string().min(3).max(500),
          targetAudience: z.string().min(3).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return runOnboardingStartCreating({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          openId: ctx.user.openId,
          businessDescription: input.businessDescription,
          targetAudience: input.targetAudience,
        });
      }),

    getGenerationProgress: protectedProcedure.query(({ ctx }) => {
      return getOnboardingGenerationProgress(ctx.user.id);
    }),

    /**
     * Finalizes /onboarding: records the user's niche picks, optionally
     * seeds a demo scrape for the creator they chose, and stamps the
     * completion timestamp. Robust to every failure mode — per the
     * "demo seed failure must not block onboarding" rule, a seed
     * failure still returns `success: true` with `demoJobId: null`.
     *
     * Response variants:
     *   - Happy path:        { success, demoJobId: <id>, alreadyComplete: false }
     *   - Handle not found:  { success, demoJobId: <id>, alreadyComplete: false,
     *                          warning: "selected_creator_not_found" }
     *   - Seed failed:       { success, demoJobId: null, alreadyComplete: false }
     *   - Already complete:  { success, demoJobId: null, alreadyComplete: true }
     */
    complete: protectedProcedure
      .input(
        z.object({
          selectedNicheSlugs: z.array(z.string().trim().min(1)).min(1).max(5),
          featuredAccountHandles: z
            .array(z.string().trim().min(1))
            .min(1)
            .max(5)
            .optional(),
          businessDescription: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const state = await getOnboardingState(ctx.user.id);
        if (state?.onboardingCompletedAt || state?.onboardingSkippedAt) {
          return {
            success: true as const,
            demoJobId: null,
            alreadyComplete: true as const,
            demoCreatorHandle: null as string | null,
          };
        }

        // Dedupe slugs defensively — the client shouldn't send dupes,
        // but if a race or bug slips one through, we don't want to
        // store a malformed JSON array on the user row.
        const dedupedSlugs = Array.from(new Set(input.selectedNicheSlugs));

        const normalizeOnboardingHandle = (h: string) => h.replace(/^@/, "").trim().toLowerCase();
        const dedupedCreatorHandles: string[] = (() => {
          const list = input.featuredAccountHandles ?? [];
          const seen = new Set<string>();
          const out: string[] = [];
          for (const raw of list) {
            const n = normalizeOnboardingHandle(raw);
            if (seen.has(n)) continue;
            seen.add(n);
            out.push(n);
          }
          return out;
        })();

        // Detect the fallback case: first preferred handle (demo seed) doesn't
        // resolve to an active featured account; seed still falls back.
        let warning: "selected_creator_not_found" | undefined;
        const firstPreferred = dedupedCreatorHandles[0];
        if (firstPreferred) {
          const exists = await (await getDb())!
            .select({ id: featuredAccounts.id })
            .from(featuredAccounts)
            .where(
              and(
                eq(featuredAccounts.handle, firstPreferred),
                eq(featuredAccounts.isActive, true)
              )
            )
            .limit(1);
          if (exists.length === 0) {
            warning = "selected_creator_not_found";
          }
        }

        const demoJobId = await seedDemoScrape(
          ctx.user.id,
          firstPreferred ?? undefined
        );
        await markOnboardingComplete(
          ctx.user.id,
          dedupedSlugs,
          dedupedCreatorHandles,
          demoJobId !== null ? new Date() : null
        );
        const businessText = input.businessDescription?.trim();
        if (businessText) {
          await updateUserPersonalization(ctx.user.id, {
            businessDescription: businessText,
          });
        }
        let demoCreatorHandle: string | null = null;
        if (demoJobId) {
          const seededJob = await getScrapeJob(demoJobId);
          demoCreatorHandle = seededJob?.handle ?? null;
        }
        return {
          success: true as const,
          demoJobId,
          alreadyComplete: false as const,
          demoCreatorHandle,
          ...(warning ? { warning } : {}),
        };
      }),

    /**
     * User hit "Skip setup". No niche prefs captured, but we still seed
     * a demo (using the richness winner) so their dashboard isn't
     * empty on arrival. Idempotent — re-calling after completion or
     * a prior skip is a no-op.
     */
    /**
     * Settings → "Your Interests" save (Commit 8). Lets a user change
     * their onboarding-era picks after the fact. Intentionally does NOT
     * re-seed a demo scrape or flip any onboarding timestamps — that's
     * the one-time first-run ceremony owned by `complete` / `skip`.
     *
     * Creators are optional because users who went through "Pick for
     * me" in onboarding don't own a curated list; passing an empty
     * array clears the field.
     */
    updatePreferences: protectedProcedure
      .input(
        z.object({
          selectedNicheSlugs: z.array(z.string().trim().min(1)).max(5),
          selectedCreatorHandles: z
            .array(z.string().trim().min(1))
            .max(5)
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database unavailable",
          });
        }
        // `null` vs `[]`: we store empty arrays as null so the sidebar
        // "Your Interests" panel's `data != null` check cleanly
        // distinguishes "user opted out" from "user picked zero".
        const niches = input.selectedNicheSlugs.length > 0
          ? input.selectedNicheSlugs
          : null;
        const creators =
          input.selectedCreatorHandles == null ||
          input.selectedCreatorHandles.length === 0
            ? null
            : input.selectedCreatorHandles;
        await db
          .update(users)
          .set({
            selectedNicheSlugs: niches,
            selectedCreatorHandles: creators,
          })
          .where(eq(users.id, ctx.user.id));
        return { success: true as const };
      }),

    skip: protectedProcedure.mutation(async ({ ctx }) => {
      const state = await getOnboardingState(ctx.user.id);
      if (state?.onboardingCompletedAt || state?.onboardingSkippedAt) {
        return {
          success: true as const,
          alreadyDone: true as const,
          demoJobId: null as null,
          demoCreatorHandle: null as string | null,
        };
      }
      const demoJobId = await seedDemoScrape(ctx.user.id);
      await markOnboardingSkipped(
        ctx.user.id,
        demoJobId !== null ? new Date() : null
      );
      let demoCreatorHandle: string | null = null;
      if (demoJobId) {
        const seededJob = await getScrapeJob(demoJobId);
        demoCreatorHandle = seededJob?.handle ?? null;
      }
      return {
        success: true as const,
        alreadyDone: false as const,
        demoJobId,
        demoCreatorHandle,
      };
    }),
  }),

  // ── Blog ──
  blog: router({
    // Public: list published posts
    published: publicProcedure.query(async () => {
      return getPublishedIndexableBlogPosts();
    }),

    // Public: get single post by slug
    bySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const post = await getBlogPostBySlug(input.slug);
        if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
        return post;
      }),

    // Admin: list all posts (drafts + published)
    all: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return getAllBlogPosts();
    }),

    // Admin: get post by id for editing
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const post = await getBlogPostById(input.id);
        if (!post) throw new TRPCError({ code: "NOT_FOUND" });
        return post;
      }),

    // Admin: create post
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(512),
        slug: z.string().min(1).max(512),
        excerpt: z.string().optional(),
        content: z.string().min(1),
        coverImageUrl: z.string().optional(),
        tags: z.array(z.string()).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const id = await createBlogPost({
          ...input,
          authorId: ctx.user.id,
          publishedAt: input.status === "published" ? new Date() : undefined,
        });
        return { id };
      }),

    // Admin: update post
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(512).optional(),
        slug: z.string().min(1).max(512).optional(),
        excerpt: z.string().optional(),
        content: z.string().optional(),
        coverImageUrl: z.string().optional(),
        tags: z.array(z.string()).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        if (data.status === "published") {
          const existing = await getBlogPostById(id);
          if (existing && !existing.publishedAt) {
            (data as any).publishedAt = new Date();
          }
        }
        await updateBlogPost(id, data);
        return { success: true };
      }),

    // Admin: delete post
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await deleteBlogPost(input.id);
        return { success: true };
      }),
  }),

  // ── Telegram Bot Connection ──
  telegram: router({
    /** Get current connection status */
    status: protectedProcedure.query(async ({ ctx }) => {
      const connection = await getTelegramConnectionByUserId(ctx.user.id);
      const botInfo = await getTelegramBotInfo();
      return {
        connected: connection?.isConnected === 1,
        telegramUsername: connection?.telegramUsername || null,
        botUsername: botInfo?.username || null,
        botName: botInfo?.name || null,
      };
    }),

    /** Generate a new link code for connecting Telegram */
    generateLinkCode: protectedProcedure.mutation(async ({ ctx }) => {
      const code = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Check if user already has a connection
      const existing = await getTelegramConnectionByUserId(ctx.user.id);
      if (existing) {
        // Update existing connection with new code
        await updateTelegramConnection(existing.id, {
          linkCode: code,
          linkCodeExpiresAt: expiresAt,
          isConnected: 0,
          telegramChatId: null,
        });
      } else {
        await createTelegramConnection({
          userId: ctx.user.id,
          linkCode: code,
          linkCodeExpiresAt: expiresAt,
        });
      }

      const botInfo = await getTelegramBotInfo();
      return {
        code,
        expiresAt: expiresAt.toISOString(),
        botUsername: botInfo?.username || "SpyReelsBot",
      };
    }),

    /** Disconnect Telegram */
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const connection = await getTelegramConnectionByUserId(ctx.user.id);
      if (connection) {
        await deleteTelegramConnection(connection.id);
      }
      return { success: true };
    }),

    /** Manually set up webhook (admin only) */
    setupWebhook: protectedProcedure
      .input(z.object({ baseUrl: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const success = await setupTelegramWebhook(input.baseUrl);
        return { success };
      }),
  }),

  // ── Collected Reels (from Telegram bot, URL paste, etc.) ──
  collected: router({
    /** List all collected reels for the user, including transcription status */
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        const bare = await getCollectedReelsByWorkspace(ctx.workspaceId);
        return bare.map((r) => ({
          ...r,
          transcriptionReelId: r.transcriptionReelId ?? null,
          transcriptionStatus: null as string | null,
          transcriptionStartedAt: null as Date | null,
          transcriptionIsNoSpeech: false,
          monitoredViewCount: null as number | null,
          monitoredFollowerCount: null as number | null,
          contentType: null as string | null,
          remakeabilityScore: null as number | null,
          suggestedAction: null as string | null,
          classificationReason: null as string | null,
          classifiedAt: null as Date | null,
        }));
      }

      const collectedCols = await collectedReelsColumnsForQuery();
      const joined = await db
        .select({
          ...collectedCols,
          clsContentType: reelsTable.contentType,
          clsRemakeabilityScore: reelsTable.remakeabilityScore,
          clsSuggestedAction: reelsTable.suggestedAction,
          clsClassificationReason: reelsTable.classificationReason,
          clsClassifiedAt: reelsTable.classifiedAt,
          clsTxnReelThumbnailUrl: reelsTable.thumbnailUrl,
          clsTxnReelVideoUrl: reelsTable.videoUrl,
        })
        .from(collectedReels)
        .leftJoin(reelsTable, eq(collectedReels.transcriptionReelId, reelsTable.id))
        .where(eq(collectedReels.workspaceId, ctx.workspaceId))
        .orderBy(desc(collectedReels.createdAt));

      const reels = joined.map((row) => {
        const {
          clsContentType,
          clsRemakeabilityScore,
          clsSuggestedAction,
          clsClassificationReason,
          clsClassifiedAt,
          clsTxnReelThumbnailUrl,
          clsTxnReelVideoUrl,
          thumbnailUrl: collectedThumbRaw,
          videoUrl: collectedVideoRaw,
          ...collectedRest
        } = row;

        const preferTxnMedia = (
          fromTxnReel: string | null | undefined,
          fromCollected: string | null | undefined
        ): string | null => {
          const a = (fromTxnReel ?? "").trim();
          if (a) return fromTxnReel ?? null;
          const b = (fromCollected ?? "").trim();
          return b ? fromCollected ?? null : null;
        };

        return {
          ...collectedRest,
          thumbnailUrl: preferTxnMedia(clsTxnReelThumbnailUrl, collectedThumbRaw),
          videoUrl: preferTxnMedia(clsTxnReelVideoUrl, collectedVideoRaw),
          contentType: clsContentType ?? null,
          remakeabilityScore: clsRemakeabilityScore ?? null,
          suggestedAction: clsSuggestedAction ?? null,
          classificationReason: clsClassificationReason ?? null,
          classifiedAt: clsClassifiedAt ?? null,
        };
      });

      const transcriptionReelIds = Array.from(
        new Set(
          reels
            .map((r) => r.transcriptionReelId)
            .filter((id): id is number => id != null && id > 0)
        )
      );
      type TxnBrief = {
        status: string;
        startedAt: Date | null;
        transcriptionIsNoSpeech: boolean;
      };
      const txnByReelId = new Map<number, TxnBrief>();
      if (transcriptionReelIds.length > 0) {
        const txns = await db
          .select({
            reelId: transcriptions.reelId,
            status: transcriptions.status,
            transcript: transcriptions.transcript,
            segments: transcriptions.segments,
            startedAt: transcriptions.startedAt,
          })
          .from(transcriptions)
          .where(inArray(transcriptions.reelId as any, transcriptionReelIds));
        for (const t of txns) {
          if (t.reelId == null) continue;
          const segs = t.segments;
          const nSeg = Array.isArray(segs) ? segs.length : 0;
          const transcriptionIsNoSpeech =
            t.status === "completed" &&
            !String(t.transcript ?? "").trim() &&
            nSeg === 0;
          txnByReelId.set(t.reelId, {
            status: t.status,
            startedAt: t.startedAt ?? null,
            transcriptionIsNoSpeech,
          });
        }
      }

      const readyReels = reels.filter((r) => r.status === "ready");
      const shortcodes = readyReels.map((r) => r.shortcode);

      let monitoredDataMap = new Map<string, { viewCount: number; followerCount: number }>();

      if (shortcodes.length > 0) {
        const monitoredReels = await db
          .select({
            shortcode: reelsTable.shortcode,
            viewCount: reelsTable.viewCount,
            jobId: reelsTable.jobId,
          })
          .from(reelsTable)
          .where(inArray(reelsTable.shortcode, shortcodes));

        const jobIds = Array.from(
          new Set(monitoredReels.filter((r) => r.jobId > 0).map((r) => r.jobId))
        );
        let jobFollowerMap = new Map<number, number>();
        if (jobIds.length > 0) {
          const jobs = await db
            .select({ id: scrapeJobs.id, followerCount: scrapeJobs.followerCount })
            .from(scrapeJobs)
            .where(inArray(scrapeJobs.id, jobIds));
          jobFollowerMap = new Map(jobs.map((j) => [j.id, j.followerCount]));
        }

        for (const mr of monitoredReels) {
          if (mr.jobId === 0) continue;
          const existing = monitoredDataMap.get(mr.shortcode);
          const followerCount = jobFollowerMap.get(mr.jobId) || 0;
          if (!existing || mr.viewCount > existing.viewCount) {
            monitoredDataMap.set(mr.shortcode, {
              viewCount: mr.viewCount,
              followerCount: followerCount,
            });
          }
        }
      }

      return reels.map((r) => {
        const monitored = monitoredDataMap.get(r.shortcode);
        const txn =
          r.transcriptionReelId != null ? txnByReelId.get(r.transcriptionReelId) : undefined;

        return {
          ...r,
          transcriptionReelId: r.transcriptionReelId ?? null,
          transcriptionStatus:
            r.transcriptionReelId != null ? txn?.status ?? null : null,
          transcriptionStartedAt:
            r.transcriptionReelId != null ? txn?.startedAt ?? null : null,
          transcriptionIsNoSpeech:
            r.transcriptionReelId != null ? txn?.transcriptionIsNoSpeech ?? false : false,
          monitoredViewCount: monitored?.viewCount ?? null,
          monitoredFollowerCount: monitored?.followerCount ?? null,
        };
      });
    }),

    /** Delete a collected reel */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertCollectedReelInWorkspace(input.id, ctx);
        await deleteCollectedReel(input.id);
        return { success: true };
      }),

    /** Add a reel by URL (manual paste from web UI) */
    addByUrl: protectedProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const shortcode = parseInstagramReelShortcode(input.url);
        if (!shortcode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Could not parse Instagram Reel URL. Use a link like instagram.com/reel/ABC123/ or instagram.com/username/reel/ABC123/",
          });
        }

        const reelUrl = canonicalInstagramReelUrl(shortcode, input.url);
        const ingest = await ingestCollectedReelByShortcode({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          shortcode,
          reelUrl,
          source: "url_paste",
        });

        return {
          id: ingest.id,
          duplicate: ingest.action === "duplicate",
          retried: ingest.action === "retried",
        };
      }),

    /** Remove all failed collected reels (ghost rows that block Telegram re-add) */
    deleteFailed: protectedProcedure.mutation(async ({ ctx }) => {
      const deleted = await deleteFailedCollectedReelsByWorkspace(ctx.workspaceId);
      return { deleted };
    }),

    /** Refresh metadata for a failed or incomplete reel */
    retry: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertCollectedReelInWorkspace(input.id, ctx);
        await updateCollectedReel(input.id, {
          status: "pending",
          errorMessage: null,
          fetchAttempts: 0,
          nextFetchAt: null,
          lastFetchAt: null,
        });
        enqueueCollectedReelIngest(input.id);
        return { success: true };
      }),

    /** Refresh all reels - re-fetch latest stats (views, likes, comments) for all ready reels */
    refreshAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        const allReels = await getCollectedReelsByWorkspace(ctx.workspaceId);
        // Refresh ALL reels: pending/failed ones need retry, ready ones need stat updates
        const needsRefresh = allReels.filter(
          (r) => r.status === "pending" || r.status === "failed" || r.status === "ready"
        );
        let count = 0;
        for (const reel of needsRefresh) {
          // Only set to pending for non-ready reels; for ready reels, refresh in background without status change
          if (reel.status !== "ready") {
            await updateCollectedReel(reel.id, {
              status: "pending",
              errorMessage: null,
              fetchAttempts: 0,
              nextFetchAt: null,
            });
            enqueueCollectedReelIngest(reel.id);
          } else {
            enqueueCollectedReelRefresh(reel.id);
          }
          count++;
          // Small delay between requests
          if (count < needsRefresh.length) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        return { refreshed: count };
      }),

    /** Transcribe a collected reel */
    transcribe: protectedProcedure
      .input(z.object({ collectedReelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await assertCollectedReelInWorkspace(input.collectedReelId, ctx);
        if (reel.status !== "ready") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reel metadata not ready yet" });
        }
        if (!reel.videoUrl) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No video URL available for this reel" });
        }

        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "transcribeCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Transcription limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "transcribeCount");

        // Check if transcription already exists for this shortcode (via reels table)
        // For collected reels, we store transcription data directly in a separate approach:
        // We'll create a temporary reel entry to reuse the transcription system
        const tempReelData = {
          jobId: 0, // 0 = collected reel, not from a scrape job
          workspaceId: reel.workspaceId,
          shortcode: reel.shortcode,
          caption: reel.caption || "",
          viewCount: reel.viewCount || 0,
          likeCount: reel.likeCount || 0,
          commentCount: reel.commentCount || 0,
          thumbnailUrl: reel.thumbnailUrl || "",
          videoUrl: reel.videoUrl || "",
          reelUrl: reel.reelUrl,
          duration: reel.duration || 0,
          postedAt: reel.postedAt || new Date(),
          ownerUsername: reel.ownerUsername || "",
        };

        // Check if we already have a reel entry for this shortcode
        const { getDb } = await import("./db");
        const { reels: reelsTable, collectedReels } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        let reelId: number;
        if (reel.transcriptionReelId != null && reel.transcriptionReelId > 0) {
          reelId = reel.transcriptionReelId;
        } else {
          const result = await db.insert(reelsTable).values(tempReelData);
          reelId = result[0].insertId;
        }

        await db.update(collectedReels)
          .set({ transcriptionReelId: reelId })
          .where(eq(collectedReels.id, input.collectedReelId));

        // Check for existing transcription
        const existingTranscription = await getTranscriptionByReelId(reelId);
        if (existingTranscription && existingTranscription.status === "completed") {
          return { reelId, transcriptionId: existingTranscription.id, status: "completed" as const };
        }
        if (existingTranscription && existingTranscription.status === "processing") {
          return { reelId, transcriptionId: existingTranscription.id, status: "processing" as const };
        }

        // Create transcription
        const transcriptionId = await createTranscription({
          reelId,
          status: "processing",
          queuedAt: new Date(),
        });

        // Run transcription in background (reuse existing logic)
        runTranscription(transcriptionId, {
          id: reelId,
          shortcode: reel.shortcode,
          videoUrl: reel.videoUrl,
          caption: reel.caption,
          thumbnailUrl: reel.thumbnailUrl,
        }).catch((err) => {
          console.error(`[Collected] Transcription failed for ${reel.shortcode}:`, err);
        });

        return { reelId, transcriptionId, status: "processing" as const };
      }),

    /** Get transcription status for a collected reel */
    transcriptionStatus: protectedProcedure
      .input(z.object({ reelId: z.number() }))
      .query(async ({ input }) => {
        const transcription = await getTranscriptionByReelId(input.reelId);
        if (!transcription) return null;
        return transcription;
      }),
  }),

  hookGenerator: hookGeneratorRouter,

  // ── Script Ideas (Idea to Script Factory) ──
  ideas: router({
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
  }),

  // ── Library: Central hub for all transcripts & scripts ──
  library: router({
    transcripts: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        source: z.enum(["scraped", "collected"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        const opts = input || {};
        return getLibraryTranscripts(ctx.workspaceId, opts);
      }),

    scripts: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        source: z.enum(["saved", "recreated", "idea"]).optional(),
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        const opts = input || {};
        return getLibraryScripts(ctx.workspaceId, opts);
      }),
  }),

  // ── Brand Coach (AI viral-potential scoring) ──
  brandCoach: router({
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
  }),

  // ── Admin Dashboard ──
  admin: router({
    ping: adminPanelProcedure.query(() => ({ ok: true as const })),

    trafficConversionReport: adminPanelProcedure
      .input(trafficReportFiltersSchema.optional())
      .query(async ({ input }) => {
        return buildTrafficConversionReport(trafficReportFiltersSchema.parse(input ?? {}));
      }),

    trafficOverview: adminPanelProcedure.query(() => ({
      visitors: 0,
      signups7d: 0,
      note: "Wire PostHog and aggregates in Phase 1 Prompt 5.",
    })),

    creatorsSummary: adminPanelProcedure.query(() => ({
      featuredCount: 0,
      note: "Featured creators admin in Phase 1 Prompt 4.",
    })),

    blogStudioSummary: adminPanelProcedure.query(() => ({
      draftCount: 0,
      note: "Blog Studio pipeline in Phase 1 Prompt 6.",
    })),

    trackCreatorView: adminPanelProcedure
      .input(z.object({ creatorHandle: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { ok: true as const };
        await db.insert(creatorViewEvents).values({
          creatorHandle: input.creatorHandle.trim().toLowerCase(),
          viewerUserId: ctx.user.id,
        });
        return { ok: true as const };
      }),

    trackNicheView: adminPanelProcedure
      .input(z.object({ nicheSlug: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { ok: true as const };
        await db.insert(nicheViewEvents).values({
          nicheSlug: input.nicheSlug.trim().toLowerCase(),
          viewerUserId: ctx.user.id,
        });
        return { ok: true as const };
      }),

    emailRecentEvents: adminPanelProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(80) }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [] };
        const limit = input?.limit ?? 80;
        const items = await db
          .select()
          .from(emailEvents)
          .orderBy(desc(emailEvents.createdAt))
          .limit(limit);
        return { items };
      }),

    emailTemplatesList: adminPanelProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { items: [] };
      const items = await db.select().from(emailTemplates).orderBy(asc(emailTemplates.slug));
      return { items };
    }),

    emailTemplateStats: adminPanelProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { items: [] as { templateSlug: string; count: number }[] };
      const rows = await db
        .select({
          templateSlug: emailEvents.templateSlug,
          count: sql<number>`count(*)`,
        })
        .from(emailEvents)
        .where(isNotNull(emailEvents.templateSlug))
        .groupBy(emailEvents.templateSlug);
      const items = rows
        .filter((r) => r.templateSlug)
        .map((r) => ({ templateSlug: r.templateSlug as string, count: Number(r.count) }))
        .sort((a, b) => b.count - a.count);
      return { items };
    }),

    emailBounces: adminPanelProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [] };
        const limit = input?.limit ?? 100;
        const items = await db
          .select()
          .from(emailEvents)
          .where(
            or(
              eq(emailEvents.eventType, "email.bounced"),
              eq(emailEvents.eventType, "email.complained"),
              like(emailEvents.eventType, "%bounce%")
            )
          )
          .orderBy(desc(emailEvents.createdAt))
          .limit(limit);
        return { items };
      }),

    panelUserList: adminPanelProcedure
      .input(panelUserFiltersSchema.optional())
      .query(async ({ input }) => {
        const opts = panelUserFiltersSchema.parse(input ?? {});
        const report = await buildPanelUserReport(opts);
        return {
          items: report.items,
          total: report.total,
          summary: report.summary,
          dateRange: report.dateRange,
        };
      }),

    panelUserSummary: adminPanelProcedure
      .input(panelUserSummaryFiltersSchema.optional())
      .query(async ({ input }) => {
        const opts = panelUserFiltersSchema.parse({
          ...(input ?? {}),
          limit: 1,
          offset: 0,
        });
        const report = await buildPanelUserReport(opts);
        return { summary: report.summary, dateRange: report.dateRange };
      }),

    panelUserDetail: adminPanelProcedure
      .input(
        z.object({
          userId: z.number(),
          dateRangePreset: z.enum([
            "today",
            "7d",
            "14d",
            "30d",
            "60d",
            "90d",
            "365d",
            "custom",
          ]).default("30d"),
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
      )
      .query(async ({ input }) => {
        const { resolveDateRange } = await import("./adminUserMetrics");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

        const dateRange = resolveDateRange(input);
        const report = await buildPanelUserReport(
          panelUserFiltersSchema.parse({
            dateRangePreset: input.dateRangePreset,
            startDate: input.startDate,
            endDate: input.endDate,
            limit: 500,
            offset: 0,
          })
        );
        const row = report.items.find((r) => r.id === input.userId);

        const usageHistory = await db.select().from(monthlyUsage)
          .where(eq(monthlyUsage.userId, input.userId))
          .orderBy(desc(monthlyUsage.usageMonth))
          .limit(12);

        const recentJobs = await db.select().from(scrapeJobs)
          .where(eq(scrapeJobs.userId, input.userId))
          .orderBy(desc(scrapeJobs.createdAt))
          .limit(10);

        const recentScripts = await db.select({
          id: savedScripts.id,
          title: savedScripts.title,
          status: savedScripts.status,
          createdAt: savedScripts.createdAt,
        }).from(savedScripts)
          .where(eq(savedScripts.userId, input.userId))
          .orderBy(desc(savedScripts.createdAt))
          .limit(10);

        const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, input.userId)).limit(1);

        const { computeRetentionStatus, isPaidPlan } = await import("./userActivity");
        const lastActiveAt = user.lastActiveAt ?? user.lastSignedIn;
        const plan = sub?.plan ?? "free";

        return {
          dateRange,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            loginMethod: user.loginMethod,
            role: user.role,
            createdAt: user.createdAt,
            lastSignedIn: user.lastSignedIn,
            lastActiveAt,
            visitCount: user.visitCount ?? 0,
            totalActiveSeconds: user.totalActiveSeconds ?? 0,
            periodVisits: row?.periodVisits ?? 0,
            periodActiveSeconds: row?.periodActiveSeconds ?? 0,
            daysSinceActive: Math.floor(
              (Date.now() - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
            ),
            retentionStatus: computeRetentionStatus(lastActiveAt),
            isPaid: isPaidPlan(plan, sub?.stripeSubscriptionId),
            utmSource: user.utmSource,
            utmMedium: user.utmMedium,
            utmCampaign: user.utmCampaign,
            isTestAccount: user.isTestAccount,
            inferredTestAccount: inferPanelTestAccount(user),
          },
          subscription: sub ? { plan: sub.plan, status: sub.status, billingInterval: sub.billingInterval, stripeCustomerId: sub.stripeCustomerId, currentPeriodEnd: sub.currentPeriodEnd } : null,
          usageHistory,
          recentJobs,
          recentScripts,
        };
      }),

    coachScriptQualitySummary: adminPanelProcedure
      .input(coachScriptQualityFiltersSchema.optional())
      .query(async ({ input }) => {
        return buildCoachScriptQualityReport(coachScriptQualityFiltersSchema.parse(input ?? {}));
      }),

    coachScriptQualityDownload: adminPanelProcedure
      .input(
        coachScriptQualityFiltersSchema.extend({
          format: z.enum(["html", "csv"]),
        })
      )
      .mutation(async ({ input }) => {
        const { format, ...filters } = input;
        return buildCoachScriptQualityDownload({ filters, format });
      }),
  }),

  tiktokScrape: router({
    start: protectedProcedure
      .input(
        z.object({
          handle: z.string().min(1).max(128),
          timeframe: z.enum(["30", "90", "180"]).default("30"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const usageCheck = await checkUsageLimit(
          ctx.user.id,
          "scrapeCount",
          ctx.user.openId
        );
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You have reached your monthly account research limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const handle = input.handle.replace(/^@/, "").trim().toLowerCase();
        const timeframeDays = Number(input.timeframe);
        const insertResult = await db.insert(tiktokScrapeJobs).values({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          handle,
          status: "pending",
          timeframeDays,
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create TikTok scrape job",
          });
        }

        await incrementUsage(ctx.user.id, "scrapeCount");

        runTikTokScrapeJob(
          jobId,
          ctx.user.id,
          ctx.workspaceId,
          handle,
          { timeframeDays }
        ).catch((error) => {
          console.error(`TikTok scrape job ${jobId} failed:`, error);
        });

        return { jobId };
      }),

    progress: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId))
          .limit(1);
        const job = rows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        return {
          status: job.status,
          currentStep: job.currentStep,
          videosFound: job.videosFound,
          estimatedTotal: job.estimatedTotal,
          progressPercent: job.progressPercent,
          errorMessage: job.errorMessage,
          handle: job.handle,
          timeframeDays: job.timeframeDays,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const jobs = await db
        .select()
        .from(tiktokScrapeJobs)
        .where(eq(tiktokScrapeJobs.workspaceId, ctx.workspaceId))
        .orderBy(desc(tiktokScrapeJobs.createdAt));

      type Rollup = {
        reelCountRollup: number;
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        avgEngagementPct: number | null;
      };
      const rollupMap = new Map<number, Rollup>();
      const jobIds = jobs.map((job) => job.id);

      if (jobIds.length > 0) {
        const rollupRows = await db
          .select({
            jobId: tiktokVideos.jobId,
            reelCount: sql<number>`cast(count(*) as signed)`.mapWith(Number),
            totalViews: sql<number>`coalesce(sum(cast(${tiktokVideos.viewCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalLikes: sql<number>`coalesce(sum(cast(${tiktokVideos.likeCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalComments: sql<number>`coalesce(sum(cast(${tiktokVideos.commentCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalShares: sql<number>`coalesce(sum(cast(${tiktokVideos.shareCount} as signed)), 0)`.mapWith(
              Number
            ),
            avgEngagementPct: sql<number | null>`avg(
              (
                cast(${tiktokVideos.likeCount} as signed)
                + cast(${tiktokVideos.commentCount} as signed)
                + cast(${tiktokVideos.shareCount} as signed)
              )
              / nullif(cast(${tiktokScrapeJobs.followerCount} as signed), 0) * 100
            )`,
          })
          .from(tiktokVideos)
          .innerJoin(tiktokScrapeJobs, eq(tiktokVideos.jobId, tiktokScrapeJobs.id))
          .where(
            and(
              inArray(tiktokVideos.jobId, jobIds),
              eq(tiktokScrapeJobs.workspaceId, ctx.workspaceId)
            )
          )
          .groupBy(tiktokVideos.jobId);

        for (const row of rollupRows) {
          if (row.jobId == null) continue;
          const raw = row.avgEngagementPct;
          const n =
            raw == null
              ? null
              : typeof raw === "number"
                ? raw
                : Number.parseFloat(String(raw));
          rollupMap.set(row.jobId, {
            reelCountRollup: row.reelCount,
            totalViews: row.totalViews,
            totalLikes: row.totalLikes,
            totalComments: row.totalComments,
            totalShares: row.totalShares,
            avgEngagementPct: n != null && Number.isFinite(n) ? n : null,
          });
        }
      }

      return jobs.map((job) => ({
        ...job,
        reelStats: rollupMap.get(job.id) ?? null,
      }));
    }),

    videos: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const jobRows = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId))
          .limit(1);
        const job = jobRows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const rows = await db
          .select()
          .from(tiktokVideos)
          .where(eq(tiktokVideos.jobId, input.jobId))
          .orderBy(desc(tiktokVideos.postedAt));

        return {
          followerCount: job.followerCount,
          videos: rows.map((video) => {
            const raw =
              job.followerCount > 0
                ? ((video.likeCount +
                    video.commentCount +
                    video.shareCount) /
                    job.followerCount) *
                  100
                : 0;
            return {
              ...video,
              engagementRate: Math.round(raw * 100) / 100,
            };
          }),
        };
      }),

    /** Fresh TikTok play URL for modal preview; mirror to R2 in the background. */
    refreshVideoUrl: protectedProcedure
      .input(z.object({ videoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const [video] = await db
          .select()
          .from(tiktokVideos)
          .where(eq(tiktokVideos.id, input.videoId))
          .limit(1);
        if (!video) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const [job] = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, video.jobId))
          .limit(1);
        if (!job || job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const existing = (video.videoUrl ?? "").trim();
        const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(
          /\/+$/,
          ""
        );
        if (
          (publicBase && existing.startsWith(publicBase)) ||
          isDurableTiktokVideoUrl(existing)
        ) {
          return { videoUrl: existing };
        }

        const fresh = await fetchTikTokVideoInfo(video.videoPageUrl, {
          mode: "interactive",
        });
        if (!fresh?.videoUrl?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not retrieve a fresh video URL for this TikTok.",
          });
        }

        const videoUrl = fresh.videoUrl.trim();
        scheduleTiktokVideoMirror(video.id, video.awemeId, videoUrl);
        await db
          .update(tiktokVideos)
          .set({ videoUrl })
          .where(eq(tiktokVideos.id, video.id));

        return { videoUrl };
      }),

    delete: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const jobRows = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId))
          .limit(1);
        const job = jobRows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        await db
          .delete(tiktokVideos)
          .where(eq(tiktokVideos.jobId, input.jobId));
        await db
          .delete(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId));
        return { success: true };
      }),
  }),

  youtubeScrape: router({
    start: protectedProcedure
      .input(
        z.object({
          handle: z.string().min(1).max(128),
          timeframe: z.enum(["30", "90", "180"]).default("30"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const usageCheck = await checkUsageLimit(
          ctx.user.id,
          "scrapeCount",
          ctx.user.openId
        );
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You have reached your monthly account research limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const handle = input.handle.replace(/^@/, "").trim().toLowerCase();
        const timeframeDays = Number(input.timeframe);
        const insertResult = await db.insert(youtubeScrapeJobs).values({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          handle,
          status: "pending",
          timeframeDays,
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create YouTube scrape job",
          });
        }

        await incrementUsage(ctx.user.id, "scrapeCount");

        runYouTubeScrapeJob(
          jobId,
          ctx.user.id,
          ctx.workspaceId,
          handle,
          { timeframeDays }
        ).catch((error) => {
          console.error(`YouTube scrape job ${jobId} failed:`, error);
        });

        return { jobId };
      }),

    progress: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select()
          .from(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId))
          .limit(1);
        const job = rows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        return {
          status: job.status,
          currentStep: job.currentStep,
          videosFound: job.videosFound,
          estimatedTotal: job.estimatedTotal,
          progressPercent: job.progressPercent,
          errorMessage: job.errorMessage,
          handle: job.handle,
          timeframeDays: job.timeframeDays,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const jobs = await db
        .select()
        .from(youtubeScrapeJobs)
        .where(eq(youtubeScrapeJobs.workspaceId, ctx.workspaceId))
        .orderBy(desc(youtubeScrapeJobs.createdAt));

      type Rollup = {
        reelCountRollup: number;
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        avgEngagementPct: number | null;
      };
      const rollupMap = new Map<number, Rollup>();
      const jobIds = jobs.map((job) => job.id);

      if (jobIds.length > 0) {
        const rollupRows = await db
          .select({
            jobId: youtubeVideos.jobId,
            reelCount: sql<number>`cast(count(*) as signed)`.mapWith(Number),
            totalViews: sql<number>`coalesce(sum(cast(${youtubeVideos.viewCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalLikes: sql<number>`coalesce(sum(cast(${youtubeVideos.likeCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalComments: sql<number>`coalesce(sum(cast(${youtubeVideos.commentCount} as signed)), 0)`.mapWith(
              Number
            ),
            avgEngagementPct: sql<number | null>`avg(
              (
                cast(${youtubeVideos.likeCount} as signed)
                + cast(${youtubeVideos.commentCount} as signed)
              )
              / nullif(cast(${youtubeScrapeJobs.subscriberCount} as signed), 0) * 100
            )`,
          })
          .from(youtubeVideos)
          .innerJoin(
            youtubeScrapeJobs,
            eq(youtubeVideos.jobId, youtubeScrapeJobs.id)
          )
          .where(
            and(
              inArray(youtubeVideos.jobId, jobIds),
              eq(youtubeScrapeJobs.workspaceId, ctx.workspaceId)
            )
          )
          .groupBy(youtubeVideos.jobId);

        for (const row of rollupRows) {
          if (row.jobId == null) continue;
          const raw = row.avgEngagementPct;
          const n =
            raw == null
              ? null
              : typeof raw === "number"
                ? raw
                : Number.parseFloat(String(raw));
          rollupMap.set(row.jobId, {
            reelCountRollup: row.reelCount,
            totalViews: row.totalViews,
            totalLikes: row.totalLikes,
            totalComments: row.totalComments,
            avgEngagementPct: n != null && Number.isFinite(n) ? n : null,
          });
        }
      }

      return jobs.map((job) => ({
        ...job,
        reelStats: rollupMap.get(job.id) ?? null,
      }));
    }),

    videos: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const jobRows = await db
          .select()
          .from(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId))
          .limit(1);
        const job = jobRows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const rows = await db
          .select()
          .from(youtubeVideos)
          .where(eq(youtubeVideos.jobId, input.jobId))
          .orderBy(desc(youtubeVideos.postedAt));

        return {
          subscriberCount: job.subscriberCount,
          videos: rows.map((video) => {
            const raw =
              job.subscriberCount > 0
                ? ((video.likeCount + video.commentCount) /
                    job.subscriberCount) *
                  100
                : 0;
            return {
              ...video,
              engagementRate: Math.round(raw * 100) / 100,
            };
          }),
        };
      }),

    delete: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const jobRows = await db
          .select()
          .from(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId))
          .limit(1);
        const job = jobRows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        await db
          .delete(youtubeVideos)
          .where(eq(youtubeVideos.jobId, input.jobId));
        await db
          .delete(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId));
        return { success: true };
      }),
  }),

  outreach: outreachRouter,
  founderInterview: founderInterviewRouter,
  featureRequest: featureRequestRouter,
  coachScriptFeedback: coachScriptFeedbackRouter,

  plan: planRouter,
  studio: studioRouter,
  audienceResearch: audienceResearchRouter,
});

export type AppRouter = typeof appRouter;

// ── Helper functions ──

/**
 * First-time bypass for Remake now: users with zero monthly usage on the
 * given meter and no completed first spy skip the plan limit check so their
 * first transcription or script generation always succeeds (aha moment).
 */
async function isFirstRemakeUsageBypassEligible(
  userId: number,
  hasCompletedFirstSpy: boolean,
  usageField: "transcribeCount" | "recreateCount"
): Promise<boolean> {
  if (hasCompletedFirstSpy) return false;
  const usage = await getMonthlyUsage(userId);
  const used = usage[usageField] ?? 0;
  return used === 0;
}

/**
 * Flip `hasCompletedFirstSpy` exactly once per user (shared guard).
 */
async function maybeMarkFirstSpyCompletedForUser(userId: number): Promise<void> {
  const onboardingState = await getOnboardingState(userId);
  if (!onboardingState) return;
  if (onboardingState.hasCompletedFirstSpy) return;
  await updateOnboardingState(userId, { hasCompletedFirstSpy: true });
}

/**
 * Featured Remake now aha moment: first successful script from catalog reels
 * counts as completing first spy so the hint card dismisses without a scrape job.
 */
async function maybeMarkFirstSpyCompletedFromFeaturedScript(scriptId: number): Promise<void> {
  try {
    const script = await getRecreatedScript(scriptId);
    if (!script?.featuredReelId) return;
    await maybeMarkFirstSpyCompletedForUser(script.userId);
  } catch (error) {
    console.warn(
      `[maybeMarkFirstSpyCompletedFromFeaturedScript] Non-fatal error for script ${scriptId}:`,
      error
    );
  }
}

/**
 * Flip `hasCompletedFirstSpy` exactly once for a user's first successful
 * non-demo scrape completion. Guard rails:
 *  - Demo-seeded jobs never count as first spies (`scrapeJob.isDemo`).
 *  - If the flag is already true, skip the write.
 *  - Missing job/user rows are treated as no-ops (defensive).
 *
 * Also flipped from featured catalog script completion via
 * `maybeMarkFirstSpyCompletedFromFeaturedScript`.
 */
async function maybeMarkFirstSpyCompleted(jobId: number): Promise<void> {
  try {
    const job = await getScrapeJob(jobId);
    if (!job) return;
    if (job.isDemo) return;
    await maybeMarkFirstSpyCompletedForUser(job.userId);
  } catch (error) {
    console.warn(
      `[maybeMarkFirstSpyCompleted] Non-fatal error for job ${jobId}:`,
      error
    );
  }
}

/**
 * Upload an array of reel thumbnails to R2 with bounded concurrency.
 * Returns a map from shortcode → stable URL (R2 public URL on success,
 * the original IG URL on failure). Skips entries with empty thumbnailUrl.
 *
 * Bounded at 5 concurrent uploads so a 200-reel scrape doesn't fan out
 * 200 simultaneous CDN downloads, while staying ~40× faster than serial.
 */
async function uploadReelThumbnailsBounded(
  items: Array<{ shortcode: string; thumbnailUrl: string }>,
  concurrency = 5
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        const item = items[i]!;
        const stable = await ensureReelThumbnailOnR2(
          item.shortcode,
          item.thumbnailUrl ?? ""
        );
        out.set(item.shortcode, stable);
      }
    })
  );
  return out;
}

/** Background discovery job runner (async poll flow). */
async function runDiscoveryJob(
  jobId: number,
  userId: number,
  businessDescription: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(discoveryJobs)
      .set({ status: "running" })
      .where(eq(discoveryJobs.id, jobId));

    const { runDiscoveryPipeline } = await import("./discovery/pipeline");
    const result = await runDiscoveryPipeline(
      businessDescription,
      async (update) => {
        const row: {
          routedNiche?: string | null;
          creatorsTotal?: number;
          creatorsDrilled?: number;
          reelsFound?: number;
          partialJson?: typeof update.partial;
        } = {};

        if (update.partial?.routedNiche) {
          row.routedNiche = update.partial.routedNiche;
        }
        if (update.creatorsTotal !== undefined) {
          row.creatorsTotal = update.creatorsTotal;
        }
        if (update.creatorsDrilled !== undefined) {
          row.creatorsDrilled = update.creatorsDrilled;
        }
        if (update.reelsFound !== undefined) {
          row.reelsFound = update.reelsFound;
        }
        if (update.partial) {
          row.partialJson = update.partial;
        }

        if (Object.keys(row).length === 0) return;

        try {
          await db
            .update(discoveryJobs)
            .set(row)
            .where(eq(discoveryJobs.id, jobId));
        } catch (err) {
          console.warn(`[runDiscoveryJob ${jobId}] progress update failed:`, err);
        }
      }
    );

    await db
      .update(discoveryJobs)
      .set({
        status: "completed",
        routedNiche: result.routedNiche || null,
        reelsFound: result.viralReels.length,
        partialJson: result,
      })
      .where(eq(discoveryJobs.id, jobId));

    try {
      const routedName = result.routedNiche?.trim();
      if (routedName) {
        const nicheRows = await db
          .select({ slug: niches.slug })
          .from(niches)
          .where(eq(niches.name, routedName))
          .limit(1);
        const slug = nicheRows[0]?.slug;
        if (slug) {
          const userRows = await db
            .select({ selectedNicheSlugs: users.selectedNicheSlugs })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          const existing = Array.isArray(userRows[0]?.selectedNicheSlugs)
            ? (userRows[0].selectedNicheSlugs as string[])
            : [];
          if (!existing.includes(slug) && existing.length < 5) {
            await db
              .update(users)
              .set({ selectedNicheSlugs: [...existing, slug] })
              .where(eq(users.id, userId));
          }
        }
      }
    } catch (err) {
      console.warn(`[runDiscoveryJob ${jobId}] niche save failed:`, err);
    }

    try {
      await db.insert(discoverySearches).values({
        userId,
        businessDescription,
        routedNiche: result.routedNiche || null,
        reelCount: result.viralReels.length,
        resultJson: result,
      });

      const kept = await db
        .select({ id: discoverySearches.id })
        .from(discoverySearches)
        .where(eq(discoverySearches.userId, userId))
        .orderBy(desc(discoverySearches.createdAt))
        .limit(10);

      const keepIds = kept.map((row) => row.id);
      if (keepIds.length > 0) {
        await db.delete(discoverySearches).where(
          and(
            eq(discoverySearches.userId, userId),
            not(inArray(discoverySearches.id, keepIds))
          )
        );
      }
    } catch (err) {
      console.warn(`[runDiscoveryJob ${jobId}] history save failed:`, err);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(discoveryJobs)
        .set({
          status: "failed",
          errorMessage: message.slice(0, 2000),
        })
        .where(eq(discoveryJobs.id, jobId));
    } catch (updateErr) {
      console.error(
        `[runDiscoveryJob ${jobId}] failed to mark job failed:`,
        updateErr
      );
    }
  }
}

/** Map provider errors to safe user-facing job failure messages. */
function userFacingCreatorDiscoveryJobError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("credit balance") ||
    lower.includes("billing") ||
    lower.includes("insufficient credit") ||
    lower.includes("purchase credits") ||
    lower.includes("payment required")
  ) {
    return "Search temporarily unavailable. Please try again shortly.";
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many requests")
  ) {
    return "Search is busy right now. Please try again in a few minutes.";
  }

  return "Search failed. Please try again.";
}

/** Background creator-first discovery job runner (async poll flow). */
async function runCreatorDiscoveryJob(
  jobId: number,
  userId: number,
  businessDescription: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(creatorDiscoveryJobs)
      .set({ status: "running" })
      .where(eq(creatorDiscoveryJobs.id, jobId));

    const { runCreatorDiscoveryPipeline } = await import(
      "./discovery/creatorPipeline"
    );
    const result = await runCreatorDiscoveryPipeline(
      businessDescription,
      async (update) => {
        const row: {
          routedNiche?: string | null;
          topicsTotal?: number;
          topicsSearched?: number;
          creatorsFound?: number;
          partialJson?: typeof update.partial;
        } = {};

        if (update.partial?.routedNiche) {
          row.routedNiche = update.partial.routedNiche;
        }
        if (update.topicsTotal !== undefined) {
          row.topicsTotal = update.topicsTotal;
        }
        if (update.topicsSearched !== undefined) {
          row.topicsSearched = update.topicsSearched;
        }
        if (update.creatorsFound !== undefined) {
          row.creatorsFound = update.creatorsFound;
        }
        if (update.partial) {
          row.partialJson = update.partial;
        }

        if (Object.keys(row).length === 0) return;

        try {
          await db
            .update(creatorDiscoveryJobs)
            .set(row)
            .where(eq(creatorDiscoveryJobs.id, jobId));
        } catch (err) {
          console.warn(
            `[runCreatorDiscoveryJob ${jobId}] progress update failed:`,
            err
          );
        }
      }
    );

    const {
      mirrorProfilePicsBounded,
      mirrorReelThumbnailsBounded,
    } = await import("./discovery/mediaMirror");

    const ranked = result.rankedCreators;
    const stableThumbs = await mirrorReelThumbnailsBounded(
      ranked.map((creator) => ({
        shortcode: creator.bestReel.shortcode,
        thumbnailUrl: creator.bestReel.thumbnailUrl,
      }))
    );
    const stableProfilePics = await mirrorProfilePicsBounded(
      ranked.map((creator) => ({
        username: creator.owner.username,
        profilePicUrl: creator.owner.profilePicUrl,
      }))
    );

    const mirroredResult = {
      ...result,
      rankedCreators: ranked.map((creator) => ({
        ...creator,
        owner: {
          ...creator.owner,
          profilePicUrl:
            stableProfilePics.get(creator.owner.username.toLowerCase()) ??
            creator.owner.profilePicUrl,
        },
        bestReel: {
          ...creator.bestReel,
          thumbnailUrl:
            stableThumbs.get(creator.bestReel.shortcode) ??
            creator.bestReel.thumbnailUrl,
        },
      })),
    };

    await db
      .update(creatorDiscoveryJobs)
      .set({
        status: "completed",
        routedNiche: mirroredResult.routedNiche || null,
        creatorsFound: mirroredResult.rankedCreators.length,
        partialJson: mirroredResult,
      })
      .where(eq(creatorDiscoveryJobs.id, jobId));

    try {
      await db.insert(creatorDiscoverySearches).values({
        userId,
        businessDescription,
        routedNiche: mirroredResult.routedNiche || null,
        creatorCount: mirroredResult.rankedCreators.length,
        resultJson: mirroredResult,
      });

      const kept = await db
        .select({ id: creatorDiscoverySearches.id })
        .from(creatorDiscoverySearches)
        .where(eq(creatorDiscoverySearches.userId, userId))
        .orderBy(desc(creatorDiscoverySearches.createdAt))
        .limit(10);

      const keepIds = kept.map((row) => row.id);
      if (keepIds.length > 0) {
        await db.delete(creatorDiscoverySearches).where(
          and(
            eq(creatorDiscoverySearches.userId, userId),
            not(inArray(creatorDiscoverySearches.id, keepIds))
          )
        );
      }
    } catch (err) {
      console.warn(
        `[runCreatorDiscoveryJob ${jobId}] history save failed:`,
        err
      );
    }
  } catch (err) {
    console.error(`[runCreatorDiscoveryJob ${jobId}] failed:`, err);
    const userMessage = userFacingCreatorDiscoveryJobError(err);
    try {
      await db
        .update(creatorDiscoveryJobs)
        .set({
          status: "failed",
          errorMessage: userMessage.slice(0, 2000),
        })
        .where(eq(creatorDiscoveryJobs.id, jobId));
    } catch (updateErr) {
      console.error(
        `[runCreatorDiscoveryJob ${jobId}] failed to mark job failed:`,
        updateErr
      );
    }
  }
}

/** Background scrape job runner */
async function runScrapeJob(
  jobId: number,
  userId: number,
  handle: string,
  timeframeDays: number
): Promise<void> {
  // Centralized refund helper so the multiple failure paths stay in sync.
  // Only safe to call once per job (we never enter more than one failure
  // branch in a single run).
  const refundScrapeQuota = async (reason: string) => {
    try {
      await decrementUsage(userId, "scrapeCount");
      console.warn(
        `[runScrapeJob ${jobId}] refunded scrapeCount for user ${userId} (reason: ${reason})`
      );
    } catch (refundErr) {
      console.error(
        `[runScrapeJob ${jobId}] failed to refund scrapeCount for user ${userId}:`,
        refundErr
      );
    }
  };

  // Schedule deletion of this scrape_jobs row after the client has had
  // enough time to poll the failed status. The progress page polls every
  // 1.5s and stops polling once it sees status=failed, so 30s is plenty
  // of buffer. Keeps the DB and Creator Radar free of stale "tried it,
  // didn't work" rows.
  const scheduleFailedJobCleanup = (reason: string) => {
    setTimeout(async () => {
      try {
        await deleteScrapeJob(jobId);
        console.log(
          `[runScrapeJob ${jobId}] cleaned up failed-zero-reel row (reason: ${reason})`
        );
      } catch (cleanupErr) {
        console.error(
          `[runScrapeJob ${jobId}] failed to clean up row:`,
          cleanupErr
        );
      }
    }, 30_000);
  };

  try {
    const cleanHandleForLog = handle.replace(/^@/, "").trim().toLowerCase();
    console.log(
      `[runScrapeJob ${jobId}] start handle=@${cleanHandleForLog} timeframeDays=${timeframeDays}`
    );

    // Stage 1: connecting → about to call Instagram for the profile.
    await updateScrapeJob(jobId, {
      status: "running",
      currentStep: "connecting",
      progressPercent: 5,
    });

    // Stage 2: fetching_profile → scrapeReels will call fetchProfile as its
    // first step; we can't peek inside the function, so we mark the stage at
    // the boundary.
    await updateScrapeJob(jobId, {
      currentStep: "fetching_profile",
      progressPercent: 15,
    });

    const {
      reels: reelData,
      followerCount,
      profilePicUrl,
      totalParsedItems,
      mostRecentItemAt,
      reelsInWindow,
    } = await runWithScrapeCallContext(
      { source: "scrape_job", jobId, handle: cleanHandleForLog },
      () =>
        scrapeReels(
          handle,
          timeframeDays,
          (count, pageBatch) => {
            // Stage 3: pulling_reels → scales 20→80 against a visual baseline
            // of 30 reels; caps at 80 so we always leave headroom for ranking.
            updateScrapeJob(jobId, {
              currentStep: "pulling_reels",
              totalReels: count,
              reelsFound: count,
              progressPercent: Math.min(20 + Math.floor((count / 30) * 60), 80),
            }).catch(() => {});

            if (pageBatch && pageBatch.length > 0) {
              insertReels(
                pageBatch.map((r) => ({
                  jobId,
                  shortcode: r.shortcode,
                  caption: r.caption,
                  viewCount: r.viewCount,
                  likeCount: r.likeCount,
                  commentCount: r.commentCount,
                  thumbnailUrl: r.thumbnailUrl,
                  videoUrl: r.videoUrl ?? "",
                  reelUrl: r.reelUrl,
                  duration: r.duration,
                  postedAt: r.postedAt,
                  ownerUsername: r.ownerUsername,
                }))
              ).catch((err) => {
                console.error(
                  `[runScrapeJob ${jobId}] incremental insert failed:`,
                  err
                );
              });
            }
          },
          { maxReels: 500, timeoutMs: 5 * 60 * 1000 }
        )
    );

    // Stage 4: ranking → insert + finalize. Set before pic proxy so the UI
    // has a visible "analyzing" beat even when the proxy work is quick.
    await updateScrapeJob(jobId, {
      currentStep: "ranking",
      progressPercent: 85,
    });

    const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
    const proxiedPicUrl = await ensureProfilePicOnR2(
      cleanHandle,
      profilePicUrl
    );

    if (reelData.length === 0) {
      await dedupeReelsForJob(jobId);
      const seededReelCount = await countReelsForJob(jobId);
      if (seededReelCount > 0) {
        const priorJob = await getScrapeJob(jobId);
        await updateScrapeJob(jobId, {
          status: "completed",
          totalReels: seededReelCount,
          followerCount: followerCount || priorJob?.followerCount || 0,
          profilePicUrl: proxiedPicUrl || undefined,
          currentStep: "complete",
          reelsFound: seededReelCount,
          progressPercent: 100,
          errorMessage: null,
          failureReason: null,
        });
        await maybeMarkFirstSpyCompleted(jobId);
        console.log(
          `[runScrapeJob ${jobId}] completed with seeded catalog (live pull returned 0) handle=@${cleanHandleForLog} reels=${seededReelCount}`
        );
        return;
      }

      if (followerCount > 0) {
        // Two distinct sub-cases land here:
        //
        //  A. Vendor returned items but ALL were older than the user's
        //     timeframe window. The account simply has not posted reels
        //     recently. Show a friendly "expand timeframe" message rather
        //     than blaming Instagram, and refund the quota since the
        //     scrape did its job (we just found nothing in the window).
        //
        //  B. Vendor returned zero items at all (or only unparseable
        //     items). That is the Bug #64 "empty success" envelope: a
        //     transient vendor-pool issue. Keep the existing rate-limited
        //     label and refund.
        const itemsExisted = totalParsedItems > 0;
        const ageDays =
          itemsExisted && mostRecentItemAt
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - mostRecentItemAt.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              )
            : null;

        if (itemsExisted) {
          const ageCopy =
            ageDays != null
              ? ` Most recent reel was posted ${ageDays} day${ageDays === 1 ? "" : "s"} ago.`
              : "";
          await updateScrapeJob(jobId, {
            status: "failed",
            totalReels: 0,
            followerCount,
            profilePicUrl: proxiedPicUrl || undefined,
            currentStep: "failed",
            reelsFound: 0,
            progressPercent: 100,
            errorMessage: `@${handle.replace(/^@/, "")} has not posted reels in the last ${timeframeDays} days.${ageCopy} Try expanding the timeframe.`,
            failureReason: "unknown",
          });
          await refundScrapeQuota("no_reels_in_window");
          scheduleFailedJobCleanup("no_reels_in_window");
          console.warn(
            `[runScrapeJob ${jobId}] failed handle=@${cleanHandleForLog} reason=no_reels_in_window followers=${followerCount}`
          );
          return;
        }

        await updateScrapeJob(jobId, {
          status: "failed",
          totalReels: 0,
          followerCount,
          profilePicUrl: proxiedPicUrl || undefined,
          currentStep: "failed",
          reelsFound: 0,
          progressPercent: 100,
          errorMessage: `Scraper returned 0 reels for an account with ${followerCount} followers. This usually means a temporary Instagram session issue. Please retry in a few minutes.`,
          failureReason: "instagram_rate_limited",
        });
        await refundScrapeQuota("zero_reels_with_followers");
        scheduleFailedJobCleanup("zero_reels_with_followers");
        console.warn(
          `[runScrapeJob ${jobId}] failed handle=@${cleanHandleForLog} reason=zero_reels_with_followers followers=${followerCount} totalParsedItems=${totalParsedItems}`
        );
        return;
      }

      await updateScrapeJob(jobId, {
        status: "completed",
        totalReels: 0,
        followerCount,
        profilePicUrl: proxiedPicUrl || undefined,
        currentStep: "complete",
        progressPercent: 100,
        errorMessage: null,
        failureReason: null,
      });
      await maybeMarkFirstSpyCompleted(jobId);
      console.log(
        `[runScrapeJob ${jobId}] completed handle=@${cleanHandleForLog} reels=0 followers=${followerCount}`
      );
      return;
    }

    // Move IG-CDN thumbnails to R2 before inserting. Raw IG URLs carry a
    // signed query string that expires every 24–48h, so persisting them
    // directly to `reels.thumbnailUrl` is what causes blank tiles in the
    // dashboard a day or two after the scrape. ensureReelThumbnailOnR2
    // is best-effort: on any failure it returns the source URL unchanged
    // so the insert always succeeds.
    const stableThumbs = await uploadReelThumbnailsBounded(
      reelData.map((r) => ({ shortcode: r.shortcode, thumbnailUrl: r.thumbnailUrl }))
    );

    const mappedReels = reelData.map((r) => ({
      jobId,
      shortcode: r.shortcode,
      caption: r.caption,
      viewCount: r.viewCount,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      thumbnailUrl: stableThumbs.get(r.shortcode) ?? r.thumbnailUrl,
      videoUrl: r.videoUrl ?? "",
      reelUrl: r.reelUrl,
      duration: r.duration,
      postedAt: r.postedAt,
      ownerUsername: r.ownerUsername,
    }));

    await updateReelsForJobFromScrape(jobId, mappedReels);
    await insertReels(mappedReels);
    await dedupeReelsForJob(jobId);
    await refreshViralFlagsForScrapeJob(jobId);
    const finalReelCount = await countReelsForJob(jobId);

    await updateScrapeJob(jobId, {
      status: "completed",
      totalReels: finalReelCount,
      reelsInWindow,
      followerCount,
      profilePicUrl: proxiedPicUrl || undefined,
      currentStep: "complete",
      reelsFound: finalReelCount,
      progressPercent: 100,
      errorMessage: null,
      failureReason: null,
    });
    await maybeMarkFirstSpyCompleted(jobId);
    scheduleScrapeJobPostCompleteWork(jobId);
    console.log(
      `[runScrapeJob ${jobId}] completed handle=@${cleanHandleForLog} reels=${finalReelCount} followers=${followerCount}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const failureReason = classifyScrapeFailureMessage(message);
    console.warn(
      `[runScrapeJob ${jobId}] failed handle=@${handle.replace(/^@/, "").trim().toLowerCase()} reason=${failureReason}: ${message}`
    );
    // Failure preserves the last progressPercent the UI saw — just flip the
    // terminal flags so the client can show the error state.
    await updateScrapeJob(jobId, {
      status: "failed",
      errorMessage: message,
      currentStep: "failed",
      failureReason,
    });
    // Refund vendor-side failures so quotas aren't burned on flakes the
    // user can't control. Keep the quota when the failure is the user's
    // input (handle_not_found, account_private, account_too_large).
    if (failureReason === "instagram_rate_limited") {
      await refundScrapeQuota(`exception:${failureReason}`);
    }
    // Schedule cleanup of the row ONLY when nothing useful was inserted.
    // If reels were already persisted before the exception, we must keep
    // the row so the user doesn't lose their data.
    const reelCountAfterFailure = await countReelsForJob(jobId);
    if (reelCountAfterFailure === 0) {
      scheduleFailedJobCleanup(`exception:${failureReason}`);
    }
  }
}

/** Background resync job runner — only fetches new reels since last sync */
async function runResyncJob(
  jobId: number,
  handle: string,
  daysSinceSync: number
): Promise<void> {
  const cleanHandleForLog = handle.replace(/^@/, "").trim().toLowerCase();
  try {
    console.log(
      `[runResyncJob ${jobId}] start handle=@${cleanHandleForLog} daysSinceSync=${daysSinceSync}`
    );
    await updateScrapeJob(jobId, {
      currentStep: "connecting",
      progressPercent: 5,
    });
    await updateScrapeJob(jobId, {
      currentStep: "fetching_profile",
      progressPercent: 15,
    });

    const { reels: reelData, followerCount, profilePicUrl } =
      await runWithScrapeCallContext(
        { source: "resync_job", jobId, handle: cleanHandleForLog },
        () =>
          scrapeReels(
            handle,
            daysSinceSync,
            (count) => {
              updateScrapeJob(jobId, {
                currentStep: "pulling_reels",
                totalReels: count,
                reelsFound: count,
                progressPercent: Math.min(20 + Math.floor((count / 30) * 60), 80),
              }).catch(() => {});
            },
            { maxReels: 500, timeoutMs: 5 * 60 * 1000 }
          )
      );

    await updateScrapeJob(jobId, {
      currentStep: "ranking",
      progressPercent: 85,
    });

    const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
    const proxiedPicUrl = await ensureProfilePicOnR2(
      cleanHandle,
      profilePicUrl
    );

    // Get existing shortcodes to deduplicate
    const existingShortcodes = new Set(await getExistingShortcodes(jobId));
    const newReels = reelData.filter(r => !existingShortcodes.has(r.shortcode));

    if (newReels.length > 0) {
      const stableThumbs = await uploadReelThumbnailsBounded(
        newReels.map((r) => ({ shortcode: r.shortcode, thumbnailUrl: r.thumbnailUrl }))
      );

      await insertReels(
        newReels.map((r) => ({
          jobId,
          shortcode: r.shortcode,
          caption: r.caption,
          viewCount: r.viewCount,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          thumbnailUrl: stableThumbs.get(r.shortcode) ?? r.thumbnailUrl,
          videoUrl: r.videoUrl ?? "",
          reelUrl: r.reelUrl,
          duration: r.duration,
          postedAt: r.postedAt,
          ownerUsername: r.ownerUsername,
        }))
      );
    }

    // Update total count (existing + new)
    const totalReels = existingShortcodes.size + newReels.length;
    await updateScrapeJobResync(jobId, {
      totalReels,
      followerCount,
      status: "completed",
      profilePicUrl: proxiedPicUrl || undefined,
    });
    await updateScrapeJob(jobId, {
      currentStep: "complete",
      reelsFound: totalReels,
      progressPercent: 100,
      errorMessage: null,
      failureReason: null,
    });

    console.log(`[Resync] @${handle}: ${newReels.length} new reels added (${totalReels} total)`);

    if (newReels.length > 0) {
      const insertedIds = await reelIdsForJobShortcodes(
        jobId,
        newReels.map((r) => r.shortcode)
      );
      if (insertedIds.length > 0) {
        scheduleScrapeReelPostCompleteWork(insertedIds, `runResyncJob ${jobId}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateScrapeJob(jobId, {
      status: "failed",
      errorMessage: message,
      currentStep: "failed",
      failureReason: classifyScrapeFailureMessage(message),
    });
  }
}

/** Background transcription runner */
export async function runTranscription(
  transcriptionId: number,
  reel: {
    id: number;
    shortcode: string;
    videoUrl: string | null;
    caption: string | null;
    thumbnailUrl: string | null;
  }
): Promise<void> {
  // Serialize with the same process-local semaphore that search.transcribe
  // uses. Prevents cascading Instagram CDN rate-limits when batch kickoffs
  // (e.g. "Transcribe All" on Saved Reels) fan out many reels in parallel
  // from our single Render IP.
  await acquireTranscriptionSlot();
  try {
    await updateTranscription(transcriptionId, { startedAt: new Date() });
    // Prefer a fresh Instagram URL; fall back to durable R2 when vendor refresh fails
    // (e.g. ScrapeCreators 402) so we can still transcribe mirrored reels.
    const initialFresh = await fetchReelByShortcode(reel.shortcode);
    let videoUrl = initialFresh?.videoUrl ?? null;
    if (!videoUrl && isDurableReelVideoUrl(reel.videoUrl)) {
      console.warn(
        `[runTranscription] fresh URL unavailable for ${reel.shortcode}; falling back to durable stored videoUrl`
      );
      videoUrl = reel.videoUrl!.trim();
    }
    if (!videoUrl) {
      throw new Error(
        "Could not retrieve video URL for this reel. The video may no longer be available."
      );
    }

    // Call the new Deepgram-based transcription pipeline
    const { transcribeReel } = await import("./services/transcribeReel.js");
    const result = await transcribeReel({
      videoUrl,
      shortcode: reel.shortcode,
    });

    if (!result.success) {
      // No-speech is a valid outcome (music/visual-only reel).
      // Save empty transcript + "no speech" marker so the UI can
      // render the appropriate state.
      if (result.errorCode === "NO_SPEECH_DETECTED") {
        await updateTranscription(transcriptionId, {
          transcript: "",
          segments: [],
          hookAnalysis: "",
          status: "completed",
        });
        return;
      }
      // All other errors: mark the job as failed with the friendly message
      throw new Error(result.userMessage);
    }

    const transcript = result.transcript;
    const segments = result.segments;

    const hookAnalysis = await analyzeHook(
      transcript,
      reel.caption || "",
      reel.thumbnailUrl || "",
      segments as any,
      "Instagram Reel"
    );

    await updateTranscription(transcriptionId, {
      transcript,
      segments: segments as any,
      hookAnalysis,
      status: "completed",
    });

    void Promise.resolve()
      .then(async () => {
        const row = await getReelById(reel.id);
        if (row?.classifiedAt) return;
        if (!transcript.trim()) return;
        await classifyTranscript({
          transcript,
          reelId: reel.id,
          table: "reels",
        });
      })
      .catch((err) => console.error("Classification failed:", err));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[runTranscription] ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    await updateTranscription(transcriptionId, {
      status: "failed",
      errorMessage: message,
    });
  } finally {
    releaseTranscriptionSlot();
  }
}

/**
 * Featured-reel transcription runner (Commit 4b). Writes the result
 * straight into `featured_reels` instead of `transcriptions` because the
 * catalog owns a single shared transcript per reel — the same semaphore
 * + fresh-URL logic as `runTranscription`, but no hook analysis and no
 * per-user row. Also used by the backfill script.
 */
export async function runFeaturedReelTranscription(reel: {
  id: number;
  shortcode: string;
  videoUrl: string | null;
}): Promise<void> {
  await acquireTranscriptionSlot();
  try {
    // Prefer a fresh Instagram URL; fall back to durable R2 when vendor refresh fails.
    const initialFresh = await fetchReelByShortcode(reel.shortcode);
    let videoUrl = initialFresh?.videoUrl ?? null;
    if (!videoUrl && isDurableReelVideoUrl(reel.videoUrl)) {
      console.warn(
        `[runFeaturedReelTranscription] fresh URL unavailable for ${reel.shortcode}; falling back to durable stored videoUrl`
      );
      videoUrl = reel.videoUrl!.trim();
    }
    if (!videoUrl) {
      throw new Error(
        "Could not retrieve video URL for this reel. The video may no longer be available."
      );
    }

    const { transcribeReel } = await import("./services/transcribeReel.js");
    const result = await transcribeReel({ videoUrl, shortcode: reel.shortcode });

    if (!result.success) {
      if (result.errorCode === "NO_SPEECH_DETECTED") {
        await updateFeaturedReelTranscription(reel.id, {
          transcriptionStatus: "no_speech",
          transcript: "",
          transcriptSegments: [],
          transcribedAt: new Date(),
        });
        return;
      }
      throw new Error(result.userMessage);
    }

    await updateFeaturedReelTranscription(reel.id, {
      transcriptionStatus: "completed",
      transcript: result.transcript,
      transcriptSegments: result.segments as {
        start: number;
        end: number;
        text: string;
      }[],
      transcribedAt: new Date(),
    });

    void Promise.resolve()
      .then(async () => {
        const row = await getFeaturedReelById(reel.id);
        if (row?.classifiedAt) return;
        if (!result.transcript.trim()) return;
        await classifyTranscript({
          transcript: result.transcript,
          reelId: reel.id,
          table: "featured_reels",
        });
      })
      .catch((err) => console.error("Classification failed:", err));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[runFeaturedReelTranscription] ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    await updateFeaturedReelTranscription(reel.id, {
      transcriptionStatus: "failed",
    });
  } finally {
    releaseTranscriptionSlot();
  }
}

function formatNiche(niche: string | null): string | null {
  if (!niche) return null;
  return niche.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatHookPattern(hook: string | null): string | null {
  if (!hook) return null;
  return hook.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatRetentionTactics(tactics: unknown): string | null {
  if (!Array.isArray(tactics) || tactics.length === 0) return null;
  return tactics.map(t => String(t).split("_").join(" ")).join(", ");
}

function hasExplicitUserAngleInTopic(topic: string): boolean {
  return (
    topic.includes("Creator's chosen angle") ||
    topic.includes("Creator goal (ground truth")
  );
}

function buildV13ContextBlock(
  reel: any,
  options?: { explicitUserAngle?: boolean }
): string {
  const lines: string[] = [];
  const {
    niche: rawNiche = null,
    hookPattern: rawHookPattern = null,
    retentionTactics: rawRetentionTactics = null,
    contentType: rawContentType = null,
    classificationReason: rawClassificationReason = null,
    viralFlag = false,
  } = reel ?? {};
  const niche = formatNiche(rawNiche ? String(rawNiche) : null);
  const hookPattern = formatHookPattern(rawHookPattern ? String(rawHookPattern) : null);
  const retentionTactics = formatRetentionTactics(rawRetentionTactics);
  const contentType = rawContentType ? String(rawContentType) : null;
  const classificationReason = rawClassificationReason ? String(rawClassificationReason) : null;
  const isViral = viralFlag === 1 || viralFlag === true;

  if (niche) lines.push(`- Niche: ${niche}`);
  if (contentType) lines.push(`- Content type: ${contentType}`);
  if (hookPattern) lines.push(`- Hook pattern used: ${hookPattern}`);
  if (retentionTactics) lines.push(`- Retention tactics used: ${retentionTactics}`);
  if (isViral) lines.push(`- Performance: VIRAL (top performer for this creator's recent posts)`);
  if (classificationReason) lines.push(`- Editor's analysis: ${classificationReason}`);

  if (lines.length === 0) return "";

  const applyBlock = options?.explicitUserAngle
    ? `**APPLY THIS WHEN WRITING:**
- The creator provided their own angle. Use ONLY hook pattern and retention tactics from the source reel. Do NOT reuse the source reel's niche, content type, subject matter, or vocabulary.
- Transfer STRUCTURE and ENGAGEMENT MECHANICS, not the literal topic from the classifier or transcript.
- The hook pattern above is the structural opening that helped this reel succeed. Use the SAME pattern type adapted to the creator's angle.
- The retention tactics above are the mechanics that kept viewers watching. Replicate them in the new script.`
    : `**APPLY THIS WHEN WRITING:**
- The hook pattern above is the structural opening that helped this reel succeed. Use the SAME pattern type (e.g., contrarian = open with a controversial stance; question = open with a challenging question; stat = open with a surprising number).
- The retention tactics above are the mechanics that kept viewers watching. Replicate them in the new script (e.g., cliffhanger = withhold key info until late; pattern_interrupt = abrupt shift in pace; specific_numbers = concrete data points).
- The content type and niche guide the tone and vocabulary.
- Transfer the STRUCTURE, not the literal words. The new script is on a different topic but uses the same engagement mechanics.`;

  return `
**PRE-ANALYZED SOURCE REEL CONTEXT (from our classifier):**
${lines.join("\n")}

${applyBlock}

`;
}

/** Shared LLM instructions for [BRACKET] delivery cues (recreate + rewrite). */
function buildDeliveryCuesPromptSection(): string {
  return `
**DELIVERY CUES:** Add performance/delivery cues in square brackets throughout the script to guide the speaker on HOW to deliver each line. These cues should be based on analyzing the viral structure and what makes the original engaging. Use cues like:
- [PAUSE] - dramatic pause for emphasis
- [LEAN IN] - get closer to camera, create intimacy
- [SPEED UP] - increase pace for energy/urgency
- [SLOW DOWN] - slow pace for emphasis on key point
- [WHISPER] - lower voice for dramatic effect
- [EMPHASIZE] - stress the next word/phrase
- [LOOK AT CAMERA] - direct eye contact moment
- [GESTURE] - use hand gesture to illustrate
- [RAISE VOICE] - increase volume for impact
- [SMILE] - show enthusiasm/warmth
- [SERIOUS FACE] - convey gravity/importance
- [COUNT ON FINGERS] - enumerate points visually
- [SHAKE HEAD] - express disagreement/disbelief
- [NOD] - affirm the point being made

Place cues at the START of the line they apply to. Every 2-3 lines should have a cue. The cues should create a dynamic, engaging delivery that keeps viewer attention throughout.`;
}

/** Background job: analyze viral structure and generate a new script */
export async function runScriptGeneration(
  scriptId: number,
  userId: number,
  originalTranscript: string,
  segments: unknown,
  caption: string,
  reel: any,
  topic: string,
  gradeLevel: string,
  addCues: boolean,
  platformLabel: "Instagram Reel" | "TikTok video" | "YouTube Short" = "Instagram Reel"
): Promise<void> {
  try {
    // Step 1: Analyze viral structure
    const structurePrompt = `You are an expert viral content analyst specializing in ${platformLabel} scripts.

Analyze the following viral ${platformLabel} transcript and identify its exact structure. Return a JSON object with these fields:

{
  "hook": {
    "type": "string - the pattern type (e.g., 'Bold Statement', 'Negativity Bias', 'Question', 'Shocking Stat', 'Controversial Take', 'Story Opening', 'Direct Address')",
    "text": "string - the exact hook text from the transcript",
    "technique": "string - brief explanation of why this hook works"
  },
  "body": {
    "pacing": "string - how information is delivered (e.g., 'Rapid-fire list', 'Problem-solution', 'Story arc', 'Step-by-step', 'Comparison')",
    "structure": "string - describe the flow of information",
    "keyPoints": ["array of the main points made"]
  },
  "transition": {
    "type": "string - how it moves from problem to solution (e.g., 'But here\\'s the thing...', 'The secret is...', 'What if I told you...')",
    "text": "string - the exact transition text"
  },
  "cta": {
    "type": "string - the closing trigger type (e.g., 'Follow for more', 'Save this', 'Comment below', 'Try this today', 'Link in bio')",
    "text": "string - the exact CTA text"
  },
  "overallTone": "string - the overall tone (e.g., 'authoritative', 'casual', 'urgent', 'educational')",
  "estimatedPace": "string - slow/medium/fast"
}

**Caption:** ${caption}

**Full Transcript:**
${originalTranscript}

Return ONLY valid JSON, no markdown formatting.`;

    const structureResponse = await invokeLLM({
      messages: [
        { role: "system", content: withAiFormattingRules("You are a viral content structure analyst. Always respond with valid JSON only.") },
        { role: "user", content: structurePrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "viral_structure",
          strict: true,
          schema: {
            type: "object",
            properties: {
              hook: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                  technique: { type: "string" },
                },
                required: ["type", "text", "technique"],
                additionalProperties: false,
              },
              body: {
                type: "object",
                properties: {
                  pacing: { type: "string" },
                  structure: { type: "string" },
                  keyPoints: { type: "array", items: { type: "string" } },
                },
                required: ["pacing", "structure", "keyPoints"],
                additionalProperties: false,
              },
              transition: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                },
                required: ["type", "text"],
                additionalProperties: false,
              },
              cta: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                },
                required: ["type", "text"],
                additionalProperties: false,
              },
              overallTone: { type: "string" },
              estimatedPace: { type: "string" },
            },
            required: ["hook", "body", "transition", "cta", "overallTone", "estimatedPace"],
            additionalProperties: false,
          },
        },
      },
    });

    let viralStructure: Record<string, unknown>;
    try {
      viralStructure = sanitizeAiOutputDeep(
        JSON.parse((String(structureResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
      );
    } catch {
      viralStructure = { error: "Failed to parse structure" };
    }

    // Step 2: Generate new script using the viral structure
    const gradeLevelInstruction = gradeLevel === "auto"
      ? "Choose the most appropriate grade level (between Grade 2-6) based on the topic and audience."
      : `Write at a Grade ${gradeLevel} reading level. Use simple vocabulary and short sentences appropriate for that grade level.`;

    const isSameTopic = topic === "SAME_TOPIC";
    const v13Context = buildV13ContextBlock(reel, { explicitUserAngle: !isSameTopic });
    const cuesInstruction = addCues ? buildDeliveryCuesPromptSection() : "";
    const scriptFormatClosing = addCues
      ? `Write the script as natural spoken text. Add delivery cues in [BRACKETS] throughout using the cue types above. Place each cue at the START of the line it applies to. Every 2-3 spoken lines should include a cue.
Use short paragraphs for natural pauses.
Do NOT include structural labels like "Hook:" or "Body:"; write one flowing speaking script with inline [CUES] only.`
      : `Write the script as spoken text (no stage directions, no [brackets]). Write it exactly as it should be spoken aloud.
Use short paragraphs to indicate natural pauses.
Do NOT include any labels like "Hook:" or "Body:" - just write the flowing script.`;

    const scriptPrompt = isSameTopic
      ? `You are an expert ${platformLabel} scriptwriter. Rewrite the following viral ${platformLabel} script keeping the EXACT SAME TOPIC and core message, but make it sound fresh and original, not a copy.

**VIRAL STRUCTURE ANALYSIS:**
${JSON.stringify(viralStructure, null, 2)}
${v13Context}

**ORIGINAL VIRAL TRANSCRIPT:**
${originalTranscript}

**READABILITY REQUIREMENT:**
${gradeLevelInstruction}${cuesInstruction}

**INSTRUCTIONS:**
1. Keep the SAME topic and core message as the original.
2. HOOK: Use the SAME hook pattern type ("${(viralStructure.hook as any)?.type || 'Bold Statement'}") with the same core idea, but rephrase it so it sounds different. Use different words, a slightly different angle, or a fresh way to open.
3. BODY: Cover the SAME key points and arguments but rephrase them. Change the examples, analogies, or supporting details. Keep the same pacing style ("${(viralStructure.body as any)?.pacing || 'Problem-solution'}") and information flow.
4. TRANSITION: Use a similar transition technique ("${(viralStructure.transition as any)?.type || 'pivot'}") but word it differently.
5. CTA: End with a similar call-to-action style ("${(viralStructure.cta as any)?.type || 'engagement'}") but phrase it in your own words.
6. Match the overall tone: "${(viralStructure as any)?.overallTone || 'engaging'}"
7. Keep similar length and pacing to the original.
8. The result should feel like a DIFFERENT PERSON making the same argument: same topic, same structure, but different wording throughout.
9. Do NOT just swap synonyms. Genuinely rephrase and restructure sentences while keeping the meaning.

${scriptFormatClosing}`
      : `You are an expert ${platformLabel} scriptwriter. Using the EXACT viral structure from a proven viral ${platformLabel}, write a NEW script on a different topic.

**VIRAL STRUCTURE ANALYSIS:**
${JSON.stringify(viralStructure, null, 2)}
${v13Context}

**ORIGINAL VIRAL TRANSCRIPT (for reference of style and pacing):**
${originalTranscript}

**NEW TOPIC/ANGLE:**
${topic}

${hasExplicitUserAngleInTopic(topic) ? RECREATE_EXPLICIT_ANGLE_RULES : RECREATE_DEFAULT_TOPIC_RULES}

**READABILITY REQUIREMENT:**
${gradeLevelInstruction}${cuesInstruction}

**INSTRUCTIONS:**
1. HOOK: Use the SAME hook pattern type ("${(viralStructure.hook as any)?.type || 'Bold Statement'}") but adapted to the new topic. Keep it punchy and attention-grabbing.
2. BODY: Follow the SAME pacing style ("${(viralStructure.body as any)?.pacing || 'Problem-solution'}") and information structure. Match the number of key points.
3. TRANSITION: Use a similar transition technique ("${(viralStructure.transition as any)?.type || 'pivot'}") adapted to the new topic.
4. CTA: End with a similar call-to-action style ("${(viralStructure.cta as any)?.type || 'engagement'}") but relevant to the new topic.
5. Match the overall tone: "${(viralStructure as any)?.overallTone || 'engaging'}"
6. Keep similar length and pacing to the original.

${scriptFormatClosing}`;

    const scriptResponse = await invokeLLM({
      messages: [
        { role: "system", content: withAiFormattingRules(`You are an expert ${platformLabel} scriptwriter. Write natural, spoken scripts that match viral patterns.`) },
        { role: "user", content: scriptPrompt },
      ],
    });

    const generatedScript = String(scriptResponse.choices[0].message.content || "");

    // Step 3: Hemingway-style readability analysis
    const hemingwayPrompt = `You are a readability analysis engine modeled after the Hemingway Editor. Analyze the following script and return a JSON response.

**SCRIPT:**
${generatedScript}

**TARGET GRADE LEVEL:** ${gradeLevel === "auto" ? "Auto-detect appropriate level" : `Grade ${gradeLevel}`}

Return a JSON object with:
{
  "gradeLevel": number (the Flesch-Kincaid grade level of the text),
  "readingEase": number (Flesch reading ease score, 0-100),
  "wordCount": number,
  "sentenceCount": number,
  "avgWordsPerSentence": number,
  "issues": [
    {
      "type": "passive_voice" | "complex_sentence" | "adverb" | "hard_to_read" | "very_hard_to_read",
      "text": "the exact problematic text",
      "suggestion": "brief suggestion for improvement"
    }
  ],
  "passiveVoiceCount": number,
  "adverbCount": number,
  "hardSentenceCount": number,
  "veryHardSentenceCount": number,
  "overallAssessment": "string - brief assessment of readability"
}

Return ONLY valid JSON.`;

    const hemingwayResponse = await invokeLLM({
      messages: [
        { role: "system", content: withAiFormattingRules("You are a readability analysis engine. Always respond with valid JSON only.") },
        { role: "user", content: hemingwayPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "readability_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              gradeLevel: { type: "number" },
              readingEase: { type: "number" },
              wordCount: { type: "number" },
              sentenceCount: { type: "number" },
              avgWordsPerSentence: { type: "number" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    text: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["type", "text", "suggestion"],
                  additionalProperties: false,
                },
              },
              passiveVoiceCount: { type: "number" },
              adverbCount: { type: "number" },
              hardSentenceCount: { type: "number" },
              veryHardSentenceCount: { type: "number" },
              overallAssessment: { type: "string" },
            },
            required: [
              "gradeLevel", "readingEase", "wordCount", "sentenceCount",
              "avgWordsPerSentence", "issues", "passiveVoiceCount", "adverbCount",
              "hardSentenceCount", "veryHardSentenceCount", "overallAssessment"
            ],
            additionalProperties: false,
          },
        },
      },
    });

    let readabilityAnalysis: Record<string, unknown>;
    try {
      readabilityAnalysis = sanitizeAiOutputDeep(
        JSON.parse((String(hemingwayResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
      );
    } catch {
      readabilityAnalysis = { error: "Failed to parse readability analysis" };
    }

    await updateRecreatedScript(scriptId, {
      viralStructure: viralStructure as any,
      generatedScript: String(generatedScript),
      readabilityAnalysis: readabilityAnalysis as any,
      status: "completed",
    });
    await maybeMarkFirstSpyCompletedFromFeaturedScript(scriptId);

    const stored = await getRecreatedScript(scriptId);
    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(userId),
      event: "remake_script_completed",
      properties: buildRemakeScriptCompletedProps({
        scriptId,
        userId,
        topic: stored?.topic ?? topic,
        generatedScript: String(generatedScript),
      }),
    });
  } catch (error) {
    const message = formatIdeaScriptErrorForUser(error, "remake");
    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(userId),
      event: "remake_script_failed",
      properties: buildRemakeScriptFailedProps({
        scriptId,
        userId,
        topic,
        errorMessage: message,
      }),
    });
    await updateRecreatedScript(scriptId, {
      status: "failed",
      errorMessage: message,
    });
  }
}

async function runScriptRewrite(
  scriptId: number,
  existingScript: string,
  viralStructure: Record<string, unknown> | null,
  originalTranscript: string,
  caption: string,
  gradeLevel: string,
  targetDuration: string,
  addCues: boolean,
  angle?: string,
  explicitUserAngle = false
): Promise<void> {
  try {
    const gradeLevelInstruction = gradeLevel === "auto"
      ? "Choose the most appropriate grade level (between Grade 2-8) based on the topic and audience."
      : `Write at a Grade ${gradeLevel} reading level. Use simple vocabulary and short sentences appropriate for that grade level.`;

    // Calculate target word count based on duration (average speaking pace ~150 words/minute)
    let durationInstruction = "";
    if (targetDuration !== "any") {
      const seconds = parseInt(targetDuration);
      const targetWords = Math.round((seconds / 60) * 150);
      const minWords = Math.round(targetWords * 0.85);
      const maxWords = Math.round(targetWords * 1.15);
      durationInstruction = `\n**TARGET DURATION:** ${seconds} seconds (~${targetWords} words). Keep the script between ${minWords}-${maxWords} words. Cut or expand content as needed while preserving the viral structure.`;
    }

    let cuesInstruction = "";
    if (addCues) {
      cuesInstruction = buildDeliveryCuesPromptSection();
    }

    const angleBlock = angle
      ? `\n**NEW ANGLE/TOPIC:**\n${angle}\n${explicitUserAngle ? `\n${RECREATE_EXPLICIT_ANGLE_RULES}\n` : ""}`
      : "";
    const topicInstruction = angle
      ? explicitUserAngle
        ? "Rewrite the script for the NEW ANGLE/TOPIC above. The angle is ground truth for subject and message. Keep the proven viral structure but change the subject, examples, and message to match the new angle. Ignore the literal topic of the current script and source transcript unless the angle asks for it."
        : "Rewrite the script for the NEW ANGLE/TOPIC above. Keep the proven viral structure but change the subject, examples, and message to match the new angle."
      : "Rewrite the script maintaining the same topic, message, and viral structure.";
    const captionBlock = caption ? `\n**SOURCE REEL CAPTION:**\n${caption}\n` : "";

    const rewritePrompt = `You are an expert Instagram Reels scriptwriter. Rewrite the following script with the specified adjustments.

**CURRENT SCRIPT:**
${existingScript}

${viralStructure ? `**VIRAL STRUCTURE (preserve this pattern):**\n${JSON.stringify(viralStructure, null, 2)}` : ""}

${originalTranscript ? `**ORIGINAL VIRAL TRANSCRIPT (for reference):**\n${originalTranscript}` : ""}
${captionBlock}${angleBlock}
**READABILITY REQUIREMENT:**
${gradeLevelInstruction}
${durationInstruction}
${cuesInstruction}

**INSTRUCTIONS:**
1. ${topicInstruction}
2. Adjust the vocabulary and sentence complexity to match the target grade level.
3. ${targetDuration !== "any" ? `Adjust the length to fit approximately ${targetDuration} seconds of speaking time.` : "Keep similar length."}
4. ${addCues ? "Add delivery cues in [BRACKETS] throughout to guide performance. Make cues specific and actionable." : "Do NOT add any delivery cues or stage directions."}
5. Keep the same hook pattern type, body pacing style, transition technique, and CTA style from the viral structure.
6. Write as natural spoken text with short paragraphs for natural pauses.
7. Do NOT include labels like "Hook:" or "Body:" - just write the flowing script${addCues ? " with [CUES] inline" : ""}.`;

    const scriptResponse = await invokeLLM({
      messages: [
        { role: "system", content: withAiFormattingRules("You are an expert Instagram Reels scriptwriter. Write natural, spoken scripts that match viral patterns.") },
        { role: "user", content: rewritePrompt },
      ],
    });

    const rewrittenScript = String(scriptResponse.choices[0].message.content || "");

    // Run readability analysis on the rewritten script
    const hemingwayPrompt = `You are a readability analysis engine. Analyze the following script and return a JSON response.

**SCRIPT:**
${rewrittenScript}

**TARGET GRADE LEVEL:** ${gradeLevel === "auto" ? "Auto-detect appropriate level" : `Grade ${gradeLevel}`}

Return a JSON object with:
{
  "gradeLevel": number (the Flesch-Kincaid grade level of the text),
  "readingEase": number (Flesch reading ease score, 0-100),
  "wordCount": number,
  "sentenceCount": number,
  "avgWordsPerSentence": number,
  "issues": [
    {
      "type": "passive_voice" | "complex_sentence" | "adverb" | "hard_to_read" | "very_hard_to_read",
      "text": "the exact problematic text",
      "suggestion": "brief suggestion for improvement"
    }
  ],
  "passiveVoiceCount": number,
  "adverbCount": number,
  "hardSentenceCount": number,
  "veryHardSentenceCount": number,
  "overallAssessment": "string - brief assessment of readability"
}

Return ONLY valid JSON.`;

    const hemingwayResponse = await invokeLLM({
      messages: [
        { role: "system", content: withAiFormattingRules("You are a readability analysis engine. Always respond with valid JSON only.") },
        { role: "user", content: hemingwayPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "readability_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              gradeLevel: { type: "number" },
              readingEase: { type: "number" },
              wordCount: { type: "number" },
              sentenceCount: { type: "number" },
              avgWordsPerSentence: { type: "number" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    text: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["type", "text", "suggestion"],
                  additionalProperties: false,
                },
              },
              passiveVoiceCount: { type: "number" },
              adverbCount: { type: "number" },
              hardSentenceCount: { type: "number" },
              veryHardSentenceCount: { type: "number" },
              overallAssessment: { type: "string" },
            },
            required: [
              "gradeLevel", "readingEase", "wordCount", "sentenceCount",
              "avgWordsPerSentence", "issues", "passiveVoiceCount", "adverbCount",
              "hardSentenceCount", "veryHardSentenceCount", "overallAssessment"
            ],
            additionalProperties: false,
          },
        },
      },
    });

    let readabilityAnalysis: Record<string, unknown>;
    try {
      readabilityAnalysis = sanitizeAiOutputDeep(
        JSON.parse((String(hemingwayResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim())
      );
    } catch {
      readabilityAnalysis = { error: "Failed to parse readability analysis" };
    }

    // Preserve the original viral structure
    await updateRecreatedScript(scriptId, {
      viralStructure: viralStructure as any,
      generatedScript: String(rewrittenScript),
      readabilityAnalysis: readabilityAnalysis as any,
      status: "completed",
    });
  } catch (error) {
    const message = formatIdeaScriptErrorForUser(error, "remake");
    await updateRecreatedScript(scriptId, {
      status: "failed",
      errorMessage: message,
    });
  }
}


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

/** Passing score (1-10) keeps the drafted script without another LLM regeneration pass. */
const IDEA_SCRIPT_JUDGE_PASS_SCORE = 7;
/** Attempts after the first draft when the judge score is below {@link IDEA_SCRIPT_JUDGE_PASS_SCORE}. */
const IDEA_SCRIPT_JUDGE_MAX_EXTRA_DRAFTS = 2;

/**
 * Returns format-specific hook and filming rules based on the selected filming format.
 * Hook type varies significantly by format — talking-head hooks differ from text-on-screen hooks.
 */
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

/**
 * Builds the viral hook examples block to inject into the script generation prompt.
 * Grounds the AI in real proven hooks from SpyReels' database.
 */
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

/**
 * Scores a script's first line for skip-rate likelihood (1-10).
 * 10 = viewer almost certainly keeps watching. 1 = high skip risk.
 * This is a lightweight single-LLM call focused only on the hook.
 */
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

/**
 * Fetch up to 3 top-performing hook examples from SpyReels' own data.
 *
 * Queries BOTH pools every time:
 *   Pool A — featuredReels: curated catalog (transcript inline on the row)
 *   Pool B — reels + transcriptions: every reel any user has spied on
 *
 * This means the data improves automatically as users spy and transcribe.
 * No retraining or manual updates needed.
 *
 * Priority order:
 *   1. Same niche + viralFlag=true  (best signal)
 *   2. Same niche, any viralFlag    (still niche-relevant)
 *   3. Any niche + viralFlag=true   (cross-niche fallback)
 *
 * Returns diverse hook patterns — tries not to repeat the same hookPattern
 * across the 3 examples so the AI sees variety.
 */
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

/**
 * Pull real viral hook examples from featured_reels and spied_reels
 * for a given DB niche slug and optional filming format.
 * Returns up to 6 hook lines with their pattern labels.
 */
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

/**
 * Background processor for Idea-to-Script.
 * Generates a full reel script from a user's topic idea using AI.
 */
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


/**
 * Brand Coach - score a Reel for viral potential.
 *
 * Pure function: receives whatever signal we have (caption + metrics,
 * and optionally transcript) and returns a structured analysis. The
 * caller (brandCoach.score mutation) handles caching and gating.
 */
const BRAND_COACH_SCORE_VERSION = 3 as const; // keep in sync with client BrandCoachBadge BRAND_COACH_SCORE_VERSION

function brandCoachCacheIsFresh(row: { scoreVersion?: number | null }): boolean {
  return (row.scoreVersion ?? 0) >= BRAND_COACH_SCORE_VERSION;
}

/** First ~3.5s of speech from timed segments (Deepgram), for hook grading. */
function extractHookTextFromSegments(
  segments: unknown,
  hookWindowSec = 3.6
): string | null {
  if (!Array.isArray(segments)) return null;
  const parts: string[] = [];
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const s = seg as { start?: unknown; end?: unknown; text?: unknown };
    const end = typeof s.end === "number" ? s.end : Number(s.end);
    const text = typeof s.text === "string" ? s.text.trim() : "";
    if (!text || !Number.isFinite(end)) continue;
    if (end <= hookWindowSec + 0.25) parts.push(text);
  }
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined.length > 0 ? joined.slice(0, 800) : null;
}

function durationBucketLabel(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 15) return "under_15s (ultra-short; every word must earn attention)";
  if (sec <= 30) return "15_30s (common viral slot)";
  if (sec <= 60) return "30_60s (needs strong mid-rehooks)";
  return "over_60s (needs exceptional density and payoff)";
}

type BrandCoachVerdict = "viral" | "strong" | "average" | "weak";

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

/** Clip long LLM lines so the Brand Coach modal stays scannable. */
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

/** Infer or pause for filming format before script generation. Returns false if paused. */
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

/**
 * Rule-based pre-check before script generation (no separate validation LLM).
 * Remake goes straight to scripting; Idea to Script uses the same model here.
 */
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
