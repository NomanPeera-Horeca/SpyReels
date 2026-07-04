import type { CoachCapabilityId } from "./studioCoachUi";

export type CoachToolName =
  | "write_viral_script"
  | "refine_script"
  | "generate_hook_ideas"
  | "load_plan_card";

export type CoachAction = {
  tool: CoachToolName;
  confidence: number;
  source: "rule" | "llm";
  assistantMessage?: string;
  refineInstruction?: string;
  planCardId?: number;
  scriptId?: number;
};

export type ResolveCoachIntentInput = {
  message: string;
  capabilityId?: CoachCapabilityId;
  activeScriptId?: number | null;
  attachedPlanCardId?: number | null;
  recentScriptId?: number | null;
};

const REFINE_PATTERNS =
  /\b(refine|improve|rewrite|shorten|longer|punchier|contrarian|bold|edit|change|fix|make it|tweak)\b/i;
const HOOK_PATTERNS =
  /\b(hook ideas?|alternative hooks?|new hooks?|opening lines?|first line|scroll.?stop)\b/i;
const PLAN_PATTERNS =
  /\b(30.?day|plan card|day \d+|content plan|calendar idea)\b/i;

export function resolveCoachIntentRules(input: ResolveCoachIntentInput): CoachAction {
  const message = input.message.trim();
  const lower = message.toLowerCase();

  if (input.capabilityId === "from_plan") {
    return {
      tool: "load_plan_card",
      confidence: 95,
      source: "rule",
      assistantMessage: "Pulling an idea from your 30-day plan.",
    };
  }

  if (input.capabilityId === "refine_script") {
    return {
      tool: "refine_script",
      confidence: 92,
      source: "rule",
      scriptId: input.activeScriptId ?? input.recentScriptId ?? undefined,
      refineInstruction: message,
      assistantMessage: "Opening your script so you can refine it.",
    };
  }

  if (input.capabilityId === "hook_ideas") {
    return {
      tool: "generate_hook_ideas",
      confidence: 92,
      source: "rule",
      scriptId: input.activeScriptId ?? input.recentScriptId ?? undefined,
      assistantMessage: "Generating new hook ideas for your script.",
    };
  }

  if (input.capabilityId === "write_script") {
    return {
      tool: "write_viral_script",
      confidence: 95,
      source: "rule",
      planCardId: input.attachedPlanCardId ?? undefined,
      assistantMessage: "Writing your viral script.",
    };
  }

  if (HOOK_PATTERNS.test(lower)) {
    return {
      tool: "generate_hook_ideas",
      confidence: 88,
      source: "rule",
      scriptId: input.activeScriptId ?? input.recentScriptId ?? undefined,
      assistantMessage: "Generating new hook ideas.",
    };
  }

  if (REFINE_PATTERNS.test(lower) && (input.activeScriptId || input.recentScriptId)) {
    return {
      tool: "refine_script",
      confidence: 85,
      source: "rule",
      scriptId: input.activeScriptId ?? input.recentScriptId ?? undefined,
      refineInstruction: message,
      assistantMessage: "Refining your script with AI.",
    };
  }

  if (PLAN_PATTERNS.test(lower)) {
    return {
      tool: "load_plan_card",
      confidence: 80,
      source: "rule",
      planCardId: input.attachedPlanCardId ?? undefined,
      assistantMessage: "Using your 30-day plan as context.",
    };
  }

  return {
    tool: "write_viral_script",
    confidence: 88,
    source: "rule",
    planCardId: input.attachedPlanCardId ?? undefined,
    assistantMessage: "Writing your viral script.",
  };
}

export function shouldUseLlmIntentClassifier(action: CoachAction): boolean {
  return action.confidence < 80 && action.source === "rule";
}

export function parseLlmCoachAction(raw: string): CoachAction | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tool = parsed.tool;
    if (
      tool !== "write_viral_script" &&
      tool !== "refine_script" &&
      tool !== "generate_hook_ideas" &&
      tool !== "load_plan_card"
    ) {
      return null;
    }
    return {
      tool,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 70,
      source: "llm",
      assistantMessage:
        typeof parsed.assistantMessage === "string" ? parsed.assistantMessage : undefined,
      refineInstruction:
        typeof parsed.refineInstruction === "string" ? parsed.refineInstruction : undefined,
      planCardId: typeof parsed.planCardId === "number" ? parsed.planCardId : undefined,
      scriptId: typeof parsed.scriptId === "number" ? parsed.scriptId : undefined,
    };
  } catch {
    return null;
  }
}

export function buildCoachIntentClassifierPrompt(message: string): string {
  return `You route creator requests for SpyReels AI Coach.

Available tools:
- write_viral_script: turn a raw idea into a new viral Reel script
- refine_script: edit an existing script (needs refineInstruction)
- generate_hook_ideas: new opening hook options for an existing script
- load_plan_card: start from a 30-day content plan idea

User message: "${message.replace(/"/g, '\\"')}"

Return ONLY valid JSON:
{
  "tool": "write_viral_script" | "refine_script" | "generate_hook_ideas" | "load_plan_card",
  "confidence": <integer 0-100>,
  "assistantMessage": "<short user-facing line>",
  "refineInstruction": "<only for refine_script, else omit>",
  "planCardId": <number or omit>,
  "scriptId": <number or omit>
}`;
}
