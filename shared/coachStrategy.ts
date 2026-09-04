export type CoachStrategyDirectionId = "A" | "B" | "C";

export type CoachStrategyDirection = {
  id: CoachStrategyDirectionId;
  angle: string;
  viewerPromise: string;
  hookDirection: string;
  narrativeShape: string;
  whyItCouldWin: string;
};

export type CoachStrategyDraft = {
  intentSummary: string;
  creatorConstraints: string[];
  directions: CoachStrategyDirection[];
};

export type CoachStrategyScore = {
  id: CoachStrategyDirectionId;
  intentFidelity: number;
  hookPotential: number;
  viewerClarity: number;
  originality: number;
  overall: number;
};

export type SelectedCoachStrategy = {
  selectedId: CoachStrategyDirectionId;
  scores: CoachStrategyScore[];
  selectionReason: string;
  developedAngle: string;
  hookDirection: string;
  narrativePlan: string[];
  mustPreserve: string[];
};

const DIRECTION_IDS: CoachStrategyDirectionId[] = ["A", "B", "C"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map(readString).filter(Boolean).slice(0, max)
    : [];
}

function readDirectionId(value: unknown): CoachStrategyDirectionId | null {
  const id = readString(value).toUpperCase();
  return DIRECTION_IDS.includes(id as CoachStrategyDirectionId)
    ? (id as CoachStrategyDirectionId)
    : null;
}

function readScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(1, Math.round(n * 10) / 10));
}

export function parseCoachStrategyDraft(value: unknown): CoachStrategyDraft | null {
  const root = asRecord(value);
  if (!root) return null;

  const intentSummary = readString(root.intentSummary);
  const creatorConstraints = readStringArray(root.creatorConstraints);
  const rawDirections = Array.isArray(root.directions) ? root.directions : [];
  const directions: CoachStrategyDirection[] = [];

  for (const rawDirection of rawDirections) {
    const direction = asRecord(rawDirection);
    if (!direction) continue;
    const id = readDirectionId(direction.id);
    const angle = readString(direction.angle);
    const viewerPromise = readString(direction.viewerPromise);
    const hookDirection = readString(direction.hookDirection);
    const narrativeShape = readString(direction.narrativeShape);
    const whyItCouldWin = readString(direction.whyItCouldWin);
    if (!id || !angle || !viewerPromise || !hookDirection || !narrativeShape || !whyItCouldWin) {
      continue;
    }
    directions.push({ id, angle, viewerPromise, hookDirection, narrativeShape, whyItCouldWin });
  }

  const ids = new Set(directions.map((direction) => direction.id));
  const hasAllDirections = DIRECTION_IDS.every((id) => ids.has(id));
  if (!intentSummary || directions.length !== 3 || ids.size !== 3 || !hasAllDirections) {
    return null;
  }

  return { intentSummary, creatorConstraints, directions };
}

export function parseCoachStrategySelection(
  value: unknown,
  directions: CoachStrategyDirection[]
): SelectedCoachStrategy | null {
  const root = asRecord(value);
  if (!root) return null;

  const allowedIds = new Set(directions.map((direction) => direction.id));
  const selectedId = readDirectionId(root.selectedId);
  if (!selectedId || !allowedIds.has(selectedId)) return null;

  const rawScores = Array.isArray(root.scores) ? root.scores : [];
  const scores: CoachStrategyScore[] = [];
  for (const rawScore of rawScores) {
    const score = asRecord(rawScore);
    if (!score) continue;
    const id = readDirectionId(score.id);
    if (!id || !allowedIds.has(id)) continue;
    scores.push({
      id,
      intentFidelity: readScore(score.intentFidelity),
      hookPotential: readScore(score.hookPotential),
      viewerClarity: readScore(score.viewerClarity),
      originality: readScore(score.originality),
      overall: readScore(score.overall),
    });
  }

  const scoreIds = new Set(scores.map((score) => score.id));
  if (scores.length !== 3 || scoreIds.size !== 3 || DIRECTION_IDS.some((id) => !scoreIds.has(id))) {
    return null;
  }

  const selectionReason = readString(root.selectionReason);
  const developedAngle = readString(root.developedAngle);
  const hookDirection = readString(root.hookDirection);
  const narrativePlan = readStringArray(root.narrativePlan, 5);
  const mustPreserve = readStringArray(root.mustPreserve, 10);

  if (!selectionReason || !developedAngle || !hookDirection || narrativePlan.length < 2) {
    return null;
  }

  return enforceCoachStrategyIntentGate(
    {
      selectedId,
      scores,
      selectionReason,
      developedAngle,
      hookDirection,
      narrativePlan,
      mustPreserve,
    },
    directions
  );
}

