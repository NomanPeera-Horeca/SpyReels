import { COOKIE_NAME } from "@shared/const";
import { EXPORT_SCOPES, resolveExportScope } from "@shared/exportScope";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminPanelProcedure, router } from "./_core/trpc";
import { workspacesRouter } from "./routers/workspacesRouter";
import { carouselRemakeRouter } from "./routers/carouselRemakeRouter";
import { carouselStudioRouter } from "./routers/carouselStudioRouter";
import { videoBrollRouter } from "./routers/videoBrollRouter";
import { brollLandingRouter } from "./routers/brollLandingRouter";
import { watermarkJobsRouter } from "./routers/watermarkJobsRouter";
import { reelsRouter } from "./routers/reelsRouter";
import { exportRouter } from "./routers/exportRouter";
import { savedRouter } from "./routers/savedRouter";
import { blogRouter } from "./routers/blogRouter";
import { scriptGeneratorRouter } from "./routers/scriptGeneratorRouter";
import { transcriptGeneratorRouter } from "./routers/transcriptGeneratorRouter";
import { scriptsRouter } from "./routers/scriptsRouter";
import { viralityDiagnosticRouter } from "./routers/viralityDiagnosticRouter";
import { onboardingRouter } from "./routers/onboardingRouter";
import { adminRouter } from "./routers/adminRouter";
import { firstDayOfNextMonthUtc, withSearchReelThumbnailMirroring } from "./routers/_shared";
import { searchRouter } from "./routers/searchRouter";
import { discoveryRouter } from "./routers/discoveryRouter";
import { creatorDiscoveryRouter } from "./routers/creatorDiscoveryRouter";
import { brandCoachRouter } from "./routers/brandCoachRouter";
import { extractHookTextFromSegments, runFeaturedReelTranscription, runTranscription } from "./routers/_shared";
import { activityRouter } from "./routers/activityRouter";
import { authRouter } from "./routers/authRouter";
import { billingRouter } from "./routers/billingRouter";
import { tagsRouter } from "./routers/tagsRouter";
import { googleDocsRouter } from "./routers/googleDocsRouter";
import { preferencesRouter } from "./routers/preferencesRouter";
import { telegramRouter } from "./routers/telegramRouter";
import { libraryRouter } from "./routers/libraryRouter";
import { viralPostsRouter } from "./viralPosts/router";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  normalizeInstagramHandle,
  isValidInstagramHandleNormalized,
  INSTAGRAM_HANDLE_INVALID_MESSAGE,
} from "@shared/instagramHandle";
import { reelNicheInputEnum } from "./reelNicheInputEnum";
import { REEL_NICHE_VALUES } from "@shared/reelNiches";
import {
  PUBLIC_DEMO_HANDLES,
  PUBLIC_DEMO_REEL_LIMIT,
  isPublicDemoHandle,
} from "@shared/publicDemoAccounts";
import {
  PUBLIC_TIKTOK_DEMO_HANDLES,
  PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT,
  isPublicTikTokDemoHandle,
} from "@shared/publicTikTokDemoAccounts";
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

import {
  classifyScrapeFailureMessage,
  classifyThrownInstagramError,
  instagramFailureLogReason,
  shouldRefundInstagramFailure,
} from "./scrapeFailureReason";
import {
  SCRAPE_JOB_STALE_MS,
  SCRAPE_JOB_ZOMBIE_MESSAGE,
} from "./scrapeJobSweeper";
import {
  releaseScrapeSlot,
  tryAcquireScrapeSlot,
} from "./scrapeSemaphore";
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
import { mirrorTiktokThumbnailsBounded } from "./tiktokScrape/mediaMirror";
import { repairTikTokProfilePicsBounded } from "./tiktokScrape/repairProfilePics";
import { fetchTikTokVideoInfo, scrapeTikTokVideos } from "./tiktok";
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
import {
  claimScriptGeneratorToStudio,
  previewScriptGeneratorPack,
} from "./scriptGeneratorPreview";
import {
  previewTranscriptGenerator,
} from "./transcriptGeneratorPreview";
import { TRANSCRIPT_GENERATOR_VARIANTS } from "@shared/transcriptGeneratorLanding";
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
  getSavedScriptIdForRecreated,
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
  resolveInstagramIdentity,
  searchReelsByKeyword,
  searchReelsByHandle,
  runWithScrapeCallContext,
} from "./instagram";
import { isDurableReelVideoUrl } from "./reelVideoR2";
import {
  isDurableTiktokVideoUrl,
  scheduleTiktokVideoMirror,
} from "./tiktokVideoR2";
import {
  enqueueCollectedReelIngest,
  enqueueCollectedReelRefresh,
} from "./collectedReelWorker";
import { ingestCollectedReelByShortcode, ensureCollectedMirrorReel } from "./collectedReelIngest";
import { sendHookGeneratorHooksEmail } from "./utils/email";
import { classifyTranscript } from "./_core/classifyTranscript";
import { invokeLLM } from "./_core/llm";
import { suggestBrollForScript, regenerateBrollBeat } from "./broll/suggestBroll";
import {
  getBrollGenerationByScriptId,
  listScriptIdsWithBroll as listBrollScriptIds,
  updateBrollGenerationBeatClips,
  upsertBrollGeneration,
} from "./broll/db";
import { withAiFormattingRules } from "./utils/aiFormattingRules";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";
import { AI_FACT_CLAIM_GUARDRAIL } from "@shared/aiFactClaimGuardrail";
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
import { mirrorReelThumbnailsBounded } from "./discovery/mediaMirror";
import {
  clientIpFromRequest,
  isPublicIpRateLimited,
} from "./publicRateLimit";
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
              "You are a viral Instagram Reels hook strategist. You write hooks that stop the scroll in the first 2 seconds. You understand what works on Reels specifically: high specificity, personal stakes, counter-intuitive truths, and emotional triggers. You reject generic AI-sounding language and clichés. Respond with valid JSON only, no prose, no markdown, no code fences."
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
- ${AI_FACT_CLAIM_GUARDRAIL}
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

