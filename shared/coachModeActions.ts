import { buildIdeaStarterChips, type StarterPromptContext } from "./ideaStarterPrompts";
import {
  buildPlanPrefill,
  type CoachCapabilityId,
} from "./studioCoachUi";

export const COACH_MODE_PANEL_HEADERS: Record<CoachCapabilityId, string> = {
  write_script: "Start from scratch",
  from_plan: "Pick a 30-day plan idea",
  refine_script: "Refine a recent script",
  hook_ideas: "New hooks for a recent script",
};

export type CoachModeAction = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  promptText: string;
  capability: CoachCapabilityId;
  planCardId?: number;
  scriptId?: number;
};

type PlanCardInput = {
  id: number;
  day: number;
  title: string;
  hook: string;
  angle: string;
  status: string;
};

type RecentScriptInput = {
  id: number;
  title: string;
};

const WRITE_ICONS = ["✍️", "💡", "📋"] as const;
const WRITE_SUBTITLES = [
  "AI types the prompt in the box. Hit Enter when ready.",
  "Coach drafts your angle in the box first.",
  "Drop a half-written idea and let Coach structure it.",
] as const;

const REFINE_INSTRUCTIONS = [
  "Make the hook more contrarian and tighten the CTA.",
  "Shorten this to under 35 seconds without losing the main insight.",
  "Punch up the hook only. Keep the rest of the script the same tone.",
] as const;

export function buildCoachModeActions(args: {
  capability: CoachCapabilityId;
  nicheContext?: StarterPromptContext | null;
  planCards?: PlanCardInput[];
  recentScripts?: RecentScriptInput[];
}): CoachModeAction[] {
  const { capability, nicheContext, planCards = [], recentScripts = [] } = args;

  if (capability === "write_script") {
    return buildIdeaStarterChips(nicheContext).map((chip, index) => ({
      id: `write-${index}`,
      icon: WRITE_ICONS[index] ?? "✍️",
      title: chip.label,
      subtitle: WRITE_SUBTITLES[index] ?? WRITE_SUBTITLES[0],
      promptText: chip.value,
      capability: "write_script",
    }));
  }

  if (capability === "from_plan") {
    const approved = planCards.filter((card) => card.status === "approved");
    const source = approved.length > 0 ? approved : planCards;
    return source.slice(0, 8).map((card) => ({
      id: `plan-${card.id}`,
      icon: String(card.day),
      title: `Day ${card.day}: ${card.title}`,
      subtitle: "AI fills the box with your plan details.",
      promptText: buildPlanPrefill(card),
      capability: "from_plan",
      planCardId: card.id,
    }));
  }

  if (capability === "refine_script") {
    return recentScripts.slice(0, 5).map((script, index) => {
      const instruction =
        REFINE_INSTRUCTIONS[index] ??
        "Improve clarity and make the hook stronger.";
      return {
        id: `refine-${script.id}`,
        icon: "📄",
        title: script.title,
        subtitle: instruction,
        promptText: `Refine my script "${script.title}": ${instruction}`,
        capability: "refine_script",
        scriptId: script.id,
      };
    });
  }

  return recentScripts.slice(0, 5).map((script) => ({
    id: `hooks-${script.id}`,
    icon: "🪝",
    title: `Generate hooks for: ${script.title}`,
    subtitle: "3 alternative opening lines for this script.",
    promptText: `Generate 3 new opening hooks for my script: "${script.title}"`,
    capability: "hook_ideas",
    scriptId: script.id,
  }));
}
