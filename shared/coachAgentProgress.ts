import { buildProgressSteps, type AgentProgressStep } from "./agentProgress";

export type CoachScriptProgressStepId =
  | "read_profile"
  | "audience_research"
  | "find_viral"
  | "hook_angle"
  | "write_script"
  | "production_notes";

const STEP_ORDER: CoachScriptProgressStepId[] = [
  "read_profile",
  "audience_research",
  "find_viral",
  "hook_angle",
  "write_script",
  "production_notes",
];

export function defaultCoachScriptStepLabel(stepId: CoachScriptProgressStepId): string {
  switch (stepId) {
    case "read_profile":
      return "Reading your niche and audience profile";
    case "audience_research":
      return "Researching your audience on Reddit and Quora";
    case "find_viral":
      return "Finding what's going viral in your niche";
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

export function buildCoachScriptProgressSteps(
  activeStepId: CoachScriptProgressStepId,
  completedThrough?: CoachScriptProgressStepId,
  labels?: Partial<Record<CoachScriptProgressStepId, string>>
): AgentProgressStep[] {
  return buildProgressSteps(
    STEP_ORDER,
    activeStepId,
    completedThrough,
    labels,
    defaultCoachScriptStepLabel
  );
}

export function personalizedCoachScriptStepLabels(args: {
  niche: string;
  audience: string;
}): Partial<Record<CoachScriptProgressStepId, string>> {
  const nicheShort = args.niche.trim().slice(0, 48) || "your niche";
  const audienceShort = args.audience.trim().slice(0, 48) || "your audience";
  return {
    read_profile: `Reading ${nicheShort} and ${audienceShort}`,
    audience_research: `Researching ${audienceShort} on Reddit and Quora`,
    find_viral: `Finding what's going viral in ${nicheShort}`,
    hook_angle: "Picking a scroll-stopping hook angle",
    write_script: "Writing your viral script",
    production_notes:
      "Adding film-ready production notes (Instagram audio, B-roll, how to film)",
  };
}

export const COACH_AGENT_FOOTER =
  "You won't need to do this research manually again.";
