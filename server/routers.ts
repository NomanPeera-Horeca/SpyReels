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
import { scrapeRouter } from "./routers/scrapeRouter";
import { featuredRouter } from "./routers/featuredRouter";
import { transcribeRouter } from "./routers/transcribeRouter";
import { recreateRouter } from "./routers/recreateRouter";
import { collectedRouter } from "./routers/collectedRouter";
import { ideasRouter } from "./routers/ideasRouter";
import { tiktokScrapeRouter } from "./routers/tiktokScrapeRouter";
import { youtubeScrapeRouter } from "./routers/youtubeScrapeRouter";
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
  getSavedScriptIdForReel,
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



/** Short TTL for inactive / zero-usable probes so fallthrough stays cheap. */



















/** Probe counters for proving negative-path cache behaviour (in-process tests). */








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
  scrape: scrapeRouter,

  // ── Reels ──
  reels: reelsRouter,

  // ── Featured Accounts (pre-scraped catalog browsed by niche) ──
  featured: featuredRouter,

  // ── Transcription ──
  transcribe: transcribeRouter,

  // ── Discovery (Creator Radar) ──
  discovery: discoveryRouter,

  // ── Creator-first Discovery ──
  creatorDiscovery: creatorDiscoveryRouter,

  viralityDiagnostic: viralityDiagnosticRouter,

  // ── Export ──
  export: exportRouter,

  // ── Re-Create Script ──
  recreate: recreateRouter,

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
  collected: collectedRouter,

  hookGenerator: hookGeneratorRouter,

  scriptGenerator: scriptGeneratorRouter,

  transcriptGenerator: transcriptGeneratorRouter,

  // ── Script Ideas (Idea to Script Factory) ──
  ideas: ideasRouter,

  // ── Library: Central hub for all transcripts & scripts ──
  library: libraryRouter,

  // ── Brand Coach (AI viral-potential scoring) ──
  brandCoach: brandCoachRouter,

  // ── Admin Dashboard ──
  admin: adminRouter,

  tiktokScrape: tiktokScrapeRouter,

  youtubeScrape: youtubeScrapeRouter,

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

/**
 * Flip `hasCompletedFirstSpy` exactly once per user (shared guard).
 */

/**
 * Featured Remake now aha moment: first successful script from catalog reels
 * counts as completing first spy so the hint card dismisses without a scrape job.
 */

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

/**
 * Upload an array of reel thumbnails to R2 with bounded concurrency.
 * Returns a map from shortcode → stable URL (R2 public URL on success,
 * the original IG URL on failure). Skips entries with empty thumbnailUrl.
 *
 * Bounded at 5 concurrent uploads so a 200-reel scrape doesn't fan out
 * 200 simultaneous CDN downloads, while staying ~40× faster than serial.
 */

/** Background discovery job runner (async poll flow). */

/** Map provider errors to safe user-facing job failure messages. */

/** Background creator-first discovery job runner (async poll flow). */

/** Background scrape job runner */


/** Background resync job runner — only fetches new reels since last sync */

/** Background transcription runner */

/**
 * Featured-reel transcription runner (Commit 4b). Writes the result
 * straight into `featured_reels` instead of `transcriptions` because the
 * catalog owns a single shared transcript per reel — the same semaphore
 * + fresh-URL logic as `runTranscription`, but no hook analysis and no
 * per-user row. Also used by the backfill script.
 */






/** Shared LLM instructions for [BRACKET] delivery cues (recreate + rewrite). */

/** Background job: analyze viral structure and generate a new script */








/** Passing score (1-10) keeps the drafted script without another LLM regeneration pass. */

/** Attempts after the first draft when the judge score is below {@link IDEA_SCRIPT_JUDGE_PASS_SCORE}. */


/**
 * Returns format-specific hook and filming rules based on the selected filming format.
 * Hook type varies significantly by format — talking-head hooks differ from text-on-screen hooks.
 */

/**
 * Builds the viral hook examples block to inject into the script generation prompt.
 * Grounds the AI in real proven hooks from SpyReels' database.
 */








/**
 * Scores a script's first line for skip-rate likelihood (1-10).
 * 10 = viewer almost certainly keeps watching. 1 = high skip risk.
 * This is a lightweight single-LLM call focused only on the hook.
 */

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

/**
 * Pull real viral hook examples from featured_reels and spied_reels
 * for a given DB niche slug and optional filming format.
 * Returns up to 6 hook lines with their pattern labels.
 */

/**
 * Background processor for Idea-to-Script.
 * Generates a full reel script from a user's topic idea using AI.
 */


/**
 * Brand Coach - score a Reel for viral potential.
 *
 * Pure function: receives whatever signal we have (caption + metrics,
 * and optionally transcript) and returns a structured analysis. The
 * caller (brandCoach.score mutation) handles caching and gating.
 */



/** First ~3.5s of speech from timed segments (Deepgram), for hook grading. */







/** Clip long LLM lines so the Brand Coach modal stays scannable. */



/** Infer or pause for filming format before script generation. Returns false if paused. */



/**
 * Rule-based pre-check before script generation (no separate validation LLM).
 * Remake goes straight to scripting; Idea to Script uses the same model here.
 */