/**
 * In-memory response cache for `featured.publicDemo`.
 *
 * Unauthenticated and allow-list scoped. Successful payloads use a long TTL
 * (scrape cadence). Empty/degraded handles use a short TTL so fallthrough still
 * works, but a bad handle is not re-probed (and does not re-fire CDN→R2 heal
 * jobs) on every anonymous request.
 */
type PublicDemoPayload = {
  handle: string;
  totalReelCount: number;
  medianViewCount: number;
  reels: {
    id: number;
    reelShortcode: string;
    caption: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    engagementRate: number;
    thumbnailUrl: string;
    duration: number | null;
    postedAt: Date;
    transcriptionStatus: string;
    contentType: string | null;
    hookPattern: string | null;
    productionFormat: string | null;
    viralFlag: boolean | null;
    confidence: number | null;
  }[];
};

const PUBLIC_DEMO_CACHE_TTL_MS = 10 * 60 * 1000;
/** Short TTL for inactive / zero-usable probes so fallthrough stays cheap. */
const PUBLIC_DEMO_EMPTY_CACHE_TTL_MS = 90 * 1000;
const publicDemoCache = new Map<string, { expiresAt: number; payload: PublicDemoPayload }>();

type PublicTikTokDemoPayload = {
  handle: string;
  totalVideoCount: number;
  medianViewCount: number;
  followerCount: number;
  videos: {
    id: string;
    awemeId: string;
    caption: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    engagementRate: number;
    thumbnailUrl: string;
    durationSec: number | null;
    postedAt: Date;
    videoPageUrl: string;
  }[];
};

const PUBLIC_TIKTOK_DEMO_CACHE_TTL_MS = 10 * 60 * 1000;
const PUBLIC_TIKTOK_DEMO_EMPTY_CACHE_TTL_MS = 90 * 1000;
const publicTikTokDemoCache = new Map<
  string,
  { expiresAt: number; payload: PublicTikTokDemoPayload }
>();

function emptyPublicTikTokDemoPayload(handle: string): PublicTikTokDemoPayload {
  return {
    handle,
    totalVideoCount: 0,
    medianViewCount: 0,
    followerCount: 0,
    videos: [],
  };
}

function readPublicTikTokDemoCache(handle: string): PublicTikTokDemoPayload | null {
  const hit = publicTikTokDemoCache.get(handle);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    publicTikTokDemoCache.delete(handle);
    return null;
  }
  return hit.payload;
}

function writePublicTikTokDemoCache(
  handle: string,
  payload: PublicTikTokDemoPayload
): void {
  const empty = payload.videos.length === 0;
  publicTikTokDemoCache.set(handle, {
    expiresAt:
      Date.now() +
      (empty ? PUBLIC_TIKTOK_DEMO_EMPTY_CACHE_TTL_MS : PUBLIC_TIKTOK_DEMO_CACHE_TTL_MS),
    payload,
  });
}

type PublicProfilePreviewPayload =
  | {
      found: true;
      username: string;
      fullName: string;
      biography: string;
      profilePicUrl: string;
      followerCount: number;
      followingCount: number;
      postCount: number;
      isVerified: boolean;
      isPrivate: boolean;
      category: string;
      externalUrl: string;
    }
  | {
      found: false;
      error: string;
    };

const PUBLIC_PROFILE_PREVIEW_TTL_MS = 5 * 60_000;
const publicProfilePreviewCache = new Map<
  string,
  { expiresAt: number; payload: PublicProfilePreviewPayload }
>();

