import type { CoachCapabilityId } from "./studioCoachUi";
import { isSparkOrPlanPrefill } from "./coachAnalyze";

export const CONTENT_AGENT_TOOL_REGISTRY = {
  write_viral_script: {
    label: "Create Reel script",
    requiresScript: false,
    description: "Turn a raw creator idea into a new SpyReels script.",
  },
  refine_script: {
    label: "Refine script",
    requiresScript: true,
    description: "Edit the current script while preserving the creator's requested scope.",
  },
  generate_hook_ideas: {
    label: "Generate hook ideas",
    requiresScript: true,
    description: "Generate alternative opening hooks for the current script.",
  },
  load_plan_card: {
    label: "Load plan idea",
    requiresScript: false,
    description: "Use an idea from the creator's 30-day content plan.",
  },
  remake_social_video: {
    label: "Remake social video",
    requiresScript: false,
    description: "Ingest a public Instagram, TikTok, or YouTube source and run the existing remake workflow.",
  },
  convert_existing_script: {
    label: "Convert existing script",
    requiresScript: false,
    description: "Convert a pasted long-form or rough script into the SpyReels Reel structure.",
  },
  create_carousel: {
    label: "Create carousel",
    requiresScript: true,
    description: "Carry the current Reel into the existing Carousel Studio generation flow.",
  },
  save_script: {
    label: "Save script",
    requiresScript: true,
    description: "Save the current Reel to My Scripts.",
  },
  schedule_filming: {
    label: "Schedule filming",
    requiresScript: true,
    description: "Create or clarify a filming reminder for the current Reel.",
  },
  download_script: {
    label: "Download script",
    requiresScript: true,
    description: "Download the current Reel as a branded SpyReels document.",
  },
  inspect_script_health: {
    label: "Inspect script health",
    requiresScript: true,
    description: "Open the current script quality and health view.",
  },
} as const;

export type ContentAgentToolName = keyof typeof CONTENT_AGENT_TOOL_REGISTRY;
export type SocialSourcePlatform = "instagram" | "tiktok" | "youtube";

export type ContentAgentAction = {
  tool: ContentAgentToolName;
  confidence: number;
  source: "rule" | "llm";
  assistantMessage?: string;
  refineInstruction?: string;
  planCardId?: number;
  scriptId?: number;
  sourceUrl?: string;
  platform?: SocialSourcePlatform;
  scheduleText?: string;
};

export type ResolveContentAgentIntentInput = {
  message: string;
  capabilityId?: CoachCapabilityId;
  activeScriptId?: number | null;
  attachedPlanCardId?: number | null;
  recentScriptId?: number | null;
};

const REFINE_PATTERNS =
  /\b(refine|improve|rewrite|shorten|shorter|longer|punchier|contrarian|bold|edit|change|fix|make it|tweak|simplify|simpler|funny|funnier|humor|stronger hook|strong hook|more viral|viral)\b/i;
const HOOK_PATTERNS =
  /\b(hook options?|alternative hooks?|new hook ideas?|generate hooks?|opening lines?|give me \d+ hooks?|scroll.?stop hooks?)\b/i;
const PLAN_PATTERNS =
  /\b(30.?day|plan card|day \d+|content plan|calendar idea)\b/i;
const SAVE_PATTERNS = /\b(save|save this|save script|save reel|keep this)\b/i;
const DOWNLOAD_PATTERNS = /\b(download|export)\b/i;
const SCHEDULE_PATTERNS = /\b(schedule|remind|reminder|film this|filming)\b/i;
const CAROUSEL_PATTERNS = /\b(carousel|slides?)\b/i;
const HEALTH_PATTERNS = /\b(script health|quality score|quality check|check this script)\b/i;

export type DetectedSocialSource = {
  url: string;
  platform: SocialSourcePlatform;
  platformLabel: "Instagram Reels" | "TikTok" | "YouTube Shorts";
};

