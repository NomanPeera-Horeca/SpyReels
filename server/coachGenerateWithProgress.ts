import { TRPCError } from "@trpc/server";
import {
  buildCoachScriptProgressSteps,
  buildPasteConvertProgressSteps,
  personalizedCoachScriptStepLabels,
  type CoachScriptProgressStepId,
} from "@shared/coachAgentProgress";
import { formatAudienceSignalsForPrompt } from "@shared/audienceResearch";
import { markCreatorIdeaGroundTruth } from "@shared/coachIdeaGroundTruth";
import { formatSelectedCoachStrategy } from "@shared/coachStrategy";
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
import {
  formatResearchGroundingForPrompt,
  getResearchGrounding,
} from "./studioResearchGrounding";
import {
  developCoachStrategyDirections,
  selectCoachStrategy,
} from "./coachStrategyPlanner";

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
    const labels = {
      ...personalizedCoachScriptStepLabels({
        niche: profile.niche,
        audience: profile.targetAudience,
      }),
      find_viral: "Finding the strongest angle",
      hook_angle: "Finding the strongest angle",
    };
    initAgentProgress({
      flow: FLOW,
      userId: args.userId,
      steps: buildCoachScriptProgressSteps("audience_research", "read_profile", labels),
    });

    setCoachStep(args.userId, "research_grounding", "audience_research");
    const audienceSignalIds = args.audienceSignalIds ?? [];
    const researchStarted = Date.now();
    const [audienceResearchBlock, researchItems] = await Promise.all([
      (async () => {
        if (audienceSignalIds.length > 0) {
          const { getAudienceSignalsByIds } = await import("./audienceResearch/service");
          const attachedSignals = await getAudienceSignalsByIds(args.workspaceId, audienceSignalIds);
          return formatAudienceSignalsForPrompt(attachedSignals);
        }
        const { signals } = await getOrFetchAudienceSignals({
          workspaceId: args.workspaceId,
          nicheSlug: profile.nicheSlug,
          nicheLabel: profile.niche,
          targetAudience: profile.targetAudience,
        });
        return formatAudienceSignalsForPrompt(signals.slice(0, 5));
      })(),
      getResearchGrounding(args.description, profile.niche),
    ]);
    const researchGroundingBlock = formatResearchGroundingForPrompt(researchItems);
    console.info("[CoachLatency] research_parallel", { ms: Date.now() - researchStarted });

    setCoachStep(args.userId, "find_viral", "research_grounding");
    const plannerStarted = Date.now();
    const strategyDraft = await developCoachStrategyDirections({
      rawIdea: args.description,
      niche: profile.niche,
      targetAudience: profile.targetAudience,
      brandDescription: profile.brandDescription,
      clarifications: args.clarifications,
      audienceResearchBlock,
      researchGroundingBlock,
    });
    console.info("[CoachLatency] strategy_directions_ms", Date.now() - plannerStarted);

    setCoachStep(args.userId, "hook_angle", "find_viral");
    const selectorStarted = Date.now();
    const selectedStrategy = await selectCoachStrategy({
      rawIdea: args.description,
      draft: strategyDraft,
    });
    console.info("[CoachLatency] strategy_selector_ms", Date.now() - selectorStarted);
    const strategyBlock = formatSelectedCoachStrategy(strategyDraft, selectedStrategy);

    const script = await generateCoachScriptForWorkspace({
      userId: args.userId,
      workspaceId: args.workspaceId,
      openId: args.openId,
      description: markCreatorIdeaGroundTruth(args.description),
      rawCreatorIdea: args.description,
      selectedStrategyBlock: strategyBlock,
      clarifications: args.clarifications,
      planCardId: args.planCardId,
      audienceSignalIds,
      skipUsageCheck: args.skipUsageCheck,
      profileOverride: profile,
      audienceResearchBlock,
      researchGroundingBlock,
      onPhase: (phase) => {
        if (phase === "write_script") {
          setCoachStep(args.userId, "write_script", "hook_angle");
        } else if (phase === "quality_check") {
          setCoachStep(args.userId, "quality_check", "write_script");
        } else if (phase === "production_notes") {
          setCoachStep(args.userId, "production_notes", "quality_check");
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
    steps: buildPasteConvertProgressSteps("read_profile"),
  });

  try {
    const profile = await getCreatorCoachProfile(args.userId);
    const labels = {
      ...personalizedCoachScriptStepLabels({
        niche: profile.niche,
        audience: profile.targetAudience,
      }),
      write_script: "Keeping your pasted words in Studio layout",
      production_notes:
        "Adding film-ready production notes (visual hook, on-screen text, B-roll, audio)",
    };
    setPasteConvertStep(args.userId, "read_profile", undefined, labels);
    setPasteConvertStep(args.userId, "write_script", "read_profile", labels);

    const script = await convertRoughScriptForWorkspace({
      userId: args.userId,
      workspaceId: args.workspaceId,
      openId: args.openId,
      roughScript: args.roughScript,
      workingTitle: args.workingTitle,
      skipUsageCheck: args.skipUsageCheck,
      onPhase: (phase) => {
        if (phase === "write_script") {
          setPasteConvertStep(args.userId, "write_script", "read_profile", labels);
        } else if (phase === "production_notes") {
          setPasteConvertStep(args.userId, "production_notes", "write_script", labels);
        }
      },
    });

    setPasteConvertStep(args.userId, "production_notes", "production_notes", labels);
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

function setPasteConvertStep(
  userId: number,
  activeStepId: CoachScriptProgressStepId,
  completedThrough?: CoachScriptProgressStepId,
  labels?: Partial<Record<CoachScriptProgressStepId, string>>
) {
  const current = getAgentProgress(FLOW, userId);
  if (!current || current.status !== "running") return;
  const mergedLabels = {
    ...Object.fromEntries(current.steps.map((step) => [step.id, step.label])),
    ...labels,
  } as Partial<Record<CoachScriptProgressStepId, string>>;
  setAgentProgressSteps({
    flow: FLOW,
    userId,
    steps: buildPasteConvertProgressSteps(activeStepId, completedThrough, mergedLabels),
  });
}
