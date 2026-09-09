import { useCallback, useEffect, useRef, useState } from "react";
import {
  contentAgentActionForButton,
  type ContentAgentArtifactRef,
  type ContentAgentExecutionContext,
  type ContentAgentExecutorDeps,
  type ContentAgentToolResult,
} from "@shared/contentAgentExecutor";
import {
  CONTENT_AGENT_TOOL_REGISTRY,
  type ContentAgentAction,
  type ContentAgentToolName,
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
import {
  createAgentRun,
  loadLatestAgentRun,
  updateAgentRun,
  updateAgentToolRun,
  type ContentAgentRunStatus,
} from "@/lib/contentAgentRunApi";

export type ContentAgentConversationControllerOptions = {
  deps: ContentAgentExecutorDeps;
  context?: ContentAgentRoutingContext;
  onActionResult?: (
    action: ContentAgentAction,
    result: ContentAgentToolResult
  ) => void | Promise<void>;
  persistence?: {
    enabled?: boolean;
    restoreLatest?: boolean;
    artifact?: ContentAgentArtifactRef | null;
  };
};

type PendingPlan = {
  segments: ContentAgentRequestSegment[];
  nextIndex: number;
  activeScriptId?: number | null;
};

type RunActionOptions = {
  stepIndex?: number;
  finalStep?: boolean;
};

function resultScriptId(result: ContentAgentToolResult): number | null {
  if (!result.artifact?.id) return null;
  if (result.artifact.kind !== "reel" && result.artifact.kind !== "script") return null;
  return result.artifact.id > 0 ? result.artifact.id : null;
}

function toolRunStatus(result: ContentAgentToolResult): ContentAgentRunStatus {
  if (result.status === "requires_input") return "waiting_for_input";
  if (result.status === "failed") return "failed";
  if (result.status === "started") return "running";
  return "completed";
}

function overallRunStatus(
  result: ContentAgentToolResult,
  finalStep: boolean
): ContentAgentRunStatus {
  if (result.status === "requires_input") return "waiting_for_input";
  if (result.status === "failed") return "failed";
  if (result.status === "started") return "running";
  return finalStep ? "completed" : "running";
}

function isContentAgentAction(value: unknown): value is ContentAgentAction {
  if (!value || typeof value !== "object") return false;
  const tool = (value as { tool?: unknown }).tool;
  return typeof tool === "string" && tool in CONTENT_AGENT_TOOL_REGISTRY;
}

function isContentAgentToolResult(value: unknown): value is ContentAgentToolResult {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return ["completed", "started", "requires_input", "failed"].includes(String(status));
}

function artifactForRun(
  result: ContentAgentToolResult,
  fallback?: ContentAgentArtifactRef | null
): ContentAgentArtifactRef | null {
  // The Reel remains the source of truth after save/download/health actions.
  // Only replace it when a tool actually produces a Reel artifact.
  if (result.artifact?.kind === "reel" && result.artifact.id) {
    return result.artifact;
  }
  return fallback ?? null;
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
  persistence,
}: ContentAgentConversationControllerOptions) {
  const { resolveMessage, executeAction, isRouting } = useContentAgentExecutor(deps);
  const nextTurnIdRef = useRef(1);
  const pendingActionRef = useRef<ContentAgentAction | null>(null);
  const pendingPlanRef = useRef<PendingPlan | null>(null);
  const pendingStepIndexRef = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);
  const runStepRef = useRef(0);
  const runStatusRef = useRef<ContentAgentRunStatus | null>(null);
  const restoreKeyRef = useRef<string | null>(null);
  const [turns, setTurns] = useState<ContentAgentTurn[]>([]);
  const [working, setWorking] = useState(false);
  const [workingLabel, setWorkingLabel] = useState<string | null>(null);
  const [workDurationSeconds, setWorkDurationSeconds] = useState<number | null>(null);
  const [pendingTool, setPendingTool] = useState<ContentAgentToolName | null>(null);

  const persistenceEnabled = Boolean(persistence?.enabled);
  const currentArtifact: ContentAgentArtifactRef | null =
    persistence?.artifact ??
    (context.activeScriptId
      ? { kind: "reel", id: context.activeScriptId }
      : null);

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

  const beginPersistedRun = useCallback(async (request: string) => {
    if (!persistenceEnabled) {
      runIdRef.current = null;
      runStepRef.current = 0;
      runStatusRef.current = null;
      return;
    }

    try {
      const run = await createAgentRun({ request, artifact: currentArtifact });
      runIdRef.current = run.id;
      runStepRef.current = 0;
      runStatusRef.current = "running";
    } catch (error) {
      // Persistence is reliability infrastructure, not a reason to block the
      // creator from using the Agent if storage is temporarily unavailable.
      console.warn("[ContentAgent] could not persist run", error);
      runIdRef.current = null;
      runStepRef.current = 0;
      runStatusRef.current = null;
    }
  }, [currentArtifact, persistenceEnabled]);

  const persistRunFailure = useCallback(async (message: string) => {
    const runId = runIdRef.current;
    if (!persistenceEnabled || !runId) return;
    runStatusRef.current = "failed";
    try {
      await updateAgentRun({
        runId,
        status: "failed",
        pendingTool: null,
        artifact: currentArtifact,
      });
    } catch (error) {
      console.warn("[ContentAgent] could not persist run failure", message, error);
    }
  }, [currentArtifact, persistenceEnabled]);

  const runResolvedAction = useCallback(async (
    action: ContentAgentAction,
    executionContext: ContentAgentExecutionContext = {},
    runOptions: RunActionOptions = {}
  ): Promise<ContentAgentToolResult | null> => {
    const startedAt = Date.now();
    const stepIndex = runOptions.stepIndex ?? runStepRef.current;
    const finalStep = runOptions.finalStep ?? true;
    const persistedRunId = runIdRef.current;

    setWorking(true);
    setWorkingLabel(contentAgentWorkingLabel(action));

    if (persistenceEnabled && persistedRunId) {
      try {
        await updateAgentToolRun({
          runId: persistedRunId,
          stepIndex,
          tool: action.tool,
          status: "running",
          action,
        });
        await updateAgentRun({
          runId: persistedRunId,
          status: "running",
          pendingTool: null,
          artifact: currentArtifact,
        });
        runStatusRef.current = "running";
      } catch (error) {
        console.warn("[ContentAgent] could not persist action start", error);
      }
    }

    try {
      const result = await executeAction(action, executionContext);
      appendTurn(contentAgentResultTurn(nextTurnId(), action, result));

      if (result.status === "requires_input") {
        pendingActionRef.current = action;
        pendingStepIndexRef.current = stepIndex;
        setPendingTool(action.tool);
      } else {
        pendingActionRef.current = null;
        pendingStepIndexRef.current = null;
        setPendingTool(null);
        runStepRef.current = Math.max(runStepRef.current, stepIndex + 1);
      }

      if (persistenceEnabled && persistedRunId) {
        const toolStatus = toolRunStatus(result);
        const runStatus = overallRunStatus(result, finalStep);
        const artifact = artifactForRun(result, currentArtifact);
        try {
          await updateAgentToolRun({
            runId: persistedRunId,
            stepIndex,
            tool: action.tool,
            status: toolStatus,
            action,
            result,
          });
          await updateAgentRun({
            runId: persistedRunId,
            status: runStatus,
            pendingTool: result.status === "requires_input" ? action.tool : null,
            artifact,
          });
          runStatusRef.current = runStatus;
        } catch (error) {
          console.warn("[ContentAgent] could not persist action result", error);
        }
      }

      await onActionResult?.(action, result);
      return result;
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "I could not complete that action.";
      pendingActionRef.current = null;
      pendingPlanRef.current = null;
      pendingStepIndexRef.current = null;
      setPendingTool(null);
      appendTurn(errorTurn(nextTurnId(), message));

      if (persistenceEnabled && persistedRunId) {
        try {
          await updateAgentToolRun({
            runId: persistedRunId,
            stepIndex,
            tool: action.tool,
            status: "failed",
            action,
            errorMessage: message,
          });
          await updateAgentRun({
            runId: persistedRunId,
            status: "failed",
            pendingTool: null,
            artifact: currentArtifact,
          });
          runStatusRef.current = "failed";
        } catch (persistError) {
          console.warn("[ContentAgent] could not persist action failure", persistError);
        }
      }
      return null;
    } finally {
      const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setWorkDurationSeconds(duration);
      setWorking(false);
      setWorkingLabel(null);
    }
  }, [appendTurn, currentArtifact, executeAction, nextTurnId, onActionResult, persistenceEnabled]);

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
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : "I could not understand the next step.";
        setWorking(false);
        setWorkingLabel(null);
        pendingPlanRef.current = null;
        appendTurn(errorTurn(nextTurnId(), message));
        await persistRunFailure(message);
        return null;
      }

      setWorking(false);
      setWorkingLabel(null);
      const result = await runResolvedAction(
        action,
        { inputText: segment.text },
        { stepIndex: index, finalStep: index === segments.length - 1 }
      );
      if (!result) return null;
      lastResult = result;

      const producedScriptId = resultScriptId(result);
      if (producedScriptId && result.artifact?.kind === "reel") {
        currentScriptId = producedScriptId;
      }

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
        !(result.artifact?.kind === "reel" && producedScriptId)
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
  }, [appendAgentMessage, appendTurn, context, nextTurnId, persistRunFailure, resolveMessage, runResolvedAction]);

  const continuePendingPlan = useCallback(async (
    completedResult: ContentAgentToolResult,
    fallbackScriptId?: number | null
  ) => {
    const pendingPlan = pendingPlanRef.current;
    if (!pendingPlan || completedResult.status === "requires_input") return completedResult;

    const currentScriptId =
      (completedResult.artifact?.kind === "reel" ? resultScriptId(completedResult) : null) ??
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
      const pendingPlan = pendingPlanRef.current;
      const stepIndex = pendingStepIndexRef.current ?? Math.max(0, runStepRef.current - 1);
      const result = await runResolvedAction(
        continueContentAgentAction(pending, trimmed),
        { inputText: trimmed },
        { stepIndex, finalStep: pendingPlan == null }
      );
      return result ? continuePendingPlan(result, pending.scriptId) : null;
    }

    if (pendingPlanRef.current && /^(continue|resume|keep going|go on)$/i.test(trimmed)) {
      const activeScriptId = pendingPlanRef.current.activeScriptId ?? context.activeScriptId;
      if (activeScriptId) {
        return executePlanSegments(
          pendingPlanRef.current.segments,
          pendingPlanRef.current.nextIndex,
          activeScriptId
        );
      }
    }

    await beginPersistedRun(trimmed);

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
      return runResolvedAction(action, { inputText: trimmed }, { stepIndex: 0, finalStep: true });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "I could not understand that request.";
      const duration = Math.max(1, Math.round((Date.now() - routeStartedAt) / 1000));
      setWorkDurationSeconds(duration);
      setWorking(false);
      setWorkingLabel(null);
      appendTurn(errorTurn(nextTurnId(), message));
      await persistRunFailure(message);
      return null;
    }
  }, [appendAgentMessage, appendTurn, appendUserTurn, beginPersistedRun, context, continuePendingPlan, executePlanSegments, nextTurnId, persistRunFailure, resolveMessage, runResolvedAction, working]);

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
    const request = options.inputText?.trim() || CONTENT_AGENT_TOOL_REGISTRY[tool].label;
    await beginPersistedRun(request);
    return runResolvedAction(
      action,
      { inputText: options.inputText?.trim() || undefined },
      { stepIndex: 0, finalStep: true }
    );
  }, [beginPersistedRun, runResolvedAction, working]);

  const clearConversation = useCallback(() => {
    const runId = runIdRef.current;
    if (
      persistenceEnabled &&
      runId &&
      (runStatusRef.current === "running" || runStatusRef.current === "waiting_for_input")
    ) {
      void updateAgentRun({
        runId,
        status: "cancelled",
        pendingTool: null,
        artifact: currentArtifact,
      }).catch((error) => {
        console.warn("[ContentAgent] could not cancel persisted run", error);
      });
    }

    pendingActionRef.current = null;
    pendingPlanRef.current = null;
    pendingStepIndexRef.current = null;
    runIdRef.current = null;
    runStepRef.current = 0;
    runStatusRef.current = null;
    setPendingTool(null);
    setTurns([]);
    setWorking(false);
    setWorkingLabel(null);
    setWorkDurationSeconds(null);
  }, [currentArtifact, persistenceEnabled]);

  useEffect(() => {
    if (!persistenceEnabled || persistence?.restoreLatest === false) return;
    const artifactId = currentArtifact?.id;
    if (!artifactId || artifactId <= 0) return;

    const key = `${currentArtifact.kind}:${artifactId}`;
    if (restoreKeyRef.current === key) return;
    restoreKeyRef.current = key;
    let cancelled = false;

    void loadLatestAgentRun()
      .then((data) => {
        if (cancelled || !data.run) return;
        if (data.run.currentArtifactId !== artifactId) return;
        if (
          data.run.currentArtifactKind &&
          data.run.currentArtifactKind !== currentArtifact.kind
        ) return;

        const restored: ContentAgentTurn[] = [];
        let nextId = 1;
        restored.push({
          id: nextId++,
          role: "user",
          kind: "message",
          text: data.run.request,
          createdAt: Date.now(),
        });

        const orderedTools = [...data.tools].sort((a, b) => a.stepIndex - b.stepIndex);
        for (const tool of orderedTools) {
          const action = isContentAgentAction(tool.argsJson) ? tool.argsJson : null;
          const result = isContentAgentToolResult(tool.resultJson) ? tool.resultJson : null;
          if (action && result) {
            restored.push(contentAgentResultTurn(nextId++, action, result));
          } else if (tool.status === "failed" && tool.errorMessage?.trim()) {
            restored.push(errorTurn(nextId++, tool.errorMessage.trim()));
          }
        }

        const latestTool = orderedTools[orderedTools.length - 1];
        if (data.run.status === "running" && latestTool?.status === "running") {
          restored.push({
            id: nextId++,
            role: "agent",
            kind: "message",
            text: "I restored your unfinished Agent work.",
            detail: "I will not repeat an in-flight action automatically. If the artifact is ready, say continue.",
            createdAt: Date.now(),
          });
        }

        setTurns(restored);
        nextTurnIdRef.current = nextId;
        runIdRef.current = data.run.id;
        runStatusRef.current = data.run.status;
        runStepRef.current = latestTool ? latestTool.stepIndex + 1 : 0;

        const segments = splitContentAgentRequest(data.run.request);
        const nextPlanIndex = latestTool ? latestTool.stepIndex + 1 : 0;
        if (segments.length > nextPlanIndex && data.run.status === "running") {
          pendingPlanRef.current = {
            segments,
            nextIndex: nextPlanIndex,
            activeScriptId: artifactId,
          };
        }

        if (
          data.run.status === "waiting_for_input" &&
          latestTool &&
          isContentAgentAction(latestTool.argsJson)
        ) {
          pendingActionRef.current = latestTool.argsJson;
          pendingStepIndexRef.current = latestTool.stepIndex;
          setPendingTool(latestTool.argsJson.tool);
          if (segments.length > latestTool.stepIndex + 1) {
            pendingPlanRef.current = {
              segments,
              nextIndex: latestTool.stepIndex + 1,
              activeScriptId: artifactId,
            };
          }
        }
      })
      .catch((error) => {
        if (!cancelled) console.warn("[ContentAgent] could not restore latest run", error);
      });

    return () => {
      cancelled = true;
    };
  }, [currentArtifact?.id, currentArtifact?.kind, persistence?.restoreLatest, persistenceEnabled]);

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
