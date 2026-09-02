/**
 * Template-agnostic Carousel Planning IR v1.
 * Describes what the carousel means. Templates and renderers describe how it looks.
 */

import {
  briefPromisesPairedSolutions,
  detectCarouselListContractFromBrief,
  detectExplicitCarouselListContract,
  parseNumberedCarouselItem,
  resolveCarouselListContract,
  resolveCarouselOutlineListIndexes,
  type CarouselAngleType,
  type CarouselClaimRisk,
  type CarouselContentGoal,
  type CarouselCreativeBrief,
  type CarouselLayoutFamily,
  type CarouselCopyPlanningSequence,
  type CarouselListContract,
  type CarouselRecommendedVisual,
  type CarouselResearchMode,
  type CarouselSlideRole,
} from "./carouselStudio";

export const CAROUSEL_PLANNING_IR_VERSION = 1 as const;
export type CarouselPlanningIRVersion = typeof CAROUSEL_PLANNING_IR_VERSION;

export const CAROUSEL_PLANNING_CONTRACT_SOURCES = [
  "user",
  "strategist",
  "none",
] as const;
export type CarouselPlanningContractSource =
  (typeof CAROUSEL_PLANNING_CONTRACT_SOURCES)[number];

export const CAROUSEL_PLANNING_CONTRACT_KINDS = ["open", "enumerated"] as const;
export type CarouselPlanningContractKind =
  (typeof CAROUSEL_PLANNING_CONTRACT_KINDS)[number];

export type CarouselPlanningContract = {
  source: CarouselPlanningContractSource;
  kind: CarouselPlanningContractKind;
  count: number | null;
  itemType: string | null;
  locked: boolean;
};

export type CarouselPlanningStrategy = {
  angleType: CarouselAngleType;
  hook: string;
  corePromise: string;
  centralInsight: string;
  preferredFamily: CarouselLayoutFamily;
  ctaDirection: string;
};

export const CAROUSEL_PLANNING_BEAT_ROLES = [
  "cover",
  "list_item",
  "problem",
  "solution",
  "context",
  "insight",
  "example",
  "comparison",
  "framework_step",
  "story",
  "transition",
  "summary",
  "closing",
] as const;
export type CarouselPlanningBeatRole =
  (typeof CAROUSEL_PLANNING_BEAT_ROLES)[number];

export type CarouselPlanningSequence =
  | {
      kind: "list";
      index: number;
    }
  | {
      kind: "problem_solution";
      index: number;
      side: "problem" | "solution";
    };

export type CarouselPlanningBeat = {
  id: string;
  position: number;
  role: CarouselPlanningBeatRole;
  objective: string;
  visualIntent: CarouselRecommendedVisual;
  sequence: CarouselPlanningSequence | null;
};

export type CarouselPlanningResearch = {
  mode: CarouselResearchMode;
  claimRisk: CarouselClaimRisk;
  evidenceRequirements: string[];
  prohibitedClaims: string[];
};

export type CarouselPlanningIR = {
  version: CarouselPlanningIRVersion;
  topic: string;
  audience: string;
  goal: CarouselContentGoal;
  contract: CarouselPlanningContract;
  strategy: CarouselPlanningStrategy;
  beats: CarouselPlanningBeat[];
  research: CarouselPlanningResearch;
};

export type CarouselPlanningSlideBinding = {
  position: number;
  role: CarouselPlanningBeatRole;
  objective: string;
  slideId: string | null;
  listItemIndex: number | null;
};

/** Object keys that belong to templates, slots, or the renderer. */
export const FORBIDDEN_CAROUSEL_PLANNING_IR_KEYS = [
  "templateId",
  "layoutId",
  "carouselLayoutId",
  "slotId",
  "slotIds",
  "headline",
  "body",
  "subhead",
  "cta_label",
  "x",
  "y",
  "width",
  "height",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "colors",
  "typography",
  "dimensions",
  "imageUrl",
  "imageUrls",
  "renderer",
] as const;

const FORBIDDEN_IR_KEY_SET = new Set<string>(FORBIDDEN_CAROUSEL_PLANNING_IR_KEYS);
const SLIDE_TEMPLATE_ID_RE = /^slide_\d+$/;

const BRIEF_ROLE_TO_BEAT: Record<CarouselSlideRole, CarouselPlanningBeatRole> = {
  hook: "cover",
  context: "context",
  problem: "problem",
  insight: "insight",
  example: "example",
  comparison: "comparison",
  framework: "framework_step",
  takeaway: "summary",
  cta: "closing",
};

