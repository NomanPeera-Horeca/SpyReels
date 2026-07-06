/** H.E.I.T. script framework: Hook, Explain, Illustrate, Teach */

import { buildRetentionAndShareRules } from "@shared/coachRetentionRules";
import type { CoachScriptMode } from "@shared/coachScriptMode";
import { inferCoachScriptMode } from "@shared/coachScriptMode";

export const HEIT_HOOK_TYPES = ["context", "contrarian", "intrigue"] as const;
export type HeitHookType = (typeof HEIT_HOOK_TYPES)[number];

export const HEIT_FRAMEWORK = "heit" as const;

export function buildHeitWriterRules(blocks: {
  profileBlock: string;
  audienceBlock: string;
  formatRules: string;
  goalBrief: string;
  filmingFormat?: string | null;
}): string {
  const { profileBlock, audienceBlock, formatRules, goalBrief, filmingFormat } = blocks;
  const scriptMode: CoachScriptMode = inferCoachScriptMode({
    description: goalBrief,
    contentFormat: filmingFormat ?? null,
  });
  const wordRule =
    scriptMode === "loop"
      ? "- 25-45 spoken words (8-15 seconds). Visual beats over long narration."
      : "- 90-135 spoken words (30-45 seconds).";

  return `You are SpyReels' script engine using the H.E.I.T. viral framework. SpyReels analyses thousands of viral Instagram Reels. Ground hooks in proven patterns from real creators, not generic AI templates.
${profileBlock}
H.E.I.T. SCRIPT STANDARDS (one flowing spoken script, in this order):
- H (Hook): First line only. Open Loop A: tease outcome, do NOT reveal the best insight yet.
- E (Explain): Open Loop B: name pain plus a surprising complication. No full payoff.
- I (Illustrate): Close Loop B with a concrete story or visual. Main insight still withheld.
- T (Teach): Close Loop A: ONE payoff insight at roughly 70% through the script.
- Final lines: loop tie-back, DM-share trigger ("Send this to the friend who..."), and funnel-appropriate CTA.

DELIVERY RULES:
${wordRule}
- Start with the hook immediately. No "Hey guys", no warmup.
- Short paragraphs (1-2 sentences), natural contractions, spoken rhythm.
- No section labels like "Hook:" or "Body:" in the script.
- Sound like a real creator, not an AI summary.
${audienceBlock}
${formatRules}

${buildRetentionAndShareRules(scriptMode)}

${goalBrief}`;
}

export function buildHeitStructurePrompt(blocks: {
  idea: string;
  nicheContext: string;
  profileBlock: string;
  toneContext: string;
  goalBrief: string;
  filmingFormat: string | null;
  audienceBlock: string;
  viralHookBlock: string;
}): string {
  const {
    idea,
    nicheContext,
    profileBlock,
    toneContext,
    goalBrief,
    filmingFormat,
    audienceBlock,
    viralHookBlock,
  } = blocks;

  return `Create a H.E.I.T. Reel structure for this topic${nicheContext}: "${idea}"
${profileBlock}
Tone: ${toneContext}
${goalBrief}
${filmingFormat ? `Filming format: ${filmingFormat.replace(/_/g, " ")}` : ""}
${audienceBlock}
${viralHookBlock}

H.E.I.T. means:
- H = Hook (context OR contrarian OR intrigue)
- E = Explain (surface pain they feel, then deeper problem that makes it worse)
- I = Illustrate (analogy or story with relatable detail)
- T = Teach (single action: ONE lesson only, not a listicle)

Return JSON with:
- hook: { heitType ("context"|"contrarian"|"intrigue"), text (ready-to-speak opening line), technique (why it stops the scroll) }
- explain: { surfacePain, deeperProblem }
- illustrate: { analogyOrStory, relatableDetail }
- teach: { singleAction, closingLine (optional soft CTA) }
- suggestedTitle (max 80 chars)
- hookRationale (one sentence)

Do NOT add a listicle body or multiple tips. One teach action only.`;
}

