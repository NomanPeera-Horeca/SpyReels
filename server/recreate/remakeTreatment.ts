/**
 * Own-winner remake treatments (OWN_WINNERS): how to rebuild a creator's OWN
 * winning video. Only these choices add a treatment block; every other remake
 * gets exactly the prompt it gets today.
 */
import { prismFormat } from "../../shared/remakeFormats";

export type RemakeTreatment =
  | { kind: "prism"; formatId: string }
  | { kind: "refresh" }
  | { kind: "own_idea" };

/** Prompt block for a treatment. Pure; exported for tests. */
export function buildTreatmentBlock(t: RemakeTreatment | null | undefined): string {
  if (!t) return "";
  if (t.kind === "prism") {
    const f = prismFormat(t.formatId);
    if (!f) return "";
    return `**TREATMENT: NEW FORMAT FOR THE CREATOR'S OWN WINNING VIDEO (overrides any rule above about keeping the source format):**
- This is the creator's OWN video that did much better than usual. Keep the EXACT same topic and core idea.
- Rebuild it as: ${f.label} (${f.how}).
- Write a NEW hook that fits this format, reusing the hook formula of the original's first seconds.
- Only use facts from the original video. Where a personal number, result or story detail is needed that the original doesn't give, write [add your real result here] instead of inventing it.`;
  }
  if (t.kind === "refresh") {
    return `**TREATMENT: REFRESH THE CREATOR'S OWN WINNING VIDEO:**
- This is the creator's OWN video that did much better than usual. Keep the same topic, facts, format and structure.
- Write a NEW hook, new examples and new wording, so it feels fresh to people who saw the original.
- Do not add facts, numbers or results that are not in the original; use [add your real result here] where one is needed.`;
  }
  return `**TREATMENT: THE CREATOR'S OWN WINNING VIDEO, MADE ABOUT THEIR NEW IDEA:**
- The source is the creator's OWN video that did much better than usual. Keep what made it work: its structure, pacing and hook style.
- Make it about the creator's direction above.`;
}

/** Choices whose script must still cover the source topic. Pure. */
export function treatmentKeepsSourceTopic(t: RemakeTreatment | null | undefined): boolean {
  return t?.kind === "prism" || t?.kind === "refresh";
}
