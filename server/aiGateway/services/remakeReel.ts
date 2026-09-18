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
}): Promise<{ topic: string; displayMode: RemakeMode }> {
  if (input.mode === "same_topic") {
    return { topic: "SAME_TOPIC", displayMode: input.mode };
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

    const state = await getOnboardingState(input.actor.userId).catch(() => null);
    return {
      topic: buildRecreateTopicPrompt({
        angle,
        targetAudience: state?.targetAudience ?? null,
        businessDescription: state?.businessDescription ?? null,
      }),
      displayMode: input.mode,
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

  return {
    topic: buildRecreateDefaultTopicPrompt({
      niche: profile.niche,
      targetAudience: profile.targetAudience,
      businessDescription: profile.brandDescription,
      audienceResearchBlock: formatAudienceSignalsForPrompt(signals.slice(0, 5)),
    }),
    displayMode: input.mode,
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

  const [topicResult, subscription] = await Promise.all([
    buildTopic({
      actor: input.actor,
      mode: resolvedIntent.mode,
      angle: resolvedIntent.angle,
    }),
    getUserSubscription(input.actor.userId),
  ]);

  const transcriptResult = await transcribeReelUrl({
    actor: input.actor,
    url: input.url,
  });

  const limits = getPlanLimits(subscription.plan);
  const addCues = Boolean(limits.hasAiCues);
  const gradeLevel = input.gradeLevel ?? "auto";

  await incrementUsage(input.actor.userId, "recreateCount");

  try {
    const generated = await generateRemakeContent({
      originalTranscript: transcriptResult.transcript,
      caption: transcriptResult.reel.caption,
      reel: transcriptResult.reel,
      topic: topicResult.topic,
      gradeLevel,
      addCues,
      platformLabel: "Instagram Reel",
    });

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
        viralStructure: generated.viralStructure,
        readabilityAnalysis: generated.readabilityAnalysis,
      },
      transcriptCache: transcriptResult.cache,
      savedToSpyReels: false,
      note:
        "This remake was generated with the same SpyReels remake engine used in the app. It was returned to the AI host and was not silently saved or published.",
    };
  } catch (error) {
    await decrementUsage(input.actor.userId, "recreateCount").catch(() => {});
    throw error;
  }
}
