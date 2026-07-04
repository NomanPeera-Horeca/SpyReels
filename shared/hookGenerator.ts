export type ViralHook = {
  hook: string;
  onScreenText: string;
  pattern: string;
  reasoning: string;
};

export type HookGeneratorTeaser = {
  pattern: string;
  partial: string;
};

export const HOOK_TO_SCRIPT_PENDING_KEY = "hook_to_script_pending";

export type HookToScriptPending = {
  hook: string;
  onScreenText: string;
  reelContent: string;
  hookIndex: number;
};

export const HOOK_STYLE_OPTIONS = [
  { value: "mix", label: "Mix of patterns" },
  { value: "contrarian", label: "Contrarian" },
  { value: "story", label: "Story open" },
  { value: "curiosity", label: "Curiosity loop" },
] as const;

export const HOOK_FORMAT_OPTIONS = [
  { value: "talking-head", label: "Talking head" },
  { value: "b-roll-voiceover", label: "B-roll + voiceover" },
  { value: "text-on-screen", label: "Text on screen" },
] as const;

export const HOOK_TONE_CHIPS = ["Direct", "Bold", "Curious", "Empathetic"] as const;

export function formatHookPatternLabel(pattern: string): string {
  return pattern
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildHookTeaserPartial(hook: string): string {
  const words = hook.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 4) return `${words.join(" ")}...`;
  return `${words.slice(0, 4).join(" ")}...`;
}
