import { useCallback, useRef, useState } from "react";
import {
  contentAgentActionForButton,
  type ContentAgentExecutionContext,
  type ContentAgentExecutorDeps,
  type ContentAgentToolResult,
} from "@shared/contentAgentExecutor";
import type {
  ContentAgentAction,
  ContentAgentToolName,
} from "@shared/contentAgentTools";
import { continueContentAgentAction } from "@shared/contentAgentClarification";
import {
  errorTurn,
  type ContentAgentTurn,
} from "@shared/contentAgentConversation";
import {
  contentAgentResultTurn,
  contentAgentWorkingLabel,
} from "@shared/contentAgentRuntimePresentation";
import {
  contentAgentPlanSummary,
  splitContentAgentRequest,
  type ContentAgentRequestSegment,
} from "@shared/contentAgentMultiStep";
import {
  useContentAgentExecutor,
  type ContentAgentButtonOptions,
  type ContentAgentRoutingContext,
} from "@/hooks/useContentAgentExecutor";

export type ContentAgentConversationControllerOptions = {
  deps: ContentAgentExecutorDeps;
  context?: ContentAgentRoutingContext;
  onActionResult?: (
    action: ContentAgentAction,
    result: ContentAgentToolResult
  ) => void | Promise<void>;
};

type PendingPlan = {
  segments: ContentAgentRequestSegment[];
  nextIndex: number;
  activeScriptId?: number | null;
};

function resultScriptId(result: ContentAgentToolResult): number | null {
  if (!result.artifact?.id) return null;
  if (result.artifact.kind !== "reel" && result.artifact.kind !== "script") return null;
  return result.artifact.id > 0 ? result.artifact.id : null;
}

/**
 * Stateful conversation controller for the SpyReels Content Agent.
 *
 * The UI does not interpret creator language. It appends the user turn, asks
 * the shared Agent router for creator-level actions, executes those actions
 * through the shared executor, then turns real results into receipts,
 * clarifications, or errors.
 *
 * Explicit multi-step requests are bounded to five steps. Each later step uses
 * the artifact produced by the previous step. If an asynchronous workflow has
 * started but has not produced the next artifact yet, the plan pauses instead
 * of pretending the following tools already ran.
 */