export function extractSocialSource(value: string): DetectedSocialSource | null {
  const matches = value.match(/https?:\/\/[^\s]+/gi) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[),.;!?]+$/, "");
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      if (host === "instagram.com" || host.endsWith(".instagram.com")) {
        return { url, platform: "instagram", platformLabel: "Instagram Reels" };
      }
      if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
        return { url, platform: "tiktok", platformLabel: "TikTok" };
      }
      if (
        host === "youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "youtu.be" ||
        host.endsWith(".youtu.be")
      ) {
        return { url, platform: "youtube", platformLabel: "YouTube Shorts" };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function looksLikeExistingScript(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lineCount = trimmed.split(/\n+/).filter(Boolean).length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return lineCount >= 4 || wordCount >= 90;
}

function currentScriptId(input: ResolveContentAgentIntentInput): number | undefined {
  return input.activeScriptId ?? input.recentScriptId ?? undefined;
}

function normalizedRefineInstruction(message: string): string {
  const lower = message.toLowerCase();
  if (/\bshort(er|en)?\b/.test(lower)) {
    return "Shorten the full script while keeping the same idea, strongest proof, and ending. Cut filler only.";
  }
  if (/\b(fun(ny|nier)|humor)\b/.test(lower)) {
    return "Make the script funnier without changing the core point, facts, or useful takeaway.";
  }
  if (/\b(viral|stronger hook|strong hook)\b/.test(lower)) {
    return "Make this more viral with a stronger hook, tighter pacing, and clearer payoff. Keep the same idea and facts.";
  }
  if (/\bsimpl(if|ify|er)\b/.test(lower)) {
    return "Simplify the language. Use shorter sentences and easier words without removing the useful detail.";
  }
  return message;
}

export function resolveContentAgentIntentRules(
  input: ResolveContentAgentIntentInput
): ContentAgentAction {
  const message = input.message.trim();
  const lower = message.toLowerCase();
  const scriptId = currentScriptId(input);
  const social = extractSocialSource(message);

  if (social) {
    return {
      tool: "remake_social_video",
      confidence: 99,
      source: "rule",
      sourceUrl: social.url,
      platform: social.platform,
      assistantMessage: `Loading the ${social.platformLabel} source and starting the remake workflow.`,
    };
  }

  if (looksLikeExistingScript(message) && input.capabilityId == null) {
    return {
      tool: "convert_existing_script",
      confidence: 96,
      source: "rule",
      assistantMessage: "Converting your existing script into the SpyReels Reel structure.",
    };
  }

  if (input.capabilityId === "from_plan") {
    const hasPlanAttached =
      input.attachedPlanCardId != null && input.attachedPlanCardId > 0;
    if (hasPlanAttached || isSparkOrPlanPrefill(message) || message.length >= 10) {
      return {
        tool: "write_viral_script",
        confidence: 95,
        source: "rule",
        planCardId: input.attachedPlanCardId ?? undefined,
        assistantMessage: hasPlanAttached
          ? "Writing your script from this plan idea."
          : "Writing your script.",
      };
    }
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
      scriptId,
      refineInstruction: normalizedRefineInstruction(message),
      assistantMessage: "Updating your current Reel.",
    };
  }

  if (input.capabilityId === "hook_ideas") {
    return {
      tool: "generate_hook_ideas",
      confidence: 92,
      source: "rule",
      scriptId,
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

  if (scriptId && SAVE_PATTERNS.test(lower)) {
    return { tool: "save_script", confidence: 98, source: "rule", scriptId, assistantMessage: "Saving this Reel to My Scripts." };
  }
  if (scriptId && DOWNLOAD_PATTERNS.test(lower)) {
    return { tool: "download_script", confidence: 98, source: "rule", scriptId, assistantMessage: "Preparing your branded SpyReels script." };
  }
  if (scriptId && SCHEDULE_PATTERNS.test(lower)) {
    return { tool: "schedule_filming", confidence: 98, source: "rule", scriptId, scheduleText: message, assistantMessage: "Setting up your filming reminder." };
  }
  if (scriptId && CAROUSEL_PATTERNS.test(lower)) {
    return { tool: "create_carousel", confidence: 97, source: "rule", scriptId, assistantMessage: "Turning your current Reel into a carousel." };
  }
  if (scriptId && HEALTH_PATTERNS.test(lower)) {
    return { tool: "inspect_script_health", confidence: 97, source: "rule", scriptId, assistantMessage: "Opening the script health check." };
  }

  if (
    (input.attachedPlanCardId != null && input.attachedPlanCardId > 0) ||
    isSparkOrPlanPrefill(message)
  ) {
    return {
      tool: "write_viral_script",
      confidence: 95,
      source: "rule",
      planCardId: input.attachedPlanCardId ?? undefined,
      assistantMessage: "Writing your viral script from this plan idea.",
    };
  }

  if (scriptId && HOOK_PATTERNS.test(lower)) {
    return { tool: "generate_hook_ideas", confidence: 94, source: "rule", scriptId, assistantMessage: "Generating new hook ideas." };
  }

  if (REFINE_PATTERNS.test(lower) && scriptId) {
    return {
      tool: "refine_script",
      confidence: 90,
      source: "rule",
      scriptId,
      refineInstruction: normalizedRefineInstruction(message),
      assistantMessage: "Updating your current Reel.",
    };
  }

  if (PLAN_PATTERNS.test(lower)) {
    return {
      tool: "load_plan_card",
      confidence: 82,
      source: "rule",
      planCardId: input.attachedPlanCardId ?? undefined,
      assistantMessage: "Using your 30-day plan as context.",
    };
  }

  if (scriptId) {
    return {
      tool: "refine_script",
      confidence: 68,
      source: "rule",
      scriptId,
      refineInstruction: message,
      assistantMessage: "Updating your current Reel.",
    };
  }

  return {
    tool: "write_viral_script",
    confidence: 68,
    source: "rule",
    planCardId: input.attachedPlanCardId ?? undefined,
    assistantMessage: "Writing your viral script.",
  };
}

export function shouldUseLlmContentAgentClassifier(action: ContentAgentAction): boolean {
  return action.confidence < 80 && action.source === "rule";
}

export function parseLlmContentAgentAction(raw: string): ContentAgentAction | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tool = parsed.tool;
    if (typeof tool !== "string" || !(tool in CONTENT_AGENT_TOOL_REGISTRY)) return null;
    return {
      tool: tool as ContentAgentToolName,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 70,
      source: "llm",
      assistantMessage: typeof parsed.assistantMessage === "string" ? parsed.assistantMessage : undefined,
      refineInstruction: typeof parsed.refineInstruction === "string" ? parsed.refineInstruction : undefined,
      planCardId: typeof parsed.planCardId === "number" ? parsed.planCardId : undefined,
      scriptId: typeof parsed.scriptId === "number" ? parsed.scriptId : undefined,
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : undefined,
      platform: parsed.platform === "instagram" || parsed.platform === "tiktok" || parsed.platform === "youtube" ? parsed.platform : undefined,
      scheduleText: typeof parsed.scheduleText === "string" ? parsed.scheduleText : undefined,
    };
  } catch {
    return null;
  }
}

