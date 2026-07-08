import type { CoachScriptMode } from "@shared/coachScriptMode";
import {
  COACH_HOOK_TYPES,
  DEFAULT_COACH_HOOK_TYPE,
  resolveCoachHookType,
  type CoachHookType,
} from "@shared/hookTypes";

export { COACH_HOOK_TYPES, DEFAULT_COACH_HOOK_TYPE, resolveCoachHookType, type CoachHookType };

const DESCRIPTION_FORMAT_SIGNALS: Array<{ pattern: RegExp; format: string }> = [
  { pattern: /\bbehind the scenes\b|\bbts\b|\bday in the life\b/i, format: "behind-the-scenes" },
  { pattern: /\btutorial\b|\bhow to\b|\bstep by step\b|\bdemo\b/i, format: "tutorial-demo" },
  { pattern: /\bvoiceover\b|\bb-?roll\b/i, format: "voiceover-broll" },
  { pattern: /\btrending audio\b|\bpov reel\b/i, format: "trending-audio" },
  { pattern: /\bfaceless\b|\btext only\b|\btext-on-screen\b/i, format: "faceless" },
  { pattern: /\btalking head\b|\bon camera\b/i, format: "talking-head" },
];

export function inferContentFormatFromDescription(description: string): string | null {
  const text = description.trim();
  if (!text) return null;
  for (const { pattern, format } of DESCRIPTION_FORMAT_SIGNALS) {
    if (pattern.test(text)) return format;
  }
  return null;
}

export function resolveCoachHookTypeForPrompt(args: {
  contentFormat?: string | null;
  description: string;
}): CoachHookType {
  const explicit = (args.contentFormat ?? "").trim();
  if (explicit) return resolveCoachHookType(explicit);
  const inferred = inferContentFormatFromDescription(args.description);
  return resolveCoachHookType(inferred);
}

/** CTA is optional. AI must decide whether a close action belongs. */
export function buildOptionalCtaRules(funnelStage?: string | null): string {
  const stage = (funnelStage ?? "tofu").toLowerCase();
  return `CTA DECISION (optional — do NOT force a CTA on every script):
- First decide: does this Reel need a call to action, or should it end on the takeaway?
- Skip CTA (return "" for cta) when the Reel is belief-shift, story, POV, or pure value and a forced ask would feel fake.
- Never invent insider CTAs that only make sense to the creator's team (bad example: "Comment ADAM" / "Send this to your Adam").
- Never invent a person's name, team role, or private nickname in the CTA unless that person is the subject of the script and the audience already knows them.
- If you include a CTA, it must be different from teach, 1 sentence, and doable by a cold viewer.
- Prefer no CTA over a weak CTA.
- When a CTA helps:
  - TOFU (${stage === "tofu" ? "this script" : "awareness"}): soft engagement only if natural (save / send to a specific cold audience role). Example: "Save this if you are planning a kitchen build."
  - MOFU: save for later when the tip is reference material.
  - BOFU: one clear lead action (comment keyword or DM) only when the script is selling or offering a resource.
- Funnel hint for this script: ${stage.toUpperCase()}. Still skip CTA if it would feel bolted on.`;
}

export function buildStackedHookRules(hookType: CoachHookType): string {
  return `STACKED HOOK (mandatory — all 3 layers in frame 0-1.5 sec):
Layer 1 — hookVisualBeat (productionCoach): concrete visual for frame 0. Mid-action start, close-up, or end-result on screen. Not a static talking head logo intro.
Layer 2 — hook (spoken): verbal emotional trigger. Most surprising line first. Open Loop A only. No "Hey guys" warm-up.
Layer 3 — hookOnScreenText (productionCoach): 5-8 bold words, ALL CAPS, max 30 characters, top third of frame. Required for muted viewers.

HOOK TYPE (mandatory, pre-selected — do NOT pick a different type):
- hookType in JSON must be exactly "${hookType}".
- Write spoken hook, on-screen text, and visual beat to match this type.

On-screen vs spoken rules:
- hookOnScreenText must use DIFFERENT words than the spoken hook (complementary, same idea, not a copy-paste).
- dualEncoding: describe how on-screen text complements the spoken line while muted viewers still get the hook.

Type guidance for "${hookType}":
${hookTypeGuidance(hookType)}`;
}

function hookTypeGuidance(hookType: CoachHookType): string {
  switch (hookType) {
    case "specific_outcome":
      return "- Use exact numbers, timeframes, or before/after metrics in the spoken hook.";
    case "pov":
      return "- Second-person immersion. Do not force the literal prefix \"POV:\" on camera unless the format is trending-audio.";
    case "contrarian":
      return "- Challenge a belief the audience holds. Make them stay to agree or argue.";
    case "question":
      return "- Force an answer-seeking reflex. Specific to their niche pain.";
    case "pain_point":
      return "- Name a specific frustration (example: stuck at 200 views), not generic tiredness.";
    case "story":
      return "- Open with a personal beat or transformation moment, not a lecture.";
    case "shock_data":
      return "- Lead with a surprising stat or outcome that contradicts expectations.";
    case "show_end_first":
      return "- Cold-open the result visually in hookVisualBeat, then spoken hook teases how.";
    case "curiosity_gap":
      return "- Create tension between what they know and what they need to know. No early payoff.";
    default:
      return "- Specific, filmable, niche-aware.";
  }
}

export function buildRetentionAndShareRules(
  mode: CoachScriptMode,
  funnelStage?: string | null,
  hookType?: CoachHookType
): string {
  const resolvedHook = hookType ?? DEFAULT_COACH_HOOK_TYPE;
  const loopEnding =
    mode === "loop"
      ? `- Loop mode: ending must mirror the opening frame or first line so the Reel can replay seamlessly. Minimal spoken words; visuals carry the story.`
      : `- Story mode: final spoken line must echo or callback to the opening (visual or verbal) so the Reel can loop on replay.`;

  return `${buildStackedHookRules(resolvedHook)}

RETENTION STRUCTURE (mandatory — nested open loops mapped to HEIT sections):
- hook: Open Loop A ONLY. Tease the main problem or outcome. Create a curiosity gap. Do NOT reveal the best insight in the first 5 seconds.
- explain: Open Loop B. Add a surprising complication or what most people get wrong. Still withhold the main payoff.
- illustrate: Close Loop B. Resolve the complication with one concrete story, example, or visual beat. Main insight still withheld.
- teach: Close Loop A. Deliver the ONE insight you saved for roughly 70% through the script. This is the payoff.
- cta: OPTIONAL. Only if a natural next action helps. Otherwise return an empty string for cta and end on teach.
${loopEnding}

OPTIONAL SHARE LINE (only when CTA is present and natural):
- You may include a send-to-someone line only when the audience role is clear and cold (example: "Send this to a first-time owner still guessing on equipment.").
- Never invent personal names, internal nicknames, or team references the cold viewer does not know.

${buildOptionalCtaRules(funnelStage)}

PRODUCTION RETENTION (productionCoach fields):
- hookVisualBeat: required. One sentence: what the viewer SEES in frame 0 (mid-action, close-up, or result shot).
- hookOnScreenText: ALL CAPS, max 30 characters, frame 0 (first 0.5 sec) for muted scrollers.
- frame0OnScreenText: same phrase as hookOnScreenText.
- dualEncoding: how on-screen text complements the spoken hook (different words, same idea).
- pacingNotes: jump cuts every 2-4 seconds, rhythmic not frantic, no dead air, no filler words.
- loopClosingNote: one sentence on how the ending connects back to the opening for seamless replay.
- soundOffSafe: true if the hook works with on-screen text alone when muted.`;
}
