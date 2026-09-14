import {
  CONTENT_AGENT_TOOL_REGISTRY,
  type ContentAgentAction,
  type ContentAgentToolName,
} from "./contentAgentTools";

export type ContentAgentExecutionStatus =
  | "completed"
  | "started"
  | "requires_input"
  | "failed";

export type ContentAgentArtifactRef = {
  kind: "reel" | "carousel" | "script";
  id?: number | null;
  title?: string | null;
};

export type ContentAgentToolResult = {
  status: ContentAgentExecutionStatus;
  message?: string;
  detail?: string;
  artifact?: ContentAgentArtifactRef | null;
};

/**
 * Payload that belongs to execution, not intent classification.
 *
 * Keeping the creator's original text here prevents a routing decision such as
 * write_viral_script or convert_existing_script from losing the actual idea or
 * pasted script after classification.
 */
export type ContentAgentExecutionContext = {
  inputText?: string;
};

type ContentAgentToolHandler = (
  action: ContentAgentAction,
  context: ContentAgentExecutionContext
) => Promise<ContentAgentToolResult>;

export type ContentAgentExecutorDeps = {
  writeViralScript: ContentAgentToolHandler;
  refineScript: ContentAgentToolHandler;
  generateHookIdeas: ContentAgentToolHandler;
  loadPlanCard: ContentAgentToolHandler;
  remakeSocialVideo: ContentAgentToolHandler;
  convertExistingScript: ContentAgentToolHandler;
  createCarousel: ContentAgentToolHandler;
  saveScript: ContentAgentToolHandler;
  scheduleFilming: ContentAgentToolHandler;
  downloadScript: ContentAgentToolHandler;
  inspectScriptHealth: ContentAgentToolHandler;
};

export class ContentAgentExecutionError extends Error {
  readonly tool: ContentAgentToolName;

  constructor(tool: ContentAgentToolName, message: string) {
    super(message);
    this.name = "ContentAgentExecutionError";
    this.tool = tool;
  }
}

export function assertContentAgentActionExecutable(action: ContentAgentAction): void {
  const config = CONTENT_AGENT_TOOL_REGISTRY[action.tool];
  if (config.requiresScript && !(action.scriptId && action.scriptId > 0)) {
    throw new ContentAgentExecutionError(
      action.tool,
      "This action needs a current Reel or script."
    );
  }
}

function contentAgentPreflightResult(
  action: ContentAgentAction
): ContentAgentToolResult | null {
  if (action.tool === "remake_social_video" && !action.sourceUrl?.trim()) {
    return {
      status: "requires_input",
      message: "Paste the Instagram, TikTok, or YouTube link you want me to remake.",
    };
  }
  return null;
}

/**
 * One creator-level execution switch for SpyReels Agent.
 *
 * UI buttons and natural-language chat should both resolve to ContentAgentAction
 * and call this function. The executor chooses the creator-level capability.
 * Existing SpyReels workflows remain responsible for the actual implementation.
 */
export async function executeContentAgentAction(
  action: ContentAgentAction,
  deps: ContentAgentExecutorDeps,
  context: ContentAgentExecutionContext = {}
): Promise<ContentAgentToolResult> {
  assertContentAgentActionExecutable(action);

  const preflight = contentAgentPreflightResult(action);
  if (preflight) return preflight;

  switch (action.tool) {
    case "write_viral_script":
      return deps.writeViralScript(action, context);
    case "refine_script":
      return deps.refineScript(action, context);
    case "generate_hook_ideas":
      return deps.generateHookIdeas(action, context);
    case "load_plan_card":
      return deps.loadPlanCard(action, context);
    case "remake_social_video":
      return deps.remakeSocialVideo(action, context);
    case "convert_existing_script":
      return deps.convertExistingScript(action, context);
    case "create_carousel":
      return deps.createCarousel(action, context);
    case "save_script":
      return deps.saveScript(action, context);
    case "schedule_filming":
      return deps.scheduleFilming(action, context);
    case "download_script":
      return deps.downloadScript(action, context);
    case "inspect_script_health":
      return deps.inspectScriptHealth(action, context);
  }
}

export function contentAgentActionForButton(
  tool: ContentAgentToolName,
  options: {
    scriptId?: number | null;
    sourceUrl?: string | null;
    scheduleText?: string | null;
    refineInstruction?: string | null;
  } = {}
): ContentAgentAction {
  return {
    tool,
    confidence: 100,
    source: "rule",
    scriptId: options.scriptId ?? undefined,
    sourceUrl: options.sourceUrl?.trim() || undefined,
    scheduleText: options.scheduleText?.trim() || undefined,
    refineInstruction: options.refineInstruction?.trim() || undefined,
  };
}
