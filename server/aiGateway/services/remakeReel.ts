import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import {
  buildRecreateDefaultTopicPrompt,
  buildRecreateTopicPrompt,
} from "@shared/recreateAnglePrompt";
import { getOrFetchAudienceSignals } from "../../audienceResearch/service";
import { getOnboardingState } from "../../db";
import { getPersonalWorkspaceId } from "../../personalWorkspace";
import { getCreatorCoachProfile } from "../../planCoachProfile";
import { generateRemakeContent } from "../../recreate/generateRemakeContent";
import { analyzeRemakeStructure } from "../../recreate/remakeStructure";
import {
  formatResearchGroundingForPrompt,
  getResearchGrounding,
} from "../../studioResearchGrounding";
import { getPlanLimits } from "../../stripe/products";
import {
  checkUsageLimit,
  decrementUsage,
  getUserSubscription,
  incrementUsage,
} from "../../stripe/stripe-service";
import { isFirstRemakeUsageBypassEligible } from "../../routers/_shared";
import { AiGatewayError } from "../errors";
import type { AiGatewayActor } from "../types";
import { transcribeReelUrl } from "./reelResearch";
import { resolveRemakeIntent } from "./remakeIntent";

export type RemakeMode = "custom" | "same_topic" | "niche";

async function buildTopic(input: {
  actor: AiGatewayActor;
  mode: RemakeMode;
  angle?: string;
}): Promise<{
  topic: string;
  displayMode: RemakeMode;
  researchIdea: string | null;
  researchNiche: string;
  trustedTexts: string[];
}> {
  if (input.mode === "same_topic") {
    return {
      topic: "SAME_TOPIC",
      displayMode: input.mode,
      researchIdea: null,
      researchNiche: "business",
      trustedTexts: [],
    };
  }

  if (input.mode === "custom") {
    const angle = input.angle?.trim() ?? "";
    if (!angle) {
      throw new AiGatewayError({
        code: "INVALID_INPUT",
        message:
          "Use my idea requires an angle. Tell SpyReels what you want the new Reel to be about.",
        retryable: false,
      });
    }

    const [state, profile] = await Promise.all([
      getOnboardingState(input.actor.userId).catch(() => null),
      getCreatorCoachProfile(input.actor.userId).catch(() => null),
    ]);
    return {
      topic: buildRecreateTopicPrompt({
        angle,
        targetAudience: state?.targetAudience ?? null,
        businessDescription: state?.businessDescription ?? null,
      }),
      displayMode: input.mode,
      researchIdea: angle,
      researchNiche: profile?.niche ?? "business",
      trustedTexts: [
        angle,
        state?.targetAudience ?? "",
        state?.businessDescription ?? "",
      ].filter(Boolean),
    };
  }

  let profile;
  try {
    profile = await getCreatorCoachProfile(input.actor.userId);
  } catch (error) {
    throw new AiGatewayError({
      code: "INVALID_INPUT",
      message:
        "Adapt to my niche needs your SpyReels creator profile. Complete your niche and audience profile in SpyReels first.",
      retryable: false,
      cause: error,
    });
  }

  const workspaceId = await getPersonalWorkspaceId(input.actor.userId);
  const { signals } = await getOrFetchAudienceSignals({
    workspaceId,
    nicheSlug: profile.nicheSlug,
    nicheLabel: profile.niche,
    targetAudience: profile.targetAudience,
  });

  const topSignals = signals.slice(0, 5);
  const audienceResearchBlock = formatAudienceSignalsForPrompt(topSignals);
  const researchIdea = [
    profile.niche,
    profile.targetAudience,
    ...topSignals.slice(0, 3).map((signal) => signal.title),
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    topic: buildRecreateDefaultTopicPrompt({
      niche: profile.niche,
      targetAudience: profile.targetAudience,
      businessDescription: profile.brandDescription,
      audienceResearchBlock,
    }),
    displayMode: input.mode,
    researchIdea,
    researchNiche: profile.niche,
    trustedTexts: [
      profile.targetAudience,
      profile.brandDescription ?? "",
      ...topSignals.flatMap((signal) => [
        signal.title,
        signal.snippet ?? "",
        signal.sourceUrl,
      ]),
    ].filter(Boolean),
  };
}

