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
 * Natural-language requests and explicit UI buttons both become a
 * ContentAgentAction, then enter the same creator-level executor. Exposing
 * resolveMessage separately lets the conversation layer show truthful working
 * copy only after the Agent knows which job it is about to run.
 */
export function useContentAgentExecutor(deps: ContentAgentExecutorDeps) {
  const resolveIntentMutation = trpc.studio.resolveIntent.useMutation();

  const executeAction = useCallback(
    async (action: ContentAgentAction): Promise<ContentAgentToolResult> => {
      return executeContentAgentAction(action, deps);
    },
    [deps]
  );

  const resolveMessage = useCallback(
    async (
      message: string,
      context: ContentAgentExecutionContext = {}
    ): Promise<ContentAgentAction> => {
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
      return resolved as ContentAgentAction;
    },
    [resolveIntentMutation]
  );

  const executeMessage = useCallback(
    async (
      message: string,
      context: ContentAgentExecutionContext = {}
    ): Promise<{ action: ContentAgentAction; result: ContentAgentToolResult }> => {
      const action = await resolveMessage(message, context);
      const result = await executeAction(action);
      return { action, result };
    },
    [executeAction, resolveMessage]
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
    resolveMessage,
    executeAction,
    executeMessage,
    executeButton,
    isRouting: resolveIntentMutation.isPending,
  };
}
