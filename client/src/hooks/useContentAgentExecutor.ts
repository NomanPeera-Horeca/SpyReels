import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  contentAgentActionForButton,
  executeContentAgentAction,
  type ContentAgentExecutorDeps,
  type ContentAgentToolResult,
} from "@shared/contentAgentExecutor";
import type {
  ContentAgentAction,
  ContentAgentToolName,
} from "@shared/contentAgentTools";
import type { CoachCapabilityId } from "@shared/studioCoachUi";

export type ContentAgentExecutionContext = {
  activeScriptId?: number | null;
  attachedPlanCardId?: number | null;
  capabilityId?: CoachCapabilityId;
};

export type ContentAgentButtonOptions = {
  scriptId?: number | null;
  sourceUrl?: string | null;
  scheduleText?: string | null;
  refineInstruction?: string | null;
};

/**
 * Shared client bridge for SpyReels Agent.
 *
 * Natural-language requests use the server intent resolver, then the same
 * creator-level executor as explicit UI buttons. This keeps chat and buttons
 * from drifting into separate product behavior.
 */
export function useContentAgentExecutor(deps: ContentAgentExecutorDeps) {
  const resolveIntentMutation = trpc.studio.resolveIntent.useMutation();

  const executeAction = useCallback(
    async (action: ContentAgentAction): Promise<ContentAgentToolResult> => {
      return executeContentAgentAction(action, deps);
    },
    [deps]
  );

  const executeMessage = useCallback(
    async (
      message: string,
      context: ContentAgentExecutionContext = {}
    ): Promise<{ action: ContentAgentAction; result: ContentAgentToolResult }> => {
      const trimmed = message.trim();
      if (!trimmed) {
        throw new Error("Tell Agent what you want to create or change.");
      }

      const resolved = await resolveIntentMutation.mutateAsync({
        message: trimmed,
        capabilityId: context.capabilityId,
        activeScriptId: context.activeScriptId ?? undefined,
        attachedPlanCardId: context.attachedPlanCardId ?? undefined,
      });
      const action = resolved as ContentAgentAction;
      const result = await executeAction(action);
      return { action, result };
    },
    [executeAction, resolveIntentMutation]
  );

  const executeButton = useCallback(
    async (
      tool: ContentAgentToolName,
      options: ContentAgentButtonOptions = {}
    ): Promise<{ action: ContentAgentAction; result: ContentAgentToolResult }> => {
      const action = contentAgentActionForButton(tool, options);
      const result = await executeAction(action);
      return { action, result };
    },
    [executeAction]
  );

  return {
    executeAction,
    executeMessage,
    executeButton,
    isRouting: resolveIntentMutation.isPending,
  };
}
