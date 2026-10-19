/**
 * What "Continue" does with an editor that is still open. Pure, so the rule
 * is tested once and shared by every editor (Goals, Audience, Pillars, niche,
 * language).
 *
 * - skip:  nothing was typed, or the text is unchanged. Nothing is written.
 * - save:  a valid, changed value. It is saved before the step advances.
 * - block: the draft is incomplete (a required field is empty but the user
 *          typed something, or cleared a value that had content). Continue
 *          stops so no text is silently dropped.
 */
export type PendingField = { key: string; required?: boolean };
export type PendingDecision = "skip" | "save" | "block";

const trimmed = (v: string | undefined) => (v ?? "").trim();

export function decidePendingSave(
  fields: PendingField[],
  initial: Record<string, string>,
  values: Record<string, string>
): PendingDecision {
  const entered = fields.some(f => trimmed(values[f.key]) !== "");
  const hadContent = fields.some(f => trimmed(initial[f.key]) !== "");
  if (!entered) return hadContent ? "block" : "skip";
  const changed = fields.some(f => trimmed(values[f.key]) !== trimmed(initial[f.key]));
  if (!changed) return "skip";
  const missingRequired = fields.some(f => f.required && trimmed(values[f.key]) === "");
  return missingRequired ? "block" : "save";
}