const NON_ITEM_BEAT_ROLES = new Set<CarouselPlanningBeatRole>([
  "cover",
  "context",
  "summary",
  "closing",
  "transition",
]);

function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}

function planningBeatId(position: number): string {
  return `beat_${String(position).padStart(2, "0")}`;
}

function planningContractFromListContract(
  source: "user" | "strategist",
  contract: CarouselListContract
): CarouselPlanningContract {
  return {
    source,
    kind: "enumerated",
    count: contract.promisedCount,
    itemType: contract.promisedItemType,
    locked: true,
  };
}

export function resolveCarouselPlanningContract(args: {
  brief: Pick<
    CarouselCreativeBrief,
    "title" | "hook" | "corePromise" | "centralInsight"
  >;
  sourceContent?: string | null;
}): CarouselPlanningContract {
  const userContract = detectExplicitCarouselListContract(
    args.sourceContent ?? ""
  );
  if (userContract) {
    return planningContractFromListContract("user", userContract);
  }
  const strategistContract = detectCarouselListContractFromBrief(args.brief);
  if (strategistContract) {
    return planningContractFromListContract("strategist", strategistContract);
  }
  return {
    source: "none",
    kind: "open",
    count: null,
    itemType: null,
    locked: false,
  };
}

function listContractFromPlanning(
  contract: CarouselPlanningContract
): CarouselListContract | null {
  if (
    contract.kind !== "enumerated" ||
    contract.count == null ||
    !contract.itemType
  ) {
    return null;
  }
  return {
    explicitListContract: true,
    promisedCount: contract.count,
    promisedItemType: contract.itemType,
  };
}

function sequenceFromBeat(beat: CarouselPlanningBeat): number | null {
  return beat.sequence?.index ?? null;
}

function mapOutlineItemToBeat(args: {
  slide: CarouselCreativeBrief["slideOutline"][number];
  position: number;
  isFirst: boolean;
  isLast: boolean;
  paired: boolean;
  listItemIndex: number | null;
}): CarouselPlanningBeat {
  const { slide, position, isFirst, isLast, paired, listItemIndex } = args;
  const numbered = parseNumberedCarouselItem(slide.objective);
  let role = BRIEF_ROLE_TO_BEAT[slide.role];
  let sequence: CarouselPlanningSequence | null = null;

  if (isFirst && slide.role === "hook") {
    role = "cover";
  }
  if (isLast && (slide.role === "cta" || slide.role === "takeaway")) {
    role = "closing";
    return {
      id: planningBeatId(position),
      position,
      role,
      objective: slide.objective,
      visualIntent: slide.recommendedVisual,
      sequence: null,
    };
  }

  if (paired && numbered) {
    role = numbered.kind === "fix" ? "solution" : "problem";
    sequence = {
      kind: "problem_solution",
      index: numbered.n,
      side: numbered.kind === "fix" ? "solution" : "problem",
    };
  } else if (listItemIndex != null) {
    role = "list_item";
    sequence = { kind: "list", index: listItemIndex };
  }

  if (isFirst && role !== "cover" && slide.role === "hook") {
    role = "cover";
  }

  return {
    id: planningBeatId(position),
    position,
    role,
    objective: slide.objective,
    visualIntent: slide.recommendedVisual,
    sequence,
  };
}

export function compileCreativeBriefToPlanningIR(args: {
  brief: CarouselCreativeBrief;
  sourceContent?: string | null;
}): CarouselPlanningIR {
  const { brief } = args;
  const sourceContent = args.sourceContent ?? "";
  const contract = resolveCarouselPlanningContract({ brief, sourceContent });
  const userContract = detectExplicitCarouselListContract(sourceContent);
  const listContract = resolveCarouselListContract(userContract, brief);
  const listIndexes = resolveCarouselOutlineListIndexes(
    brief.slideOutline,
    listContract
  );
  const paired = briefPromisesPairedSolutions(brief);
  const lastIndex = brief.slideOutline.length - 1;

  const beats = brief.slideOutline.map((slide, index) =>
    mapOutlineItemToBeat({
      slide,
      position: index + 1,
      isFirst: index === 0,
      isLast: index === lastIndex,
      paired,
      listItemIndex:
        typeof listIndexes[index] === "number" ? listIndexes[index]! : null,
    })
  );

  return {
    version: CAROUSEL_PLANNING_IR_VERSION,
    topic: brief.topic,
    audience: brief.inferredAudience,
    goal: brief.contentGoal,
    contract,
    strategy: {
      angleType: brief.angleType,
      hook: brief.hook,
      corePromise: brief.corePromise,
      centralInsight: brief.centralInsight,
      preferredFamily: brief.layoutFamily,
      ctaDirection: brief.ctaDirection,
    },
    beats,
    research: {
      mode: brief.researchMode,
      claimRisk: brief.claimRisk,
      evidenceRequirements: [...brief.evidenceRequirements],
      prohibitedClaims: [...brief.prohibitedClaims],
    },
  };
}

