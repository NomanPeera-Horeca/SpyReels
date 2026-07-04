import { TRPCError } from "@trpc/server";
import {
  buildCoachScriptProgressSteps,
  personalizedCoachScriptStepLabels,
  type CoachScriptProgressStepId,
} from "@shared/coachAgentProgress";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import { getOrFetchAudienceSignals } from "./audienceResearch/service";
import {
  completeAgentProgress,
  failAgentProgress,
  getAgentProgress,
  initAgentProgress,
  scheduleClearAgentProgress,
  setAgentProgressSteps,
} from "./agentProgressStore";
import { getCreatorCoachProfile } from "./planCoachProfile";
import { generateCoachScriptForWorkspace, convertRoughScriptForWorkspace, type GeneratedCoachScript } from "./studioGenerateScript";

const FLOW = "coach" as const;

function setCoachStep(
  userId: number,
  activeStepId: CoachScriptProgressStepId,
  completedThrough?: CoachScriptProgressStepId
) {
  const current = getAgentProgress(FLOW, userId);
  if (!current || current.status !== "running") return;
  const labels = Object.fromEntries(current.steps.map((step) => [step.id, step.label])) as Partial<
    Record<CoachScriptProgressStepId, string>
  >;
  setAgentProgressSteps({
    flow: FLOW,
    userId,
    steps: buildCoachScriptProgressSteps(activeStepId, completedThrough, labels),
  });
}

export function getCoachGenerationProgress(userId: number) {
  return getAgentProgress(FLOW, userId);
}

export async function generateCoachScriptWithProgress(args: {
  userId: number;
  workspaceId: string;
  openId: string;
  description: string;
  clarifications?: Array<{ question: string; answer: string }>;
  planCardId?: number;
  audienceSignalIds?: number[];
  skipUsageCheck?: boolean;
}): Promise<GeneratedCoachScript> {
  initAgentProgress({
    flow: FLOW,
    userId: args.userId,
    steps: buildCoachScriptProgressSteps("read_profile"),
  });

  try {
    setCoachStep(args.userId, "read_profile");
    const profile = await getCreatorCoachProfile(args.userId);
    const labels = personalizedCoachScriptStepLabels({
      niche: profile.niche,
      audience: profile.targetAudience,
    });
    initAgentProgress({
      flow: FLOW,
      userId: args.userId,
      steps: buildCoachScriptProgressSteps("audience_research", "read_profile", labels),
    });

    let audienceResearchBlock = "";
    const audienceSignalIds = args.audienceSignalIds ?? [];
    if (audienceSignalIds.length > 0) {
      const { getAudienceSignalsByIds } = await import("./audienceResearch/service");
      const attachedSignals = await getAudienceSignalsByIds(args.workspaceId, audienceSignalIds);
      audienceResearchBlock = formatAudienceSignalsForPrompt(attachedSignals);
    } else {
      const { signals } = await getOrFetchAudienceSignals({
        workspaceId: args.workspaceId,
        nicheSlug: profile.nicheSlug,
        nicheLabel: profile.niche,
        targetAudience: profile.targetAudience,
      });
      audienceResearchBlock = formatAudienceSignalsForPrompt(signals.slice(0, 5));
    }

    setCoachStep(args.userId, "find_viral", "audience_research");
    setCoachStep(args.userId, "hook_angle", "find_viral");

    const script = await generateCoachScriptForWorkspace({
      userId: args.userId,
      workspaceId: args.workspaceId,
      openId: args.openId,
      description: args.description,
      clarifications: args.clarifications,
      planCardId: args.planCardId,
      audienceSignalIds,
      skipUsageCheck: args.skipUsageCheck,
      profileOverride: profile,
      audienceResearchBlock,
      onPhase: (phase) => {
        if (phase === "write_script") {
          setCoachStep(args.userId, "write_script", "hook_angle");
        } else if (phase === "production_notes") {
          setCoachStep(args.userId, "production_notes", "write_script");
        }
      },
    });

    setCoachStep(args.userId, "production_notes", "production_notes");
    completeAgentProgress(FLOW, args.userId);
    return script;
  } catch (err) {
    const message =
      err instanceof TRPCError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
    failAgentProgress({ flow: FLOW, userId: args.userId, errorMessage: message });
    throw err;
  } finally {
    scheduleClearAgentProgress(FLOW, args.userId);
  }
}

export async function convertRoughScriptWithProgress(args: {
  userId: number;
  workspaceId: string;
  openId: string;
  roughScript: string;
  workingTitle?: string;
  skipUsageCheck?: boolean;
}): Promise<GeneratedCoachScript> {
  initAgentProgress({
    flow: FLOW,
    userId: args.userId,
    steps: buildCoachScriptProgressSteps("read_profile"),
  });

  try {
    setCoachStep(args.userId, "read_profile");
    const profile = await getCreatorCoachProfile(args.userId);
    const labels = personalizedCoachScriptStepLabels({
      niche: profile.niche,
      audience: profile.targetAudience,
    });
    initAgentProgress({
      flow: FLOW,
      userId: args.userId,
      steps: buildCoachScriptProgressSteps("audience_research", "read_profile", labels),
    });

    setCoachStep(args.userId, "find_viral", "audience_research");
    setCoachStep(args.userId, "hook_angle", "find_viral");

    const script = await convertRoughScriptForWorkspace({
      userId: args.userId,
      workspaceId: args.workspaceId,
      openId: args.openId,
      roughScript: args.roughScript,
      workingTitle: args.workingTitle,
      skipUsageCheck: args.skipUsageCheck,
      onPhase: (phase) => {
        if (phase === "write_script") {
          setCoachStep(args.userId, "write_script", "hook_angle");
        } else if (phase === "production_notes") {
          setCoachStep(args.userId, "production_notes", "write_script");
        }
      },
    });

    setCoachStep(args.userId, "production_notes", "production_notes");
    completeAgentProgress(FLOW, args.userId);
    return script;
  } catch (err) {
    const message =
      err instanceof TRPCError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
    failAgentProgress({ flow: FLOW, userId: args.userId, errorMessage: message });
    throw err;
  } finally {
    scheduleClearAgentProgress(FLOW, args.userId);
  }
}