export const COACH_STRATEGY_MIN_INTENT_FIDELITY = 8;

export function enforceCoachStrategyIntentGate(
  selection: SelectedCoachStrategy,
  directions: CoachStrategyDirection[]
): SelectedCoachStrategy {
  const eligible = selection.scores.filter(
    (score) => score.intentFidelity >= COACH_STRATEGY_MIN_INTENT_FIDELITY
  );
  const pool =
    eligible.length > 0
      ? eligible
      : [...selection.scores].sort((a, b) => b.intentFidelity - a.intentFidelity).slice(0, 1);
  if (pool.some((score) => score.id === selection.selectedId)) {
    return selection;
  }

  const winner = [...pool].sort(
    (a, b) => b.overall - a.overall || b.intentFidelity - a.intentFidelity
  )[0];
  const chosen = directions.find((direction) => direction.id === winner.id);
  const rejected = selection.scores.find((score) => score.id === selection.selectedId);
  return {
    ...selection,
    selectedId: winner.id,
    selectionReason: `Intent fidelity gate replaced ${selection.selectedId} (intent ${rejected?.intentFidelity ?? 0}) with ${winner.id} (intent ${winner.intentFidelity}). ${selection.selectionReason}`,
    developedAngle: chosen?.angle || selection.developedAngle,
    hookDirection: chosen?.hookDirection || selection.hookDirection,
  };
}

function truncateBlock(value?: string, max = 5000): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > max ? `${trimmed.slice(0, max)}\n[truncated]` : trimmed;
}

export function buildCoachStrategyDirectionsPrompt(args: {
  rawIdea: string;
  niche: string;
  targetAudience: string;
  brandDescription?: string | null;
  clarifications?: Array<{ question: string; answer: string }>;
  audienceResearchBlock?: string;
  researchGroundingBlock?: string;
}): string {
  const clarificationBlock = args.clarifications?.length
    ? args.clarifications.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n\n")
    : "(none)";
  const audienceResearch = truncateBlock(args.audienceResearchBlock) || "(none)";
  const researchGrounding = truncateBlock(args.researchGroundingBlock) || "(none)";

  return `You are the pre-writing strategist for SpyReels AI Coach.

Your job is ONLY to understand the creator's intent and develop strategic directions BEFORE any script is written.

Core principle: CREATIVE WHEN THE USER IS VAGUE. OBEDIENT WHEN THE USER IS SPECIFIC.
- The creator's raw idea is ground truth for WHAT the content is about.
- If the creator specifies a product, claim, story, audience, position, format, tone, or thing not to say, preserve it.
- Niche, audience, research, and brand context may sharpen the framing but may never replace or redirect the creator's topic.
- If the idea is vague, creatively fill the missing strategic gaps.
- If the idea is specific, keep the substance fixed and vary only the strongest framing, tension, viewer promise, and narrative route.

DO NOT write the Reel script.
DO NOT generate B-roll, camera directions, music, editing notes, production notes, or full spoken lines.

CREATOR RAW IDEA (GROUND TRUTH)
<<<${args.rawIdea.trim()}>>>

CREATOR PROFILE
Niche: ${args.niche}
Target audience: ${args.targetAudience}
Brand: ${args.brandDescription?.trim() || "(none)"}

CLARIFICATIONS (GROUND TRUTH)
${clarificationBlock}

AUDIENCE RESEARCH (supporting context only; never overrides the idea)
${audienceResearch}

VERIFIED TOPIC RESEARCH (supporting context only; never overrides the idea)
${researchGrounding}

First summarize the creator's actual intent in one sentence and extract any non-negotiable constraints. Then create EXACTLY 3 genuinely different strategic directions labeled A, B, and C.

Each direction must differ in strategic framing, not merely wording. A useful direction answers: what tension do we lead with, what does the viewer expect to get, and what narrative route makes this worth watching?

Return JSON only:
{
  "intentSummary": "one sentence stating exactly what the creator wants this content to do",
  "creatorConstraints": ["specific facts, instructions, claims, exclusions, or boundaries that must not change"],
  "directions": [
    {
      "id": "A",
      "angle": "the strategic angle in 1-2 sentences",
      "viewerPromise": "what the viewer expects to learn, feel, discover, or see",
      "hookDirection": "the type of tension/open loop the later writer should use; not a finished hook line",
      "narrativeShape": "the high-level progression from opening tension to payoff; not script copy",
      "whyItCouldWin": "why this direction could outperform for this idea and audience"
    },
    { "id": "B", "angle": "...", "viewerPromise": "...", "hookDirection": "...", "narrativeShape": "...", "whyItCouldWin": "..." },
    { "id": "C", "angle": "...", "viewerPromise": "...", "hookDirection": "...", "narrativeShape": "...", "whyItCouldWin": "..." }
  ]
}`;
}