function collectForbiddenPlanningIRKeys(
  value: unknown,
  path: string,
  found: string[]
): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectForbiddenPlanningIRKeys(item, `${path}[${index}]`, found);
    });
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_IR_KEY_SET.has(key) || SLIDE_TEMPLATE_ID_RE.test(key)) {
      found.push(`${nextPath} is renderer or template specific`);
    }
    collectForbiddenPlanningIRKeys(child, nextPath, found);
  }
}

function validateEnumeratedListBeats(
  ir: CarouselPlanningIR,
  issues: string[]
): void {
  const count = ir.contract.count;
  if (count == null) {
    issues.push("Enumerated contract is missing a count");
    return;
  }
  const listBeats = ir.beats.filter((beat) => beat.sequence?.kind === "list");
  const indexes = listBeats
    .map((beat) => (beat.sequence?.kind === "list" ? beat.sequence.index : null))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  if (listBeats.length !== count) {
    issues.push(
      `Enumerated contract promises ${count} list items but found ${listBeats.length}`
    );
  }
  const expected = Array.from({ length: count }, (_, i) => i + 1);
  if (
    indexes.length === count &&
    indexes.some((value, i) => value !== expected[i])
  ) {
    issues.push(`List sequence indexes must run exactly 1 through ${count}`);
  }
  for (const beat of ir.beats) {
    if (NON_ITEM_BEAT_ROLES.has(beat.role) && sequenceFromBeat(beat) != null) {
      issues.push(
        `${beat.role} beat ${beat.id} consumed a list item index`
      );
    }
  }
}

function validatePairedBeats(ir: CarouselPlanningIR, issues: string[]): void {
  const paired = ir.beats.filter(
    (beat) => beat.sequence?.kind === "problem_solution"
  );
  if (paired.length === 0) return;

  const problems = new Map<number, number>();
  const solutions = new Map<number, number>();
  for (const beat of paired) {
    if (beat.sequence?.kind !== "problem_solution") continue;
    if (beat.sequence.side === "problem") {
      if (!problems.has(beat.sequence.index)) {
        problems.set(beat.sequence.index, beat.position);
      }
    } else if (!solutions.has(beat.sequence.index)) {
      solutions.set(beat.sequence.index, beat.position);
    }
  }

  for (const [index, solutionAt] of solutions) {
    const problemAt = problems.get(index);
    if (problemAt == null) {
      issues.push(`Solution ${index} exists without Problem ${index}`);
    } else if (solutionAt < problemAt) {
      issues.push(`Solution ${index} appears before Problem ${index}`);
    }
  }

  if (ir.contract.kind === "enumerated" && ir.contract.count != null) {
    const promised = ir.contract.count;
    const expected = Array.from({ length: promised }, (_, i) => i + 1);
    const missingProblems = expected.filter((n) => !problems.has(n));
    const missingSolutions = expected.filter((n) => !solutions.has(n));
    if (missingProblems.length > 0 || missingSolutions.length > 0) {
      issues.push(
        `Paired contract promises ${promised} problem/solution pairs but they are not fulfilled`
      );
    }
  }
}

