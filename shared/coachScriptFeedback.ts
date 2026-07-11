export const COACH_SCRIPT_DOWN_REASONS = [
  { id: "hook_weak", label: "Hook was weak" },
  { id: "idea_mismatch", label: "Didn't match my idea / niche" },
  { id: "felt_generic", label: "Felt generic / AI" },
  { id: "thin_story", label: "Story or examples were thin" },
  { id: "cta_bad", label: "CTA didn't make sense" },
  { id: "wrong_length", label: "Too long / too short" },
  { id: "other", label: "Other" },
] as const;

export type CoachScriptDownReasonId = (typeof COACH_SCRIPT_DOWN_REASONS)[number]["id"];

export function coachScriptDownReasonLabel(id: string | null | undefined): string {
  if (!id) return "";
  return COACH_SCRIPT_DOWN_REASONS.find((r) => r.id === id)?.label ?? id;
}

export function isCoachScriptDownReasonId(value: string): value is CoachScriptDownReasonId {
  return COACH_SCRIPT_DOWN_REASONS.some((r) => r.id === value);
}
