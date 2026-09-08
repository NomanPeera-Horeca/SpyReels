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

export type ContentAgentExecutorDeps = {
  writeViralScript: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  refineScript: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  generateHookIdeas: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  loadPlanCard: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  remakeSocialVideo: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  convertExistingScript: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  createCarousel: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  saveScript: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  scheduleFilming: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  downloadScript: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
  inspectScriptHealth: (action: ContentAgentAction) => Promise<ContentAgentToolResult>;
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

  if (action.tool === "remake_social_video" && !action.sourceUrl?.trim()) {
    throw new ContentAgentExecutionError(
      action.tool,
      "I need a public Instagram, TikTok, or YouTube link to remake."
    );
  }
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
  deps: ContentAgentExecutorDeps
): Promise<ContentAgentToolResult> {
  assertContentAgentActionExecutable(action);

  switch (action.tool) {
    case "write_viral_script":
      return deps.writeViralScript(action);
    case "refine_script":
      return deps.refineScript(action);
    case "generate_hook_ideas":
      return deps.generateHookIdeas(action);
    case "load_plan_card":
      return deps.loadPlanCard(action);
    case "remake_social_video":
      return deps.remakeSocialVideo(action);
    case "convert_existing_script":
      return deps.convertExistingScript(action);
    case "create_carousel":
      return deps.createCarousel(action);
    case "save_script":
      return deps.saveScript(action);
    case "schedule_filming":
      return deps.scheduleFilming(action);
    case "download_script":
      return deps.downloadScript(action);
    case "inspect_script_health":
      return deps.inspectScriptHealth(action);
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
