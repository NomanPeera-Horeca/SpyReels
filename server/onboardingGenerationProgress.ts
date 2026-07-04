import {
  buildOnboardingProgressSteps,
  type OnboardingAgentProgressStepId,
  personalizedOnboardingStepLabels,
} from "@shared/onboardingAgentProgress";
import type { AgentProgressStep } from "@shared/agentProgress";
import {
  completeAgentProgress,
  failAgentProgress,
  getAgentProgress,
  initAgentProgress,
  scheduleClearAgentProgress,
  setAgentProgressSteps,
} from "./agentProgressStore";

const FLOW = "onboarding" as const;

export function initOnboardingGenerationProgress(args: {
  userId: number;
  niche: string;
  audience: string;
}): void {
  const labels = personalizedOnboardingStepLabels({
    niche: args.niche,
    audience: args.audience,
  });
  initAgentProgress({
    flow: FLOW,
    userId: args.userId,
    steps: buildOnboardingProgressSteps("save_profile", undefined, labels),
  });
}

export function setOnboardingGenerationStep(
  userId: number,
  activeStepId: OnboardingAgentProgressStepId,
  completedThrough?: OnboardingAgentProgressStepId
): void {
  const current = getAgentProgress(FLOW, userId);
  if (!current || current.status !== "running") return;

  const labels = Object.fromEntries(
    current.steps.map((step) => [step.id, step.label])
  ) as Partial<Record<OnboardingAgentProgressStepId, string>>;

  setAgentProgressSteps({
    flow: FLOW,
    userId,
    steps: buildOnboardingProgressSteps(activeStepId, completedThrough, labels),
  });
}

export function completeOnboardingGenerationProgress(userId: number): void {
  const current = getAgentProgress(FLOW, userId);
  if (!current) return;

  const labels = Object.fromEntries(
    current.steps.map((step) => [step.id, step.label])
  ) as Partial<Record<OnboardingAgentProgressStepId, string>>;

  setAgentProgressSteps({
    flow: FLOW,
    userId,
    steps: buildOnboardingProgressSteps("production_notes", "production_notes", labels),
  });
  completeAgentProgress(FLOW, userId);
}

export function failOnboardingGenerationProgress(userId: number, errorMessage: string): void {
  if (!getAgentProgress(FLOW, userId)) {
    initAgentProgress({
      flow: FLOW,
      userId,
      steps: buildOnboardingProgressSteps("save_profile"),
    });
  }
  failAgentProgress({ flow: FLOW, userId, errorMessage });
}

export function clearOnboardingGenerationProgress(userId: number): void {
  scheduleClearAgentProgress(FLOW, userId);
}

export function getOnboardingGenerationProgress(userId: number) {
  return getAgentProgress(FLOW, userId);
}

export type { AgentProgressStep };