function readPublicProfilePreviewCache(
  handle: string
): PublicProfilePreviewPayload | null {
  const hit = publicProfilePreviewCache.get(handle);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    publicProfilePreviewCache.delete(handle);
    return null;
  }
  return hit.payload;
}

function writePublicProfilePreviewCache(
  handle: string,
  payload: PublicProfilePreviewPayload
): void {
  publicProfilePreviewCache.set(handle, {
    expiresAt: Date.now() + PUBLIC_PROFILE_PREVIEW_TTL_MS,
    payload,
  });
}

/** Probe counters for proving negative-path cache behaviour (in-process tests). */
export const publicDemoProbeStats = {
  requests: 0,
  cacheHitFull: 0,
  cacheHitEmpty: 0,
  accountQueries: 0,
  countQueries: 0,
  medianQueries: 0,
  reelListQueries: 0,
  healJobsStarted: 0,
  emptyCacheWrites: 0,
  fullCacheWrites: 0,
};

export function resetPublicDemoProbeStats(): void {
  publicDemoProbeStats.requests = 0;
  publicDemoProbeStats.cacheHitFull = 0;
  publicDemoProbeStats.cacheHitEmpty = 0;
  publicDemoProbeStats.accountQueries = 0;
  publicDemoProbeStats.countQueries = 0;
  publicDemoProbeStats.medianQueries = 0;
  publicDemoProbeStats.reelListQueries = 0;
  publicDemoProbeStats.healJobsStarted = 0;
  publicDemoProbeStats.emptyCacheWrites = 0;
  publicDemoProbeStats.fullCacheWrites = 0;
}

export function clearPublicDemoCache(): void {
  publicDemoCache.clear();
}

function emptyPublicDemoPayload(handle: string): PublicDemoPayload {
  return { handle, totalReelCount: 0, medianViewCount: 0, reels: [] };
}

function readPublicDemoCache(handle: string): PublicDemoPayload | null {
  const hit = publicDemoCache.get(handle);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    publicDemoCache.delete(handle);
    return null;
  }
  return hit.payload;
}

function writePublicDemoCache(handle: string, payload: PublicDemoPayload): void {
  const empty = payload.reels.length === 0;
  publicDemoCache.set(handle, {
    expiresAt:
      Date.now() +
      (empty ? PUBLIC_DEMO_EMPTY_CACHE_TTL_MS : PUBLIC_DEMO_CACHE_TTL_MS),
    payload,
  });
  if (empty) publicDemoProbeStats.emptyCacheWrites += 1;
  else publicDemoProbeStats.fullCacheWrites += 1;
}

async function featuredAccountMedianViewCount(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  reelFilter: ReturnType<typeof and>,
  totalReelCount: number
): Promise<number> {
  if (totalReelCount <= 0) return 0;
  publicDemoProbeStats.medianQueries += 1;
  const offset = Math.floor((totalReelCount - 1) / 2);
  const limit = totalReelCount % 2 === 0 ? 2 : 1;
  const midRows = await db
    .select({ viewCount: featuredReels.viewCount })
    .from(featuredReels)
    .where(reelFilter)
    .orderBy(asc(featuredReels.viewCount))
    .limit(limit)
    .offset(offset);
  if (midRows.length === 0) return 0;
  if (midRows.length === 1) return midRows[0].viewCount;
  return Math.round((midRows[0].viewCount + midRows[1].viewCount) / 2);
}

