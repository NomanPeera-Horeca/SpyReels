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

function truncateBlock(value?: string, max = 1200): string {
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

  return `Pre-writing strategist for SpyReels AI Coach. Strategy only. No script, B-roll, or production notes.

CREATIVE WHEN VAGUE. OBEDIENT WHEN SPECIFIC.
- Raw idea is ground truth for WHAT the video is about.
- Preserve any product, claim, story, audience, position, format, tone, or exclusion the creator stated.
- Niche, audience, and research may sharpen framing. They may never replace the topic.
- Vague idea: fill missing strategy. Specific idea: keep the substance fixed and vary only framing, tension, promise, and route.

CREATOR RAW IDEA
<<<${args.rawIdea.trim()}>>>

PROFILE
Niche: ${args.niche}
Audience: ${args.targetAudience}
Brand: ${args.brandDescription?.trim() || "(none)"}
Clarifications: ${clarificationBlock}
Audience research (supporting only): ${audienceResearch}
Topic research (supporting only): ${researchGrounding}

Return EXACTLY 3 strategically different directions A/B/C. Each must differ in tension, viewer promise, or narrative route, not wording. Keep every field to 1 sentence.

JSON only:
{"intentSummary":"one sentence of actual creator intent","creatorConstraints":["non-negotiable facts or exclusions"],"directions":[{"id":"A","angle":"1 sentence","viewerPromise":"1 sentence","hookDirection":"tension type, not a finished hook","narrativeShape":"open to payoff in one sentence","whyItCouldWin":"1 sentence"},{"id":"B","angle":"...","viewerPromise":"...","hookDirection":"...","narrativeShape":"...","whyItCouldWin":"..."},{"id":"C","angle":"...","viewerPromise":"...","hookDirection":"...","narrativeShape":"...","whyItCouldWin":"..."}]}`;
}

export function buildCoachStrategySelectionPrompt(args: {
  rawIdea: string;
  intentSummary: string;
  creatorConstraints: string[];
  directions: CoachStrategyDirection[];
}): string {
  return `Compare ALL THREE directions. Pick the one that best obeys the creator and has the strongest creative potential. Intent fidelity is the hard gate. A clever off-topic direction must lose. Do not write the script.

CREATOR RAW IDEA
<<<${args.rawIdea.trim()}>>>

INTENT: ${args.intentSummary}
CONSTRAINTS:
${args.creatorConstraints.length ? args.creatorConstraints.map((item) => `- ${item}`).join("\n") : "- (none)"}

DIRECTIONS
${JSON.stringify(args.directions)}

Score 1-10: intentFidelity, hookPotential, viewerClarity, originality, overall.
Then develop the winner just enough for the writer: 2-sentence developedAngle, 1-sentence hookDirection, 3 short narrativePlan beats.

JSON only:
{"scores":[{"id":"A","intentFidelity":1,"hookPotential":1,"viewerClarity":1,"originality":1,"overall":1},{"id":"B","intentFidelity":1,"hookPotential":1,"viewerClarity":1,"originality":1,"overall":1},{"id":"C","intentFidelity":1,"hookPotential":1,"viewerClarity":1,"originality":1,"overall":1}],"selectedId":"A","selectionReason":"1-2 sentences","developedAngle":"2 sentences","hookDirection":"1 sentence, not spoken copy","narrativePlan":["open","proof","payoff"],"mustPreserve":["creator constraints"]}`;
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
