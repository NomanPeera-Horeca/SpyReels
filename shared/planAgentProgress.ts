import { buildProgressSteps, type AgentProgressStep } from "./agentProgress";

export type PlanProgressStepId =
  | "read_profile"
  | "audience_research"
  | "ideas_week1"
  | "ideas_week2"
  | "ideas_week3"
  | "finalize_board";

const STEP_ORDER: PlanProgressStepId[] = [
  "read_profile",
  "audience_research",
  "ideas_week1",
  "ideas_week2",
  "ideas_week3",
  "finalize_board",
];

export function defaultPlanStepLabel(stepId: PlanProgressStepId): string {
  switch (stepId) {
    case "read_profile":
      return "Reading your niche and audience profile";
    case "audience_research":
      return "Scanning Reddit and Quora for real audience questions";
    case "ideas_week1":
      return "Building content ideas for days 1 to 10";
    case "ideas_week2":
      return "Building content ideas for days 11 to 20";
    case "ideas_week3":
      return "Building content ideas for days 21 to 30";
    case "finalize_board":
      return "Assigning formats, hooks, and filming locations";
    default:
      return "Building your 30-day plan";
  }
}

export function buildPlanProgressSteps(
  activeStepId: PlanProgressStepId,
  completedThrough?: PlanProgressStepId,
  labels?: Partial<Record<PlanProgressStepId, string>>
): AgentProgressStep[] {
  return buildProgressSteps(
    STEP_ORDER,
    activeStepId,
    completedThrough,
    labels,
    defaultPlanStepLabel
  );
}

export const PLAN_AGENT_FOOTER =
  "Real audience questions from Reddit and Quora shape every idea on your board.";