export const HEIT_STRUCTURE_JSON_SCHEMA = {
  name: "heit_idea_structure",
  strict: true,
  schema: {
    type: "object",
    properties: {
      hook: {
        type: "object",
        properties: {
          heitType: { type: "string", enum: ["context", "contrarian", "intrigue"] },
          text: { type: "string" },
          technique: { type: "string" },
        },
        required: ["heitType", "text", "technique"],
        additionalProperties: false,
      },
      explain: {
        type: "object",
        properties: {
          surfacePain: { type: "string" },
          deeperProblem: { type: "string" },
        },
        required: ["surfacePain", "deeperProblem"],
        additionalProperties: false,
      },
      illustrate: {
        type: "object",
        properties: {
          analogyOrStory: { type: "string" },
          relatableDetail: { type: "string" },
        },
        required: ["analogyOrStory", "relatableDetail"],
        additionalProperties: false,
      },
      teach: {
        type: "object",
        properties: {
          singleAction: { type: "string" },
          closingLine: { type: "string" },
        },
        required: ["singleAction", "closingLine"],
        additionalProperties: false,
      },
      suggestedTitle: { type: "string" },
      hookRationale: { type: "string" },
    },
    required: ["hook", "explain", "illustrate", "teach", "suggestedTitle", "hookRationale"],
    additionalProperties: false,
  },
} as const;

export function normalizeHeitStructure(raw: Record<string, unknown>): Record<string, unknown> {
  const hook = raw.hook;
  if (!hook || typeof hook !== "object" || Array.isArray(hook)) return raw;

  const h = hook as Record<string, unknown>;
  const heitType =
    typeof h.heitType === "string"
      ? h.heitType
      : typeof h.type === "string"
        ? h.type
        : "intrigue";

  return {
    ...raw,
    framework: HEIT_FRAMEWORK,
    hook: {
      heitType,
      type: heitType,
      text: typeof h.text === "string" ? h.text : "",
      technique: typeof h.technique === "string" ? h.technique : "",
    },
  };
}

export function readHeitHookType(viralStructure: Record<string, unknown> | null | undefined): string {
  const hook = viralStructure?.hook;
  if (!hook || typeof hook !== "object" || Array.isArray(hook)) return "intrigue";
  const h = hook as Record<string, unknown>;
  if (typeof h.heitType === "string" && h.heitType.trim()) return h.heitType.trim();
  if (typeof h.type === "string" && h.type.trim()) return h.type.trim();
  return "intrigue";
}

export function readHeitHookRationale(viralStructure: Record<string, unknown> | null | undefined): string {
  const r = viralStructure?.hookRationale;
  return typeof r === "string" ? r.trim() : "";
}

export function buildHeitDraftUserPrompt(blocks: {
  idea: string;
  nicheContext: string;
  viralStructure: Record<string, unknown>;
  viralHookBlock: string;
  toneContext: string;
  gradeLevelInstruction: string;
  goalLine: string;
  refinementBrief: string | null;
}): string {
  const {
    idea,
    nicheContext,
    viralStructure,
    viralHookBlock,
    toneContext,
    gradeLevelInstruction,
    goalLine,
    refinementBrief,
  } = blocks;

  const hookType = readHeitHookType(viralStructure);
  const hookRationale = readHeitHookRationale(viralStructure);
  const refineBlock = refinementBrief
    ? `\n\nREVISION BRIEF (rewrite from scratch):\n${refinementBrief}\nTighter hook, stronger Explain tension, sharper Illustrate moment, ONE Teach action only.\n`
    : "";

  const hookGuidance = viralHookBlock
    ? `HOOK GUIDANCE:\nH.E.I.T. hook type: "${hookType}". ${hookRationale}\nFirst spoken line must be the hook. No warmup.\n`
  : "";

  return `Write the complete Reel script using H.E.I.T.
Topic${nicheContext}: "${idea}"

STRUCTURE PLAN (follow H then E then I then T in order):
${JSON.stringify(viralStructure, null, 2)}

${hookGuidance}Requirements:
- Tone: ${toneContext}
- ${gradeLevelInstruction}
- 150-300 spoken words.
- Do NOT start with "Hey", "So", "Okay", "Welcome", or any greeting.
- Do NOT include labels like Hook: or Body: in the script.
- Teach exactly ONE action. No numbered tip lists.
- Hook pattern: ${hookType}${refineBlock}

${goalLine}`;
}

export const HEIT_JUDGE_CRITERIA = `Evaluate using H.E.I.T.:
- H (Hook): context, contrarian, or intrigue in the first sentence. No sleepy setup.
- E (Explain): surface pain then deeper problem. Creates tension to keep watching.
- I (Illustrate): metaphor, analogy, or story with specific relatable detail.
- T (Teach): exactly ONE actionable takeaway. Penalize scripts with 2+ separate tips or listicle structure.
- Pacing / retention: micro-beats every ~12s. No monologue walls.
- Skip-rate: 1-10 for first 3 seconds (10 = almost nobody skips).

Penalize listicle scripts. Teach must be ONE clear action, not multiple tips.`;
