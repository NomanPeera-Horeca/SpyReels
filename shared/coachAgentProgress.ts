import { buildProgressSteps, type AgentProgressStep } from "./agentProgress";

export type CoachScriptProgressStepId =
  | "read_profile"
  | "audience_research"
  | "research_grounding"
  | "find_viral"
  | "hook_angle"
  | "write_script"
  | "quality_check"
  | "production_notes";

const STEP_ORDER: CoachScriptProgressStepId[] = [
  "read_profile",
  "audience_research",
  "research_grounding",
  "find_viral",
  "hook_angle",
  "write_script",
  "quality_check",
  "production_notes",
];

/** Paste Convert: keep spoken words; only generate missing production fields. */
const PASTE_CONVERT_STEP_ORDER: CoachScriptProgressStepId[] = [
  "read_profile",
  "write_script",
  "production_notes",
];

export function defaultCoachScriptStepLabel(stepId: CoachScriptProgressStepId): string {
  switch (stepId) {
    case "read_profile":
    case "audience_research":
    case "research_grounding":
      return "Understanding your idea";
    case "find_viral":
    case "hook_angle":
      return "Finding the strongest angle";
    case "write_script":
      return "Writing your script";
    case "quality_check":
    case "production_notes":
      return "Polishing the final version";
    default:
      return "Working on your script";
  }
}

const COACH_PROGRESS_DISPLAY_GROUPS: Array<{
  id: string;
  label: string;
  stepIds: CoachScriptProgressStepId[];
}> = [
  {
    id: "understand",
    label: "Understanding your idea",
    stepIds: ["read_profile", "audience_research", "research_grounding"],
  },
  {
    id: "angle",
    label: "Finding the strongest angle",
    stepIds: ["find_viral", "hook_angle"],
  },
  {
    id: "write",
    label: "Writing your script",
    stepIds: ["write_script"],
  },
  {
    id: "polish",
    label: "Polishing the final version",
    stepIds: ["quality_check", "production_notes"],
  },
];

export function collapseCoachProgressForDisplay(steps: AgentProgressStep[]): AgentProgressStep[] {
  const ids = new Set(steps.map((step) => step.id));
  const isFullPipeline = STEP_ORDER.every((id) => ids.has(id));
  if (!isFullPipeline) return steps;

  return COACH_PROGRESS_DISPLAY_GROUPS.map((group) => {
    const members = group.stepIds
      .map((id) => steps.find((step) => step.id === id))
      .filter((step): step is AgentProgressStep => Boolean(step));
    let status: AgentProgressStep["status"] = "pending";
    if (members.some((step) => step.status === "active")) {
      status = "active";
    } else if (members.length > 0 && members.every((step) => step.status === "done")) {
      status = "done";
    } else if (members.some((step) => step.status === "done")) {
      status = "active";
    }
    return { id: group.id, label: group.label, status };
  });
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

export function buildPasteConvertProgressSteps(
  activeStepId: CoachScriptProgressStepId,
  completedThrough?: CoachScriptProgressStepId,
  labels?: Partial<Record<CoachScriptProgressStepId, string>>
): AgentProgressStep[] {
  return buildProgressSteps(
    PASTE_CONVERT_STEP_ORDER,
    activeStepId,
    completedThrough,
    labels,
    (id) => {
      if (id === "write_script") return "Keeping your pasted words in Studio layout";
      if (id === "production_notes") {
        return "Adding film-ready production notes (visual hook, on-screen text, B-roll, audio)";
      }
      return defaultCoachScriptStepLabel(id);
    }
  );
}

export function personalizedCoachScriptStepLabels(_args: {
  niche: string;
  audience: string;
}): Partial<Record<CoachScriptProgressStepId, string>> {
  return {
    read_profile: "Understanding your idea",
    audience_research: "Understanding your idea",
    research_grounding: "Understanding your idea",
    find_viral: "Finding the strongest angle",
    hook_angle: "Finding the strongest angle",
    write_script: "Writing your script",
    quality_check: "Polishing the final version",
    production_notes: "Polishing the final version",
  };
}

export const COACH_AGENT_FOOTER = "Usually about a minute.";

export const PASTE_CONVERT_FOOTER =
  "Your spoken lines stay as pasted. We only fill filming directions Studio needs.";