export async function remakeReelUrl(input: {
  actor: AiGatewayActor;
  url: string;
  instruction: string;
  gradeLevel?: "auto" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
}) {
  const resolvedIntent = resolveRemakeIntent(input.instruction);
  if (resolvedIntent.status === "clarification_required") {
    throw new AiGatewayError({
      code: "CLARIFICATION_REQUIRED",
      message:
        "The remake direction is ambiguous. Ask the user one short natural clarification: do they want to keep the same topic, adapt it to their niche/profile, or use a different idea/angle? Do not start transcription or consume remake usage until they answer.",
      retryable: false,
    });
  }
  const state = await getOnboardingState(input.actor.userId).catch(() => null);
  const bypassRecreateLimit = await isFirstRemakeUsageBypassEligible(
    input.actor.userId,
    Boolean(state?.hasCompletedFirstSpy),
    "recreateCount"
  );

  if (!bypassRecreateLimit) {
    const usage = await checkUsageLimit(
      input.actor.userId,
      "recreateCount",
      input.actor.openId ?? undefined,
      { email: input.actor.email, role: input.actor.role }
    );
    if (!usage.allowed) {
      throw new AiGatewayError({
        code: "USAGE_LIMIT_REACHED",
        message: `Your current SpyReels plan has reached its remake limit (${usage.used}/${usage.limit}).`,
        retryable: false,
        upgradePlan: usage.planRequired,
      });
    }
  }

  const preparationStarted = Date.now();
  const [topicResult, subscription, transcriptResult] = await Promise.all([
    buildTopic({
      actor: input.actor,
      mode: resolvedIntent.mode,
      angle: resolvedIntent.angle,
    }),
    getUserSubscription(input.actor.userId),
    transcribeReelUrl({
      actor: input.actor,
      url: input.url,
    }),
  ]);
  console.info("[RemakeLatency] preparation_parallel_ms", Date.now() - preparationStarted, {
    mode: resolvedIntent.mode,
    transcriptCacheHit: transcriptResult.cache.hit,
  });

  const researchIdea =
    topicResult.researchIdea ||
    transcriptResult.reel.caption ||
    transcriptResult.transcript.slice(0, 300);

  const groundingStarted = Date.now();
  const [researchItems, structureResult] = await Promise.all([
    getResearchGrounding(researchIdea, topicResult.researchNiche),
    analyzeRemakeStructure({
      originalTranscript: transcriptResult.transcript,
      caption: transcriptResult.reel.caption,
      sourceKey: transcriptResult.reel.shortcode,
      platformLabel: "Instagram Reel",
    }),
  ]);
  console.info("[RemakeLatency] grounding_parallel_ms", Date.now() - groundingStarted, {
    researchCount: researchItems.length,
    structureCacheHit: structureResult.cacheHit,
  });

  const researchGroundingBlock = formatResearchGroundingForPrompt(researchItems);

  const limits = getPlanLimits(subscription.plan);
  const addCues = Boolean(limits.hasAiCues);
  const gradeLevel = input.gradeLevel ?? "auto";

  await incrementUsage(input.actor.userId, "recreateCount");

  try {
    let generated;
    try {
      generated = await generateRemakeContent({
        originalTranscript: transcriptResult.transcript,
        caption: transcriptResult.reel.caption,
        reel: transcriptResult.reel,
        sourceKey: transcriptResult.reel.shortcode,
        topic: topicResult.topic,
        gradeLevel,
        addCues,
        researchGroundingBlock,
        trustedResearchTexts: [
          ...topicResult.trustedTexts,
          ...researchItems.flatMap((item) => [
            item.title,
            item.snippet ?? "",
            item.sourceUrl,
          ]),
        ],
        platformLabel: "Instagram Reel",
        viralStructureOverride: structureResult.structure,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("safely grounded remake")
      ) {
        throw new AiGatewayError({
          code: "UPSTREAM_UNAVAILABLE",
          message: error.message,
          retryable: true,
          cause: error,
        });
      }
      throw error;
    }

    return {
      source: {
        reelUrl: transcriptResult.reel.reelUrl,
        shortcode: transcriptResult.reel.shortcode,
        creator: transcriptResult.reel.creator,
        metrics: transcriptResult.reel.metrics,
        postedAt: transcriptResult.reel.postedAt,
        durationSec: transcriptResult.reel.durationSec,
      },
      remake: {
        mode: topicResult.displayMode,
        angle:
          resolvedIntent.mode === "custom"
            ? resolvedIntent.angle?.trim() || null
            : null,
        gradeLevel,
        deliveryCuesIncluded: addCues,
        generatedScript: generated.generatedScript,
        structure: {
          hookType:
            typeof (generated.viralStructure.hook as any)?.type === "string"
              ? (generated.viralStructure.hook as any).type
              : null,
          pacing:
            typeof (generated.viralStructure.body as any)?.pacing === "string"
              ? (generated.viralStructure.body as any).pacing
              : null,
          transitionType:
            typeof (generated.viralStructure.transition as any)?.type === "string"
              ? (generated.viralStructure.transition as any).type
              : null,
          ctaType:
            typeof (generated.viralStructure.cta as any)?.type === "string"
              ? (generated.viralStructure.cta as any).type
              : null,
          tone:
            typeof (generated.viralStructure as any)?.overallTone === "string"
              ? (generated.viralStructure as any).overallTone
              : null,
        },
        readability: {
          gradeLevel:
            typeof (generated.readabilityAnalysis as any)?.gradeLevel === "number"
              ? (generated.readabilityAnalysis as any).gradeLevel
              : null,
          readingEase:
            typeof (generated.readabilityAnalysis as any)?.readingEase === "number"
              ? (generated.readabilityAnalysis as any).readingEase
              : null,
          wordCount:
            typeof (generated.readabilityAnalysis as any)?.wordCount === "number"
              ? (generated.readabilityAnalysis as any).wordCount
              : null,
        },
      },
      transcriptCache: transcriptResult.cache,
      grounding: {
        researchSourceCount: researchItems.length,
        structureCacheHit: structureResult.cacheHit,
        factRepairApplied: generated.factIntegrity.repaired,
      },
      savedToSpyReels: false,
      note:
        "This remake was generated with the same SpyReels remake engine used in the app. It was returned to the AI host and was not silently saved or published.",
    };
  } catch (error) {
    await decrementUsage(input.actor.userId, "recreateCount").catch(() => {});
    throw error;
  }
}