export function useContentAgentConversationController({
  deps,
  context = {},
  onActionResult,
}: ContentAgentConversationControllerOptions) {
  const { resolveMessage, executeAction, isRouting } = useContentAgentExecutor(deps);
  const nextTurnIdRef = useRef(1);
  const pendingActionRef = useRef<ContentAgentAction | null>(null);
  const pendingPlanRef = useRef<PendingPlan | null>(null);
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

  const appendAgentMessage = useCallback((text: string, detail?: string) => {
    appendTurn({
      id: nextTurnId(),
      role: "agent",
      kind: "message",
      text,
      detail,
      createdAt: Date.now(),
    });
  }, [appendTurn, nextTurnId]);

  const runResolvedAction = useCallback(async (
    action: ContentAgentAction,
    executionContext: ContentAgentExecutionContext = {}
  ): Promise<ContentAgentToolResult | null> => {
    const startedAt = Date.now();
    setWorking(true);
    setWorkingLabel(contentAgentWorkingLabel(action));

    try {
      const result = await executeAction(action, executionContext);
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
      pendingPlanRef.current = null;
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

  const executePlanSegments = useCallback(async (
    segments: ContentAgentRequestSegment[],
    startIndex = 0,
    initialScriptId: number | null | undefined = context.activeScriptId
  ): Promise<ContentAgentToolResult | null> => {
    let currentScriptId = initialScriptId ?? context.activeScriptId ?? null;
    let lastResult: ContentAgentToolResult | null = null;

    for (let index = startIndex; index < segments.length; index += 1) {
      const segment = segments[index];
      setWorking(true);
      setWorkingLabel(`Understanding step ${index + 1} of ${segments.length}`);

      let action: ContentAgentAction;
      try {
        action = await resolveMessage(segment.text, {
          ...context,
          activeScriptId: currentScriptId,
        });
      } catch (error) {
        setWorking(false);
        setWorkingLabel(null);
        pendingPlanRef.current = null;
        appendTurn(errorTurn(
          nextTurnId(),
          error instanceof Error && error.message.trim()
            ? error.message
            : "I could not understand the next step."
        ));
        return null;
      }

      setWorking(false);
      setWorkingLabel(null);
      const result = await runResolvedAction(action, { inputText: segment.text });
      if (!result) return null;
      lastResult = result;

      const producedScriptId = resultScriptId(result);
      if (producedScriptId) currentScriptId = producedScriptId;

      if (result.status === "requires_input") {
        pendingPlanRef.current = index + 1 < segments.length
          ? { segments, nextIndex: index + 1, activeScriptId: currentScriptId }
          : null;
        return result;
      }

      if (result.status === "failed") {
        pendingPlanRef.current = null;
        return result;
      }

      if (
        result.status === "started" &&
        index + 1 < segments.length &&
        !producedScriptId
      ) {
        pendingPlanRef.current = {
          segments,
          nextIndex: index + 1,
          activeScriptId: currentScriptId,
        };
        appendAgentMessage(
          "The next step needs the new Reel to be ready first.",
          "I paused the remaining actions instead of running them against the wrong artifact."
        );
        return result;
      }
    }

    pendingPlanRef.current = null;
    return lastResult;
  }, [appendAgentMessage, appendTurn, context, nextTurnId, resolveMessage, runResolvedAction]);

  const continuePendingPlan = useCallback(async (
    completedResult: ContentAgentToolResult,
    fallbackScriptId?: number | null
  ) => {
    const pendingPlan = pendingPlanRef.current;
    if (!pendingPlan || completedResult.status === "requires_input") return completedResult;

    const currentScriptId =
      resultScriptId(completedResult) ??
      fallbackScriptId ??
      pendingPlan.activeScriptId ??
      null;

    if (completedResult.status === "started" && !resultScriptId(completedResult)) {
      return completedResult;
    }

    pendingPlanRef.current = null;
    return executePlanSegments(
      pendingPlan.segments,
      pendingPlan.nextIndex,
      currentScriptId
    );
  }, [executePlanSegments]);

  const sendMessage = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || working) return null;

    appendUserTurn(trimmed);

    const pending = pendingActionRef.current;
    if (pending) {
      const result = await runResolvedAction(
        continueContentAgentAction(pending, trimmed),
        { inputText: trimmed }
      );
      return result ? continuePendingPlan(result, pending.scriptId) : null;
    }

    const segments = splitContentAgentRequest(trimmed);
    if (segments.length > 1) {
      const summary = contentAgentPlanSummary(segments);
      if (summary) {
        appendAgentMessage(
          `I’ll handle this in ${summary}.`,
          "I’ll use the result of each step as the input for the next one."
        );
      }
      return executePlanSegments(segments);
    }

    setWorking(true);
    setWorkingLabel(contentAgentWorkingLabel(null));
    const routeStartedAt = Date.now();

    try {
      const action = await resolveMessage(trimmed, context);
      setWorking(false);
      setWorkingLabel(null);
      return runResolvedAction(action, { inputText: trimmed });
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
  }, [appendAgentMessage, appendTurn, appendUserTurn, context, continuePendingPlan, executePlanSegments, nextTurnId, resolveMessage, runResolvedAction, working]);

  const resumePlan = useCallback(async (activeScriptId: number) => {
    const pendingPlan = pendingPlanRef.current;
    if (!pendingPlan || !Number.isFinite(activeScriptId) || activeScriptId <= 0 || working) {
      return null;
    }
    pendingPlanRef.current = null;
    return executePlanSegments(
      pendingPlan.segments,
      pendingPlan.nextIndex,
      activeScriptId
    );
  }, [executePlanSegments, working]);

  const runButton = useCallback(async (
    tool: ContentAgentToolName,
    options: ContentAgentButtonOptions = {}
  ) => {
    if (working) return null;
    const action = contentAgentActionForButton(tool, options);
    return runResolvedAction(action, {
      inputText: options.inputText?.trim() || undefined,
    });
  }, [runResolvedAction, working]);

  const clearConversation = useCallback(() => {
    pendingActionRef.current = null;
    pendingPlanRef.current = null;
    setPendingTool(null);
    setTurns([]);
    setWorking(false);
    setWorkingLabel(null);
    setWorkDurationSeconds(null);
  }, []);

  const placeholder = pendingTool === "schedule_filming"
    ? "Tell Agent when and where you want to film it..."
    : pendingTool === "remake_social_video"
      ? "Paste the Instagram, TikTok, or YouTube link..."
      : "Ask Agent to create, change, save, schedule, download, or repurpose this content...";

  return {
    turns,
    working: working || isRouting,
    workingLabel,
    workDurationSeconds,
    pendingTool,
    hasPausedPlan: pendingPlanRef.current != null,
    placeholder,
    sendMessage,
    resumePlan,
    runButton,
    clearConversation,
  };
}