export function validateCarouselPlanningIR(ir: CarouselPlanningIR): string[] {
  const issues: string[] = [];
  if (ir.version !== CAROUSEL_PLANNING_IR_VERSION) {
    issues.push(`Unsupported planning IR version ${ir.version}`);
  }

  const positions = ir.beats.map((beat) => beat.position);
  const expectedPositions = ir.beats.map((_, i) => i + 1);
  if (positions.some((value, i) => value !== expectedPositions[i])) {
    issues.push("Beat positions must be contiguous starting at 1");
  }

  const ids = ir.beats.map((beat) => beat.id);
  if (new Set(ids).size !== ids.length) {
    issues.push("Beat IDs must be unique");
  }
  ir.beats.forEach((beat) => {
    if (beat.id !== planningBeatId(beat.position)) {
      issues.push(`Beat ${beat.position} must use stable id ${planningBeatId(beat.position)}`);
    }
  });

  const covers = ir.beats.filter((beat) => beat.role === "cover");
  if (covers.length !== 1) {
    issues.push("Planning IR must contain exactly one cover");
  } else if (ir.beats[0]?.role !== "cover") {
    issues.push("Cover beat must be first");
  }

  const closings = ir.beats.filter((beat) => beat.role === "closing");
  if (closings.length !== 1) {
    issues.push("Planning IR must contain exactly one closing");
  } else if (ir.beats[ir.beats.length - 1]?.role !== "closing") {
    issues.push("Closing beat must be last");
  }

  if (ir.contract.source === "none") {
    if (ir.contract.kind !== "open") {
      issues.push("Open planning contracts must use kind open");
    }
    if (ir.contract.locked) {
      issues.push("Open planning contracts must not be locked");
    }
    if (ir.contract.count != null || ir.contract.itemType != null) {
      issues.push("Open planning contracts must not promise a count or item type");
    }
  } else {
    if (ir.contract.kind !== "enumerated") {
      issues.push("User and strategist contracts must be enumerated");
    }
    if (!ir.contract.locked) {
      issues.push("Enumerated planning contracts must be locked");
    }
    if (ir.contract.count == null || !ir.contract.itemType) {
      issues.push("Enumerated planning contracts must include count and itemType");
    }
  }

  const pairedBeats = ir.beats.some(
    (beat) => beat.sequence?.kind === "problem_solution"
  );
  if (ir.contract.kind === "enumerated" && !pairedBeats) {
    validateEnumeratedListBeats(ir, issues);
    if (ir.beats.some((beat) => beat.role === "context")) {
      issues.push("Simple listicles should not include a standalone context beat");
    }
  }
  if (pairedBeats) {
    validatePairedBeats(ir, issues);
  }

  collectForbiddenPlanningIRKeys(ir, "", issues);
  return uniqueIssues(issues);
}

export function bindPlanningIRToSlides(
  ir: CarouselPlanningIR,
  slideIds: string[]
): CarouselPlanningSlideBinding[] {
  return ir.beats.map((beat, index) => ({
    position: beat.position,
    role: beat.role,
    objective: beat.objective,
    slideId: slideIds[index] ?? null,
    listItemIndex:
      beat.sequence?.kind === "list" ? beat.sequence.index : null,
  }));
}

export function planningIRUsesListSequence(ir: CarouselPlanningIR): boolean {
  return ir.beats.some((beat) => beat.sequence?.kind === "list");
}

export function planningIRListItemIndexes(
  ir: CarouselPlanningIR
): Array<number | null> {
  return ir.beats.map((beat) =>
    beat.sequence?.kind === "list" ? beat.sequence.index : null
  );
}

export const PLANNING_IR_VALIDATION_ERROR_CATEGORY =
  "planning_ir_validation" as const;

export function planningCopySequenceFromIR(
  ir: CarouselPlanningIR
): CarouselCopyPlanningSequence {
  const hasPairs = ir.beats.some(
    (beat) => beat.sequence?.kind === "problem_solution"
  );
  const hasList = ir.beats.some((beat) => beat.sequence?.kind === "list");
  return {
    kind: hasPairs ? "problem_solution" : hasList ? "list" : "open",
    beats: ir.beats.map((beat) => ({
      position: beat.position,
      role: beat.role,
      sequence: beat.sequence,
    })),
  };
}

export function planningIRCopyGenerationGate(
  ir: CarouselPlanningIR | null | undefined
):
  | { blocked: false }
  | {
      blocked: true;
      issues: string[];
      errorCategory: typeof PLANNING_IR_VALIDATION_ERROR_CATEGORY;
    } {
  if (!ir) return { blocked: false };
  const issues = validateCarouselPlanningIR(ir);
  if (issues.length === 0) return { blocked: false };
  return {
    blocked: true,
    issues,
    errorCategory: PLANNING_IR_VALIDATION_ERROR_CATEGORY,
  };
}
