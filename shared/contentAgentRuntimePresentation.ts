import type { ContentAgentToolResult } from "./contentAgentExecutor";
import type { ContentAgentAction, ContentAgentToolName } from "./contentAgentTools";
import {
  actionReceipt,
  clarificationTurn,
  errorTurn,
  type ContentAgentTurn,
} from "./contentAgentConversation";

const COMPLETED_RECEIPTS: Record<ContentAgentToolName, string> = {
  write_viral_script: "Reel created",
  refine_script: "Reel updated",
  generate_hook_ideas: "Hook options ready",
  load_plan_card: "Plan idea attached",
  remake_social_video: "Remake ready",
  convert_existing_script: "Script converted",
  create_carousel: "Carousel ready",
  save_script: "Saved to My Scripts",
  schedule_filming: "Filming reminder set",
  download_script: "Downloaded branded script",
  inspect_script_health: "Script health opened",
};

const STARTED_RECEIPTS: Partial<Record<ContentAgentToolName, string>> = {
  remake_social_video: "Opening Remake",
  create_carousel: "Opening Carousel Studio",
  download_script: "Preparing branded script",
  inspect_script_health: "Opening script health",
};

export function contentAgentWorkingLabel(action?: ContentAgentAction | null): string {
  if (!action) return "Understanding what you want to do...";
  if (action.assistantMessage?.trim()) return action.assistantMessage.trim();

  switch (action.tool) {
    case "write_viral_script":
      return "Writing your Reel...";
    case "refine_script":
      return "Updating your Reel...";
    case "generate_hook_ideas":
      return "Finding stronger hooks...";
    case "load_plan_card":
      return "Loading your plan idea...";
    case "remake_social_video":
      return "Loading the source and starting Remake...";
    case "convert_existing_script":
      return "Converting your script...";
    case "create_carousel":
      return "Preparing Carousel Studio...";
    case "save_script":
      return "Saving your Reel...";
    case "schedule_filming":
      return "Setting up your filming reminder...";
    case "download_script":
      return "Preparing your download...";
    case "inspect_script_health":
      return "Opening script health...";
  }
}

export function contentAgentResultTurn(
  id: string | number,
  action: ContentAgentAction,
  result: ContentAgentToolResult
): ContentAgentTurn {
  const detail = result.detail?.trim() || undefined;

  if (result.status === "requires_input") {
    return clarificationTurn(
      id,
      result.message?.trim() || "I need one more detail before I can do that."
    );
  }

  if (result.status === "failed") {
    return errorTurn(
      id,
      result.message?.trim() || "I could not complete that action.",
      detail
    );
  }

  const fallback =
    result.status === "started"
      ? STARTED_RECEIPTS[action.tool] ?? `${COMPLETED_RECEIPTS[action.tool]} started`
      : COMPLETED_RECEIPTS[action.tool];

  return actionReceipt(
    id,
    result.message?.trim() || fallback,
    detail
  );
}
