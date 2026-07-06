export type CoachHookType =
  | "specific_outcome"
  | "pov"
  | "contrarian"
  | "question"
  | "pain_point"
  | "story"
  | "shock_data"
  | "show_end_first"
  | "curiosity_gap";

export const COACH_HOOK_TYPES = [
  "specific_outcome",
  "pov",
  "contrarian",
  "question",
  "pain_point",
  "story",
  "shock_data",
  "show_end_first",
  "curiosity_gap",
] as const satisfies readonly CoachHookType[];

export type CoachContentFormat =
  | "talking_head"
  | "educational"
  | "behind_the_scenes"
  | "tutorial_demo"
  | "faceless_text"
  | "b2b_saas"
  | "other";

export const DEFAULT_COACH_HOOK_TYPE: CoachHookType = "specific_outcome";

/** Legacy hyphenated contentFormat values used in Coach scripts and plan cards. */
const LEGACY_FORMAT_HOOK_ROUTING: Record<string, CoachHookType> = {
  "talking-head": "specific_outcome",
  "voiceover-broll": "show_end_first",
  "behind-the-scenes": "pov",
  "tutorial-demo": "show_end_first",
  "trending-audio": "pov",
  faceless: "curiosity_gap",
};

export function resolveCoachHookTypeFromFormat(
  format: CoachContentFormat | null | undefined
): CoachHookType {
  switch (format) {
    case "behind_the_scenes":
      return "pov";
    case "tutorial_demo":
      return "show_end_first";
    case "talking_head":
    case "educational":
      return "specific_outcome";
    case "b2b_saas":
      return "specific_outcome";
    case "faceless_text":
      return "curiosity_gap";
    default:
      return DEFAULT_COACH_HOOK_TYPE;
  }
}

/**
 * Resolve hook type from contentFormat. Hardcoded fallback, never left to the LLM.
 * Preserves legacy hyphenated format keys from plan cards and Coach generation.
 */
export function resolveCoachHookType(contentFormat?: string | null): CoachHookType {
  const key = (contentFormat ?? "").trim().toLowerCase();
  if (!key) return DEFAULT_COACH_HOOK_TYPE;
  if (LEGACY_FORMAT_HOOK_ROUTING[key]) return LEGACY_FORMAT_HOOK_ROUTING[key];
  const underscored = key.replace(/-/g, "_");
  return resolveCoachHookTypeFromFormat(underscored as CoachContentFormat);
}

export function isCoachHookType(value: string): value is CoachHookType {
  return (COACH_HOOK_TYPES as readonly string[]).includes(value);
}

export function formatCoachHookTypeLabel(type: CoachHookType | string): string {
  const key = type.trim() as CoachHookType;
  switch (key) {
    case "specific_outcome":
      return "Specific outcome";
    case "pov":
      return "POV";
    case "contrarian":
      return "Contrarian";
    case "question":
      return "Question";
    case "pain_point":
      return "Pain point";
    case "story":
      return "Story";
    case "shock_data":
      return "Shock / data";
    case "show_end_first":
      return "Show end first";
    case "curiosity_gap":
      return "Curiosity gap";
    default:
      return "Specific outcome";
  }
}

/** Map CoachHookType to existing DB hookPattern enum. */
export function toDbHookPattern(type: CoachHookType): string {
  switch (type) {
    case "specific_outcome":
      return "direct_promise";
    case "pov":
      return "pov";
    case "contrarian":
      return "contrarian";
    case "question":
      return "question";
    case "pain_point":
      return "mistake_reveal";
    case "story":
      return "story";
    case "shock_data":
      return "stat";
    case "show_end_first":
      return "comparison";
    case "curiosity_gap":
      return "confession";
    default:
      return "direct_promise";
  }
}

/** Map CoachHookType to Hook Generator pattern names (free tool). */
export function toHookGeneratorPattern(type: CoachHookType): string {
  switch (type) {
    case "specific_outcome":
      return "specific_number";
    case "pov":
      return "pov";
    case "contrarian":
      return "contrarian";
    case "question":
      return "question_hook";
    case "pain_point":
      return "mistake_callout";
    case "story":
      return "personal_stake";
    case "shock_data":
      return "cost_reveal";
    case "show_end_first":
      return "result_first";
    case "curiosity_gap":
      return "curiosity_loop";
    default:
      return "specific_number";
  }
}

export type CoachHookVariation = {
  hookType: CoachHookType;
  visualHook: string;
  spokenHook: string;
  onScreenText: string;
};

const HOOK_VARIATION_KEYS = ["context", "contrarian", "intrigue"] as const;

function parseOneHookVariation(value: unknown): CoachHookVariation | null {
  if (typeof value === "string" && value.trim()) {
    return {
      hookType: DEFAULT_COACH_HOOK_TYPE,
      visualHook: "",
      spokenHook: value.trim(),
      onScreenText: "",
    };
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const spokenHook = String(row.spokenHook ?? row.spoken ?? "").trim();
  const visualHook = String(row.visualHook ?? row.visual ?? "").trim();
  const onScreenText = String(row.onScreenText ?? row.on_screen_text ?? "").trim();
  const hookTypeRaw = String(row.hookType ?? "").trim();
  const hookType = isCoachHookType(hookTypeRaw) ? hookTypeRaw : DEFAULT_COACH_HOOK_TYPE;
  if (!spokenHook && !visualHook && !onScreenText) return null;
  return { hookType, visualHook, spokenHook, onScreenText };
}

/** Parse LLM or tRPC hook-variation payloads (array, legacy strings, or stacked objects). */
export function parseCoachHookVariations(raw: unknown): CoachHookVariation[] | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const items = raw.map(parseOneHookVariation).filter((v): v is CoachHookVariation => v !== null);
    return items.length > 0 ? items : null;
  }

  if (typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.variations)) {
    return parseCoachHookVariations(obj.variations);
  }

  const fromKeys: CoachHookVariation[] = [];
  for (const key of HOOK_VARIATION_KEYS) {
    const parsed = parseOneHookVariation(obj[key]);
    if (parsed) fromKeys.push(parsed);
  }
  if (fromKeys.length > 0) return fromKeys;

  return null;
}