export function buildContentAgentClassifierPrompt(
  value: string | ResolveContentAgentIntentInput
): string {
  const input: ResolveContentAgentIntentInput = typeof value === "string" ? { message: value } : value;
  const message = input.message.trim();
  const scriptId = currentScriptId(input);
  const toolLines = Object.entries(CONTENT_AGENT_TOOL_REGISTRY)
    .map(([name, tool]) => `- ${name}: ${tool.description}${tool.requiresScript ? " Requires a current script." : ""}`)
    .join("\n");

  return `You route creator requests for SpyReels Agent.

The Agent chooses the creator-level job. Existing SpyReels systems decide how to execute it.
Never invent a capability or claim an action completed. Choose exactly one next tool.

Current context:
- currentScriptId: ${scriptId ?? "none"}
- attachedPlanCardId: ${input.attachedPlanCardId ?? "none"}

Available tools:
${toolLines}

Rules:
- Only choose a tool that requires a script when currentScriptId is present.
- A public Instagram, TikTok, or YouTube URL should use remake_social_video.
- A pasted full script should use convert_existing_script.
- Requests to modify the current artifact should use refine_script unless the user specifically asks for hook options, carousel, save, schedule, download, or script health.
- If the user is simply giving a new content idea, use write_viral_script.

User message: "${message.replace(/"/g, '\\"')}"

Return ONLY valid JSON:
{
  "tool": "${Object.keys(CONTENT_AGENT_TOOL_REGISTRY).join('" | "')}",
  "confidence": <integer 0-100>,
  "assistantMessage": "<short user-facing status line>",
  "refineInstruction": "<only when useful for refine_script>",
  "planCardId": <number or omit>,
  "scriptId": <number or omit>,
  "sourceUrl": "<URL or omit>",
  "platform": "instagram" | "tiktok" | "youtube" | <omit>,
  "scheduleText": "<original schedule request or omit>"
}`;
}