export const appRouter = router({
  system: systemRouter,

  workspaces: workspacesRouter,

  carouselRemake: carouselRemakeRouter,

  carouselStudio: carouselStudioRouter,

  videoBroll: videoBrollRouter,

  watermarkJobs: watermarkJobsRouter,

  brollLanding: brollLandingRouter,

  viralPosts: viralPostsRouter,

  activity: activityRouter,

  // ── Billing & Subscription ──
  billing: billingRouter,

  auth: authRouter,

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
          const staleBefore = Date.now() - SCRAPE_JOB_STALE_MS;
          const lastTouch = new Date(existingRunningJob.updatedAt).getTime();
          if (Number.isFinite(lastTouch) && lastTouch >= staleBefore) {
            return { jobId: existingRunningJob.id, resumed: true as const };
          }
          // Zombie: process likely died mid-scrape. Fail it and start fresh.
          await updateScrapeJob(existingRunningJob.id, {
            status: "failed",
            errorMessage: SCRAPE_JOB_ZOMBIE_MESSAGE,
            currentStep: "failed",
            failureReason: "unknown",
          });
          console.warn(
            `[scrape.start] marked stale running job ${existingRunningJob.id} (@${normalizedHandle}) failed before starting a new scrape`
          );
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

        // Process-local OOM guard: refuse rather than queue a job that never starts.
        if (!tryAcquireScrapeSlot()) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Too many scrapes running right now, try again in a few minutes",
          });
        }

        let launched = false;
        try {
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

          // Run scraping in background (releases the semaphore in finally).
          runScrapeJob(jobId, ctx.user.id, normalizedHandle, input.timeframeDays).catch((err) => {
            console.error(`Scrape job ${jobId} failed:`, err);
          });
          launched = true;

          return seededFromFeatured ? { jobId, seededFromFeatured: true as const } : { jobId };
        } finally {
          if (!launched) releaseScrapeSlot();
        }
      }),

    status: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        return job;
      }),

    /** Cancel an in-flight scrape owned by the current user. */
    cancel: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.userId !== ctx.user.id || job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (job.status !== "running" && job.status !== "pending") {
          return { jobId: job.id, status: job.status };
        }
        await updateScrapeJob(job.id, {
          status: "failed",
          errorMessage: "Cancelled by user",
          currentStep: "failed",
          failureReason: "unknown",
        });
        return { jobId: job.id, status: "failed" as const };
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
          const profile = await resolveInstagramIdentity(input.handle);
          const cleanHandle = normalizeInstagramHandle(profile.username);
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
  reels: reelsRouter,

  // ── Featured Accounts (pre-scraped catalog browsed by niche) ──
  featured: router({
    /**
     * Public, read-only demo slice of the curated featured catalog. Powers the
     * logged-out /features/viral-reel-finder marketing page, so it is the one
     * unauthenticated procedure in this router: restricted to the
     * `PUBLIC_DEMO_HANDLES` allow-list, capped at `PUBLIC_DEMO_REEL_LIMIT`
     * rows, and returning display fields only — never transcript text,
     * videoUrl, or account/user ids.
     *
     * If the requested allow-listed handle is inactive or has zero usable
     * reels, walks the rest of the allow-list so the marketing page never
     * renders an empty grid.
     */
    publicDemo: publicProcedure
      .input(z.object({ handle: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        publicDemoProbeStats.requests += 1;
        const ip = clientIpFromRequest(ctx.req);
        if (isPublicIpRateLimited(ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please try again in a minute.",
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database unavailable",
          });
        }

        const requested = normalizeInstagramHandle(input?.handle ?? "");
        const tryOrder: string[] = [];
        if (isPublicDemoHandle(requested)) tryOrder.push(requested);
        for (const h of PUBLIC_DEMO_HANDLES) {
          if (!tryOrder.includes(h)) tryOrder.push(h);
        }

        for (const handle of tryOrder) {
          const cached = readPublicDemoCache(handle);
          if (cached) {
            if (cached.reels.length > 0) {
              publicDemoProbeStats.cacheHitFull += 1;
              return cached;
            }
            // Cached empty/degraded: skip DB + heal jobs, try next handle.
            publicDemoProbeStats.cacheHitEmpty += 1;
            continue;
          }

          publicDemoProbeStats.accountQueries += 1;
          const accountRows = await db
            .select({
              id: featuredAccounts.id,
              handle: featuredAccounts.handle,
              followerCount: featuredAccounts.followerCount,
            })
            .from(featuredAccounts)
            .where(
              and(eq(featuredAccounts.handle, handle), eq(featuredAccounts.isActive, true))
            )
            .limit(1);

          if (accountRows.length === 0) {
            writePublicDemoCache(handle, emptyPublicDemoPayload(handle));
            continue;
          }

          const acc = accountRows[0];
          const reelFilter = and(
            eq(featuredReels.featuredAccountId, acc.id),
            ne(featuredReels.transcriptionStatus, "failed")
          );

          publicDemoProbeStats.countQueries += 1;
          const [countRow] = await db
            .select({ c: sql<number>`COUNT(*)` })
            .from(featuredReels)
            .where(reelFilter);
          const totalReelCount = Number(countRow?.c ?? 0);

          if (totalReelCount === 0) {
            writePublicDemoCache(handle, emptyPublicDemoPayload(handle));
            continue;
          }

          const medianViewCount = await featuredAccountMedianViewCount(
            db,
            reelFilter,
            totalReelCount
          );

          // Over-fetch so we can still return a full page when some top rows
          // still point at expired Instagram CDN thumbs.
          const CANDIDATE_LIMIT = Math.max(PUBLIC_DEMO_REEL_LIMIT * 2, 16);
          publicDemoProbeStats.reelListQueries += 1;
          const reelRows = await db
            .select({
              id: featuredReels.id,
              reelShortcode: featuredReels.reelShortcode,
              caption: featuredReels.caption,
              viewCount: featuredReels.viewCount,
              likeCount: featuredReels.likeCount,
              commentCount: featuredReels.commentCount,
              engagementRate: featuredReels.engagementRate,
              thumbnailUrl: featuredReels.thumbnailUrl,
              duration: featuredReels.duration,
              postedAt: featuredReels.postedAt,
              transcriptionStatus: featuredReels.transcriptionStatus,
              contentType: featuredReels.contentType,
              hookPattern: featuredReels.hookPattern,
              productionFormat: featuredReels.productionFormat,
              viralFlag: featuredReels.viralFlag,
              confidence: featuredReels.confidence,
            })
            .from(featuredReels)
            .where(reelFilter)
            .orderBy(desc(featuredReels.viewCount))
            .limit(CANDIDATE_LIMIT);

          if (reelRows.length === 0) {
            writePublicDemoCache(handle, emptyPublicDemoPayload(handle));
            continue;
          }

          const followerCount = acc.followerCount || 0;
          const r2PublicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(
            /\/+$/,
            ""
          );

          const isStableThumb = (url: string) => {
            if (!url) return false;
            if (r2PublicBase && url.startsWith(r2PublicBase)) return true;
            try {
              const host = new URL(url).host;
              return host.endsWith(".r2.dev") || host.includes("cloudfront.net");
            } catch {
              return false;
            }
          };

          const looksLikeCdn = (url: string) =>
            /cdninstagram\.com|fbcdn\.net|instagram\.com/i.test(url);

          // Prefer already-stable R2 thumbs on the read path. CDN rows are
          // skipped for this response and healed fire-and-forget so an
          // anonymous GET never blocks on CDN download + R2 write.
          const usable: PublicDemoPayload["reels"] = [];
          const healJobs: Promise<void>[] = [];

          for (const r of reelRows) {
            if (usable.length >= PUBLIC_DEMO_REEL_LIMIT) break;

            const rawThumb = (r.thumbnailUrl ?? "").trim();
            if (!rawThumb) continue;

            if (!isStableThumb(rawThumb)) {
              if (looksLikeCdn(rawThumb)) {
                publicDemoProbeStats.healJobsStarted += 1;
                healJobs.push(
                  (async () => {
                    const healed = await ensureReelThumbnailOnR2(
                      r.reelShortcode,
                      rawThumb
                    );
                    if (!isStableThumb(healed) || healed === rawThumb) return;
                    await db
                      .update(featuredReels)
                      .set({ thumbnailUrl: healed })
                      .where(eq(featuredReels.id, r.id));
                  })().catch((err) => {
                    console.warn(
                      `[featured.publicDemo] background thumb heal failed for ${r.reelShortcode}:`,
                      err instanceof Error ? err.message : err
                    );
                  })
                );
              }
              continue;
            }

            usable.push({
              id: r.id,
              reelShortcode: r.reelShortcode,
              caption: r.caption ?? "",
              viewCount: r.viewCount,
              likeCount: r.likeCount,
              commentCount: r.commentCount,
              engagementRate:
                followerCount > 0
                  ? accountEngagementRatePercent(
                      r.likeCount,
                      r.commentCount,
                      followerCount
                    )
                  : Number(r.engagementRate ?? 0),
              thumbnailUrl: rawThumb,
              duration: r.duration,
              postedAt: r.postedAt,
              transcriptionStatus: r.transcriptionStatus,
              contentType: r.contentType ?? null,
              hookPattern: r.hookPattern ?? null,
              productionFormat: r.productionFormat ?? null,
              viralFlag: r.viralFlag,
              confidence: r.confidence ?? null,
            });
          }

          if (healJobs.length > 0) {
            void Promise.allSettled(healJobs);
          }

          if (usable.length === 0) {
            writePublicDemoCache(handle, emptyPublicDemoPayload(handle));
            continue;
          }

          if (usable.length < PUBLIC_DEMO_REEL_LIMIT) {
            console.warn(
              `[featured.publicDemo] handle=@${acc.handle} only returned ${usable.length}/${PUBLIC_DEMO_REEL_LIMIT} reels with stable thumbnails (candidates=${reelRows.length})`
            );
          }

          const payload: PublicDemoPayload = {
            handle: acc.handle,
            totalReelCount,
            medianViewCount,
            reels: usable,
          };

          writePublicDemoCache(handle, payload);
          return payload;
        }

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This creator isn't available",
        });
      }),

    /**
     * Unauthenticated profile lookup for the viral reel finder landing hero.
     * Same payload shape as `scrape.profilePreview`, with the shared public IP
     * rate limit plus a short in-memory cache so anonymous typing does not
     * re-hit ScrapeCreators on every keystroke debounce.
     */
    publicProfilePreview: publicProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ ctx, input }) => {
        const ip = clientIpFromRequest(ctx.req);
        if (isPublicIpRateLimited(ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please try again in a minute.",
          });
        }

        const normalized = normalizeInstagramHandle(input.handle);
        if (!isValidInstagramHandleNormalized(normalized)) {
          return {
            found: false as const,
            error: INSTAGRAM_HANDLE_INVALID_MESSAGE,
          };
        }

        const cached = readPublicProfilePreviewCache(normalized);
        if (cached) return cached;

        try {
          const profile = await fetchProfile(normalized);
          const cleanHandle = normalizeInstagramHandle(profile.username);
          const proxiedPicUrl = await ensureProfilePicOnR2(
            cleanHandle,
            profile.profilePicUrl
          );
          const payload = {
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
          writePublicProfilePreviewCache(normalized, payload);
          return payload;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Profile not found";
          const payload = {
            found: false as const,
            error: message,
          };
          writePublicProfilePreviewCache(normalized, payload);
          return payload;
        }
      }),

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
  discovery: discoveryRouter,

  // ── Creator-first Discovery ──
  creatorDiscovery: creatorDiscoveryRouter,

  viralityDiagnostic: viralityDiagnosticRouter,

  // ── Export ──
  export: exportRouter,

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
  saved: savedRouter,

  // ── Script Library ──
  scripts: scriptsRouter,

  // ── Search Reels ──
  search: searchRouter,

  // ── Script Tags ──
  tags: tagsRouter,

  // ── Google Docs Export ──
  googleDocs: googleDocsRouter,

  // ── User Preferences ──
  preferences: preferencesRouter,

  // ── Onboarding state (first-run experience flags + flow) ──
  onboarding: onboardingRouter,

  // ── Blog ──
  blog: blogRouter,

  // ── Telegram Bot Connection ──
  telegram: telegramRouter,

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

        const r2PublicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "")
          .replace(/\/+$/, "")
          .trim();
        const isR2MediaUrl = (url: string) =>
          Boolean(r2PublicBase && url.startsWith(r2PublicBase));

        const preferTxnMedia = (
          fromTxnReel: string | null | undefined,
          fromCollected: string | null | undefined
        ): string | null => {
          const a = (fromTxnReel ?? "").trim();
          const b = (fromCollected ?? "").trim();
          // Prefer durable R2 over ephemeral CDN (TikTok covers expire / may be HEIC).
          if (b && isR2MediaUrl(b) && (!a || !isR2MediaUrl(a))) {
            return fromCollected ?? null;
          }
          if (a) return fromTxnReel ?? null;
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

    /** Add a reel by URL (Instagram / TikTok / YouTube paste from web UI) */
    addByUrl: protectedProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { parseCollectedVideoUrl } = await import("./socialVideoUrl");
        const parsed = await parseCollectedVideoUrl(input.url);
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Could not parse that link. Paste an Instagram Reel, TikTok video, or YouTube URL.",
          });
        }

        const ingest = await ingestCollectedReelByShortcode({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          shortcode: parsed.externalId,
          reelUrl: parsed.canonicalUrl,
          source: "url_paste",
          platform: parsed.platform,
        });

        return {
          id: ingest.id,
          duplicate: ingest.action === "duplicate",
          retried: ingest.action === "retried",
          platform: parsed.platform,
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

    /** Save / unsave a collected reel into Saved Reels (same bookmark as Creator Radar). */
    toggleSave: protectedProcedure
      .input(z.object({ collectedReelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await assertCollectedReelInWorkspace(
          input.collectedReelId,
          ctx
        );
        if (reel.status !== "ready") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Reel metadata not ready yet",
          });
        }

        const reelId = await ensureCollectedMirrorReel(reel);
        const alreadySaved = await isReelSaved(
          ctx.workspaceId,
          ctx.user.id,
          reelId
        );
        if (alreadySaved) {
          await unsaveReel(ctx.workspaceId, ctx.user.id, reelId);
          return { saved: false as const, reelId };
        }
        await saveReel({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          reelId,
          jobId: 0,
        });
        return { saved: true as const, reelId };
      }),

    /** Transcribe a collected reel */
    transcribe: protectedProcedure
      .input(z.object({ collectedReelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await assertCollectedReelInWorkspace(input.collectedReelId, ctx);
        if (reel.status !== "ready") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reel metadata not ready yet" });
        }

        const platform = (reel.platform || "instagram").toLowerCase();
        const isYouTube = platform === "youtube";

        if (!isYouTube && !reel.videoUrl) {
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

        const reelId = await ensureCollectedMirrorReel(reel);

        const existingTranscription = await getTranscriptionByReelId(reelId);
        if (existingTranscription && existingTranscription.status === "completed") {
          return { reelId, transcriptionId: existingTranscription.id, status: "completed" as const };
        }
        if (existingTranscription && existingTranscription.status === "processing") {
          return { reelId, transcriptionId: existingTranscription.id, status: "processing" as const };
        }

        // YouTube: caption track via ScrapeCreators (no MP4 download)
        if (isYouTube) {
          const transcriptResult = await fetchYouTubeTranscript(reel.reelUrl);
          if (!transcriptResult) {
            const transcriptionId = await createTranscription({
              reelId,
              transcript: "",
              segments: [],
              hookAnalysis: "",
              status: "completed",
              queuedAt: new Date(),
              startedAt: new Date(),
            });
            return { reelId, transcriptionId, status: "completed" as const };
          }

          const hookAnalysis = await analyzeHook(
            transcriptResult.transcript,
            reel.caption || "",
            reel.thumbnailUrl || "",
            transcriptResult.segments,
            "YouTube Short"
          );
          const transcriptionId = await createTranscription({
            reelId,
            transcript: transcriptResult.transcript,
            segments: transcriptResult.segments,
            hookAnalysis,
            status: "completed",
            queuedAt: new Date(),
            startedAt: new Date(),
          });
          return { reelId, transcriptionId, status: "completed" as const };
        }

        const transcriptionId = await createTranscription({
          reelId,
          status: "processing",
          queuedAt: new Date(),
        });

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

  scriptGenerator: scriptGeneratorRouter,

  transcriptGenerator: transcriptGeneratorRouter,

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
  library: libraryRouter,

  // ── Brand Coach (AI viral-potential scoring) ──
  brandCoach: brandCoachRouter,

  // ── Admin Dashboard ──
  admin: adminRouter,

  tiktokScrape: router({
    /**
     * Logged-out TikTok finder landing preview. Allow-list only
     * (`PUBLIC_TIKTOK_DEMO_HANDLES`), capped at `PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT`,
     * display fields only — never videoUrl / download URLs.
     */
    publicDemo: publicProcedure
      .input(z.object({ handle: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const ip = clientIpFromRequest(ctx.req);
        if (isPublicIpRateLimited(ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please try again in a minute.",
          });
        }

        const requested = (input?.handle ?? "")
          .replace(/^@/, "")
          .trim()
          .toLowerCase();
        const tryOrder: string[] = [];
        if (isPublicTikTokDemoHandle(requested)) tryOrder.push(requested);
        for (const h of PUBLIC_TIKTOK_DEMO_HANDLES) {
          if (!tryOrder.includes(h)) tryOrder.push(h);
        }

        for (const handle of tryOrder) {
          const cached = readPublicTikTokDemoCache(handle);
          if (cached) {
            if (cached.videos.length > 0) return cached;
            continue;
          }

          try {
            const result = await scrapeTikTokVideos(handle, undefined, {
              maxVideos: Math.max(PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT * 3, 24),
              timeoutMs: 45_000,
            });

            const sorted = [...result.videos].sort(
              (a, b) => b.viewCount - a.viewCount
            );
            const top = sorted.slice(0, PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT);
            if (top.length === 0) {
              writePublicTikTokDemoCache(handle, emptyPublicTikTokDemoPayload(handle));
              continue;
            }

            const mirrored = await mirrorTiktokThumbnailsBounded(
              top.map((v) => ({
                awemeId: v.awemeId,
                thumbnailUrl: v.thumbnailUrl,
              }))
            );

            const viewCounts = result.videos
              .map((v) => v.viewCount)
              .filter((n) => Number.isFinite(n) && n > 0)
              .sort((a, b) => a - b);
            let medianViewCount = 0;
            if (viewCounts.length > 0) {
              const mid = Math.floor(viewCounts.length / 2);
              medianViewCount =
                viewCounts.length % 2 === 0
                  ? Math.round(
                      (viewCounts[mid - 1]! + viewCounts[mid]!) / 2
                    )
                  : viewCounts[mid]!;
            }

            const followerCount = result.followerCount || 0;
            const payload: PublicTikTokDemoPayload = {
              handle: result.videos[0]?.ownerUsername || handle,
              totalVideoCount: result.videos.length,
              medianViewCount,
              followerCount,
              videos: top.map((v) => ({
                id: v.awemeId,
                awemeId: v.awemeId,
                caption: v.caption ?? "",
                viewCount: v.viewCount,
                likeCount: v.likeCount,
                commentCount: v.commentCount,
                shareCount: v.shareCount,
                engagementRate:
                  followerCount > 0
                    ? Math.round(
                        ((v.likeCount + v.commentCount + v.shareCount) /
                          followerCount) *
                          10000
                      ) / 100
                    : 0,
                thumbnailUrl: mirrored.get(v.awemeId) || v.thumbnailUrl || "",
                durationSec: v.durationSec,
                postedAt: v.postedAt,
                videoPageUrl: v.videoPageUrl,
              })),
            };

            writePublicTikTokDemoCache(handle, payload);
            return payload;
          } catch (err) {
            console.warn(
              `[tiktokScrape.publicDemo] handle=@${handle} failed:`,
              err instanceof Error ? err.message : err
            );
            writePublicTikTokDemoCache(handle, emptyPublicTikTokDemoPayload(handle));
            continue;
          }
        }

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This creator isn't available",
        });
      }),

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

      const repaired = await repairTikTokProfilePicsBounded(jobs);
      const jobsWithPics = repaired.size
        ? jobs.map((job) => {
            const next = repaired.get(job.id);
            return next ? { ...job, profilePicUrl: next } : job;
          })
        : jobs;

      return jobsWithPics.map((job) => ({
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
      .input(
        z.object({
          videoId: z.number().optional(),
          videoPageUrl: z.string().url().optional(),
        }).refine(
          (v) => v.videoId != null || Boolean(v.videoPageUrl?.trim()),
          { message: "videoId or videoPageUrl required" }
        )
      )
      .mutation(async ({ ctx, input }) => {
        const pageOnly = (input.videoPageUrl ?? "").trim();
        if (input.videoId == null) {
          if (!pageOnly) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "videoPageUrl required",
            });
          }
          const fresh = await fetchTikTokVideoInfo(pageOnly, {
            mode: "interactive",
          });
          const videoUrl = fresh?.videoUrl?.trim() || "";
          if (!videoUrl) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Could not retrieve a fresh video URL for this TikTok.",
            });
          }
          return { videoUrl };
        }

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

        const pageCandidates = [
          pageOnly,
          (video.videoPageUrl ?? "").trim(),
          video.ownerUsername && video.awemeId
            ? `https://www.tiktok.com/@${video.ownerUsername.replace(/^@/, "")}/video/${video.awemeId}`
            : "",
        ].filter((u, i, arr) => u && arr.indexOf(u) === i);

        let freshUrl = "";
        for (const pageUrl of pageCandidates) {
          const fresh = await fetchTikTokVideoInfo(pageUrl, {
            mode: "interactive",
          });
          if (fresh?.videoUrl?.trim()) {
            freshUrl = fresh.videoUrl.trim();
            break;
          }
        }

        if (!freshUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not retrieve a fresh video URL for this TikTok.",
          });
        }

        const videoUrl = freshUrl;
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

