import { buildProgressSteps, type AgentProgressStep, type AgentProgressStepStatus } from "./agentProgress";

export type OnboardingAgentProgressStepId =
  | "save_profile"
  | "find_viral"
  | "audience_research"
  | "hook_angle"
  | "write_script"
  | "production_notes";

export type { AgentProgressStep, AgentProgressStepStatus };

const STEP_ORDER: OnboardingAgentProgressStepId[] = [
  "save_profile",
  "find_viral",
  "audience_research",
  "hook_angle",
  "write_script",
  "production_notes",
];

export function buildOnboardingProgressSteps(
  activeStepId: OnboardingAgentProgressStepId,
  completedThrough?: OnboardingAgentProgressStepId,
  labels?: Partial<Record<OnboardingAgentProgressStepId, string>>
): AgentProgressStep[] {
  return buildProgressSteps(
    STEP_ORDER,
    activeStepId,
    completedThrough,
    labels,
    defaultOnboardingStepLabel
  );
}

export function defaultOnboardingStepLabel(stepId: OnboardingAgentProgressStepId): string {
  switch (stepId) {
    case "save_profile":
      return "Saving your niche and audience";
    case "find_viral":
      return "Finding what's going viral in your niche";
    case "audience_research":
      return "Researching your audience on Reddit and Quora";
    case "hook_angle":
      return "Picking a scroll-stopping hook angle";
    case "write_script":
      return "Writing your viral script";
    case "production_notes":
      return "Adding film-ready production notes";
    default:
      return "Working on your script";
  }
}

export function personalizedOnboardingStepLabels(args: {
  niche: string;
  audience: string;
}): Partial<Record<OnboardingAgentProgressStepId, string>> {
  const nicheShort = args.niche.trim().slice(0, 48) || "your niche";
  const audienceShort = args.audience.trim().slice(0, 48) || "your audience";
  return {
    save_profile: `Saving ${nicheShort} and ${audienceShort}`,
    find_viral: `Finding what's going viral in ${nicheShort}`,
    audience_research: `Researching ${audienceShort} on Reddit and Quora`,
    hook_angle: "Picking a scroll-stopping hook angle",
    write_script: "Writing your viral script",
    production_notes: "Adding film-ready production notes (Instagram audio, B-roll, how to film)",
  };
}

export const ONBOARDING_AGENT_FOOTER =
  "You won't need to do this research manually again.";