export function buildCoachStrategySelectionPrompt(args: {
  rawIdea: string;
  intentSummary: string;
  creatorConstraints: string[];
  directions: CoachStrategyDirection[];
}): string {
  return `You are the independent strategy selector for SpyReels AI Coach. Three directions were developed before script writing. Compare ALL THREE before choosing one.

The creator's raw idea is the highest-priority ground truth. Intent fidelity is non-negotiable. A clever direction that drifts from the creator's topic must lose.

CREATOR RAW IDEA
<<<${args.rawIdea.trim()}>>>

UNDERSTOOD INTENT
${args.intentSummary}

NON-NEGOTIABLE CREATOR CONSTRAINTS
${args.creatorConstraints.length ? args.creatorConstraints.map((item) => `- ${item}`).join("\n") : "- (none explicitly stated)"}

CANDIDATE DIRECTIONS
${JSON.stringify(args.directions, null, 2)}

Score A, B, and C independently from 1-10 on:
1. intentFidelity — preserves exactly what the creator wants
2. hookPotential — creates strong curiosity/tension without cheap clickbait
3. viewerClarity — a cold viewer can quickly understand why to stay
4. originality — feels specific and non-generic
5. overall — weighted judgment, with intentFidelity as the hard gate

Then choose the strongest direction and DEVELOP IT one level further into a writer-ready strategy. Do not write the script and do not add production directions.

Return JSON only:
{
  "scores": [
    { "id": "A", "intentFidelity": 1, "hookPotential": 1, "viewerClarity": 1, "originality": 1, "overall": 1 },
    { "id": "B", "intentFidelity": 1, "hookPotential": 1, "viewerClarity": 1, "originality": 1, "overall": 1 },
    { "id": "C", "intentFidelity": 1, "hookPotential": 1, "viewerClarity": 1, "originality": 1, "overall": 1 }
  ],
  "selectedId": "A | B | C",
  "selectionReason": "why this direction wins after comparison",
  "developedAngle": "the chosen angle sharpened into a precise writer brief",
  "hookDirection": "the exact hook mechanism/tension to pursue, but not finished spoken copy",
  "narrativePlan": ["opening tension", "development/story proof", "payoff/takeaway"],
  "mustPreserve": ["creator intent and constraints the writer must not change"]
}`;
}

export function formatSelectedCoachStrategy(
  draft: CoachStrategyDraft,
  selection: SelectedCoachStrategy
): string {
  const chosen = draft.directions.find((direction) => direction.id === selection.selectedId);
  if (!chosen) return "";

  const preserve = Array.from(
    new Set([...draft.creatorConstraints, ...selection.mustPreserve].map((item) => item.trim()).filter(Boolean))
  );

  return `--- Selected creative strategy (approved before script writing) ---
Understood creator intent: ${draft.intentSummary}
Chosen direction: ${selection.selectedId}
Core angle: ${chosen.angle}
Viewer promise: ${chosen.viewerPromise}
Developed angle: ${selection.developedAngle}
Hook direction: ${selection.hookDirection}
Narrative plan:
${selection.narrativePlan.map((item, index) => `${index + 1}. ${item}`).join("\n")}
Must preserve:
${preserve.length ? preserve.map((item) => `- ${item}`).join("\n") : "- Original creator topic and intent exactly as stated."}

Writer rules:
- This strategy was selected before script writing. Develop it; do not choose a different angle.
- The original creator idea remains ground truth. If this strategy conflicts with the creator's explicit instruction, the creator instruction wins.
- Strategy controls framing and narrative. It does not authorize invented facts, claims, or personal details.`;
}