/** Map provider errors to safe user-facing job failure messages. */

/** Background creator-first discovery job runner (async poll flow). */

/** Background scrape job runner */
async function runScrapeJob(
  jobId: number,
  userId: number,
  handle: string,
  timeframeDays: number
): Promise<void> {
  try {
    await runScrapeJobInner(jobId, userId, handle, timeframeDays);
  } finally {
    releaseScrapeSlot();
  }
}

async function runScrapeJobInner(
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
      canonicalUsername,
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

    const cleanHandle = normalizeInstagramHandle(canonicalUsername || handle);
    if (cleanHandle && cleanHandle !== cleanHandleForLog) {
      const currentJob = await getScrapeJob(jobId);
      const siblings = currentJob
        ? await getScrapeJobsByWorkspace(currentJob.workspaceId)
        : [];
      const handleTaken = siblings.some(
        (j) =>
          j.id !== jobId &&
          j.handle.toLowerCase() === cleanHandle &&
          (j.status === "completed" || j.status === "running")
      );
      if (handleTaken) {
        console.warn(
          `[runScrapeJob ${jobId}] skipped canonical handle update @${cleanHandleForLog} -> @${cleanHandle}: another Radar job already uses that handle`
        );
      } else {
        await updateScrapeJob(jobId, { handle: cleanHandle });
      }
    }
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
    const failureReason =
      classifyThrownInstagramError(error) ??
      classifyScrapeFailureMessage(message);
    const logReason = instagramFailureLogReason(error, failureReason);
    console.warn(
      `[runScrapeJob ${jobId}] failed handle=@${handle.replace(/^@/, "").trim().toLowerCase()} reason=${logReason}: ${message}`
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
    // Restricted media is Instagram withholding content after we found the
    // creator; refund so the user is not charged for an unusable result.
    if (shouldRefundInstagramFailure(error, failureReason)) {
      await refundScrapeQuota(`exception:${logReason}`);
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
    const failureReason =
      classifyThrownInstagramError(error) ??
      classifyScrapeFailureMessage(message);
    await updateScrapeJob(jobId, {
      status: "failed",
      errorMessage: message,
      currentStep: "failed",
      failureReason,
    });
  }
}

/** Background transcription runner */

/**
 * Featured-reel transcription runner (Commit 4b). Writes the result
 * straight into `featured_reels` instead of `transcriptions` because the
 * catalog owns a single shared transcript per reel — the same semaphore
 * + fresh-URL logic as `runTranscription`, but no hook analysis and no
 * per-user row. Also used by the backfill script.
 */

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
3. BODY: Cover the SAME key points and arguments but rephrase them. Change the examples, analogies, or supporting details. New examples must stay generic or hypothetical; do not swap in a different invented real-entity fact, study, or named-source claim. ${AI_FACT_CLAIM_GUARDRAIL} Keep the same pacing style ("${(viralStructure.body as any)?.pacing || 'Problem-solution'}") and information flow.
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



/** First ~3.5s of speech from timed segments (Deepgram), for hook grading. */







/** Clip long LLM lines so the Brand Coach modal stays scannable. */


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
