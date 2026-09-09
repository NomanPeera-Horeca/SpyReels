import { useCallback, useRef, useState } from "react";
import {
  contentAgentActionForButton,
  type ContentAgentExecutorDeps,
  type ContentAgentToolResult,
} from "@shared/contentAgentExecutor";
import type {
  ContentAgentAction,
  ContentAgentToolName,
} from "@shared/contentAgentTools";
import {
  errorTurn,
  type ContentAgentTurn,
} from "@shared/contentAgentConversation";
import {
  contentAgentResultTurn,
  contentAgentWorkingLabel,
} from "@shared/contentAgentRuntimePresentation";
import {
  useContentAgentExecutor,
  type ContentAgentButtonOptions,
  type ContentAgentExecutionContext,
} from "@/hooks/useContentAgentExecutor";

export type ContentAgentConversationControllerOptions = {
  deps: ContentAgentExecutorDeps;
  context?: ContentAgentExecutionContext;
  onActionResult?: (
    action: ContentAgentAction,
    result: ContentAgentToolResult
  ) => void | Promise<void>;
};

/**
 * Stateful conversation controller for the SpyReels Content Agent.
 *
 * The UI does not interpret creator language. It appends the user turn, asks
 * the shared Agent router for one creator-level action, executes that action
 * through the shared executor, then turns the real result into a receipt,
 * clarification, or error.
 *
 * A clarification keeps the pending tool. That matters for requests such as:
 * "schedule this" -> "When do you want to film it?" -> "Friday at 10".
 * The follow-up stays inside schedule_filming instead of being misclassified as
 * a script rewrite.
 */
export function useContentAgentConversationController({
  deps,
  context = {},
  onActionResult,
}: ContentAgentConversationControllerOptions) {
  const { resolveMessage, executeAction, isRouting } = useContentAgentExecutor(deps);
  const nextTurnIdRef = useRef(1);
  const pendingActionRef = useRef<ContentAgentAction | null>(null);
  const [turns, setTurns] = useState<ContentAgentTurn[]>([]);
  const [working, setWorking] = useState(false);
  const [workingLabel, setWorkingLabel] = useState<string | null>(null);
  const [workDurationSeconds, setWorkDurationSeconds] = useState<number | null>(null);
  const [pendingTool, setPendingTool] = useState<ContentAgentToolName | null>(null);

  const nextTurnId = useCallback(() => nextTurnIdRef.current++, []);

  const appendTurn = useCallback((turn: ContentAgentTurn) => {
    setTurns((previous) => [...previous, turn]);
  }, []);

  const appendUserTurn = useCallback((text: string) => {
    appendTurn({
      id: nextTurnId(),
      role: "user",
      kind: "message",
      text,
      createdAt: Date.now(),
    });
  }, [appendTurn, nextTurnId]);

  const runResolvedAction = useCallback(async (
    action: ContentAgentAction
  ): Promise<ContentAgentToolResult | null> => {
    const startedAt = Date.now();
    setWorking(true);
    setWorkingLabel(contentAgentWorkingLabel(action));

    try {
      const result = await executeAction(action);
      appendTurn(contentAgentResultTurn(nextTurnId(), action, result));

      if (result.status === "requires_input") {
        pendingActionRef.current = action;
        setPendingTool(action.tool);
      } else {
        pendingActionRef.current = null;
        setPendingTool(null);
      }

      await onActionResult?.(action, result);
      return result;
    } catch (error) {
      pendingActionRef.current = null;
      setPendingTool(null);
      appendTurn(errorTurn(
        nextTurnId(),
        error instanceof Error && error.message.trim()
          ? error.message
          : "I could not complete that action."
      ));
      return null;
    } finally {
      const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setWorkDurationSeconds(duration);
      setWorking(false);
      setWorkingLabel(null);
    }
  }, [appendTurn, executeAction, nextTurnId, onActionResult]);

  const continuePendingAction = useCallback((
    action: ContentAgentAction,
    reply: string
  ): ContentAgentAction => {
    if (action.tool === "schedule_filming") {
      return {
        ...action,
        scheduleText: reply,
        confidence: 100,
        source: "rule",
      };
    }

    if (action.tool === "remake_social_video") {
      return {
        ...action,
        sourceUrl: reply.trim(),
        confidence: 100,
        source: "rule",
      };
    }

    return {
      ...action,
      refineInstruction: reply,
      confidence: 100,
      source: "rule",
    };
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || working) return null;

    appendUserTurn(trimmed);

    const pending = pendingActionRef.current;
    if (pending) {
      return runResolvedAction(continuePendingAction(pending, trimmed));
    }

    setWorking(true);
    setWorkingLabel(contentAgentWorkingLabel(null));
    const routeStartedAt = Date.now();

    try {
      const action = await resolveMessage(trimmed, context);
      setWorking(false);
      setWorkingLabel(null);
      return runResolvedAction(action);
    } catch (error) {
      const duration = Math.max(1, Math.round((Date.now() - routeStartedAt) / 1000));
      setWorkDurationSeconds(duration);
      setWorking(false);
      setWorkingLabel(null);
      appendTurn(errorTurn(
        nextTurnId(),
        error instanceof Error && error.message.trim()
          ? error.message
          : "I could not understand that request."
      ));
      return null;
    }
  }, [appendTurn, appendUserTurn, context, continuePendingAction, nextTurnId, resolveMessage, runResolvedAction, working]);

  const runButton = useCallback(async (
    tool: ContentAgentToolName,
    options: ContentAgentButtonOptions = {}
  ) => {
    if (working) return null;
    const action = contentAgentActionForButton(tool, options);
    return runResolvedAction(action);
  }, [runResolvedAction, working]);

  const clearConversation = useCallback(() => {
    pendingActionRef.current = null;
    setPendingTool(null);
    setTurns([]);
    setWorking(false);
    setWorkingLabel(null);
    setWorkDurationSeconds(null);
  }, []);

  const placeholder = pendingTool === "schedule_filming"
    ? "Tell Agent when you want to film it..."
    : pendingTool === "remake_social_video"
      ? "Paste the Instagram, TikTok, or YouTube link..."
      : "Ask Agent to create, change, save, schedule, download, or repurpose this content...";

  return {
    turns,
    working: working || isRouting,
    workingLabel,
    workDurationSeconds,
    pendingTool,
    placeholder,
    sendMessage,
    runButton,
    clearConversation,
  };
}
