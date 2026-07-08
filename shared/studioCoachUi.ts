/** User-facing labels for AI Coach script sections (never show HEIT in UI). */
export const VIRAL_SCRIPT_SECTION_LABELS = {
  hook: "Hook",
  problem: "Problem setup",
  story: "Story or example",
  takeaway: "Key takeaway",
  cta: "Call to action",
} as const;

export const HOOK_VARIATION_LABELS = {
  context: "Direct promise",
  contrarian: "Bold claim",
  intrigue: "Curiosity hook",
} as const;

export type CoachCapabilityId =
  | "write_script"
  | "from_plan"
  | "refine_script"
  | "hook_ideas";

export type CoachCapability = {
  id: CoachCapabilityId;
  label: string;
  hint: string;
};

export const COACH_CAPABILITIES: CoachCapability[] = [
  {
    id: "write_script",
    label: "Write new script",
    hint: "Turn a raw idea into a ready-to-film Reel script",
  },
  {
    id: "from_plan",
    label: "From 30-day plan",
    hint: "Use an approved content plan idea as your starting point",
  },
  {
    id: "refine_script",
    label: "Refine script",
    hint: "Open a recent script and improve it with AI",
  },
  {
    id: "hook_ideas",
    label: "New hook ideas",
    hint: "Generate alternative opening lines for a recent script",
  },
];

export const COACH_EXAMPLE_PROMPTS = [
  "Turn my client testimonial into a viral Reel script",
  "Write a script about why counting calories fails most people",
  "I got behind the scenes at a top kitchen. Make this into a Reel script.",
  "My client doubled revenue in 90 days. Write a viral script about the one change.",
];

export type CoachSuggestion = {
  prompt: string;
  planCardId?: number;
};

export function buildPlanPrefill(card: {
  day: number;
  title: string;
  hook: string;
  angle: string;
}): string {
  return `Day ${card.day} plan idea: ${card.title}\n\n${card.angle}\n\nHook idea: "${card.hook}"`;
}

/**
 * User-facing Spark prefill for the AI Coach composer.
 * Soft-sell / ground-truth instructions stay on the server via planCardId.
 */
export function buildSparkPrefill(card: {
  title: string;
  hook: string;
  angle: string;
  userRawNote?: string | null;
}): string {
  const title = card.title.trim();
  const note = (card.userRawNote ?? card.angle).trim();
  if (title && note && note !== title) {
    return `${title}\n\n${note}`;
  }
  return title || note;
}

export type StudioPrefillMeta = {
  planCardId?: number;
  planCardTitle?: string;
  planCardDay?: number;
  audienceSignalId?: number;
  audienceSignalTitle?: string;
  audienceSignalSource?: "reddit" | "quora" | "web";
};

export const STUDIO_PREFILL_META_KEY = "studio_prefill_meta";

export function parseStudioPrefillMeta(raw: string | null): StudioPrefillMeta | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as StudioPrefillMeta;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
