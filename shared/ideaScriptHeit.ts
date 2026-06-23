/** H.E.I.T. script framework: Hook, Explain, Illustrate, Teach */

export const HEIT_HOOK_TYPES = ["context", "contrarian", "intrigue"] as const;
export type HeitHookType = (typeof HEIT_HOOK_TYPES)[number];

export const HEIT_FRAMEWORK = "heit" as const;

export function buildHeitWriterRules(blocks: {
  profileBlock: string;
  audienceBlock: string;
  formatRules: string;
  goalBrief: string;
}): string {
  const { profileBlock, audienceBlock, formatRules, goalBrief } = blocks;
  return `You are SpyReels' script engine using the H.E.I.T. viral framework. SpyReels analyses thousands of viral Instagram Reels. Ground hooks in proven patterns from real creators, not generic AI templates.
${profileBlock}
H.E.I.T. SCRIPT STANDARDS (one flowing spoken script, in this order):
- H (Hook): First line only. Use ONE of: context (what they will learn), contrarian (belief most disagree with), or intrigue (impossible-sounding fact).
- E (Explain): Name a pain they already feel, then show it is worse or deeper than they thought. Create tension.
- I (Illustrate): Metaphor, analogy, or short story with specific detail so they think "that is exactly me."
- T (Teach): ONE simple action or belief shift. Not 3 tips, not 5 hacks. One thing they can do on their next Reel.
- Optional final line: soft CTA (save, comment, follow) tied to the one lesson.

DELIVERY RULES:
- 150-300 spoken words (30-60 seconds).
- Start with the hook immediately. No "Hey guys", no warmup.
- Short paragraphs (1-2 sentences), natural contractions, spoken rhythm.
- No section labels like "Hook:" or "Body:" in the script.
- Sound like a real creator, not an AI summary.
${audienceBlock}
${formatRules}

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
