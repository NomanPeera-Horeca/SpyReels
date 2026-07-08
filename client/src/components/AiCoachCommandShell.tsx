import { useEffect, useRef, useState } from "react";
import { CalendarDays, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  COACH_CAPABILITIES,
  type CoachCapabilityId,
  type StudioPrefillMeta,
} from "@shared/studioCoachUi";
import {
  COACH_MODE_PANEL_HEADERS,
  type CoachModeAction,
} from "@shared/coachModeActions";
import { cn } from "@/lib/utils";
import { useAutoGrowTextarea } from "@/hooks/useAutoGrowTextarea";
import { streamComposerText } from "@/lib/streamComposerText";

type AiCoachCommandShellProps = {
  description: string;
  onDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  isBusy: boolean;
  attachedContext: StudioPrefillMeta | null;
  onClearPlanContext: () => void;
  activeCapability: CoachCapabilityId | null;
  onCapabilitySelect: (id: CoachCapabilityId | null) => void;
  modeActions: CoachModeAction[];
  onActionApplied: (action: CoachModeAction) => void;
  heroSubhead: string;
  writePanelHeader: string;
};

export function AiCoachCommandShell({
  description,
  onDescriptionChange,
  onSubmit,
  isBusy,
  attachedContext,
  onClearPlanContext,
  activeCapability,
  onCapabilitySelect,
  modeActions,
  onActionApplied,
  heroSubhead,
  writePanelHeader,
}: AiCoachCommandShellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const modePanelRef = useRef<HTMLDivElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [promptReady, setPromptReady] = useState(false);

  useAutoGrowTextarea(textareaRef, description);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (isStreaming) {
      setPromptReady(false);
      return;
    }
    setPromptReady(description.trim().length >= 10);
  }, [description, isStreaming]);

  // Click outside the mode pills + suggestion list closes the listicle.
  useEffect(() => {
    if (!activeCapability) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || !modePanelRef.current) return;
      if (modePanelRef.current.contains(target)) return;
      onCapabilitySelect(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [activeCapability, onCapabilitySelect]);

  const handleActionClick = async (action: CoachModeAction) => {
    if (isStreaming || isBusy) return;
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setIsStreaming(true);
    onDescriptionChange("");
    try {
      await streamComposerText(action.promptText, onDescriptionChange, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        onActionApplied(action);
        onCapabilitySelect(null);
      }
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    }
  };

  const submitDisabled = !promptReady || isBusy || isStreaming;

  const handleModeClick = (id: CoachCapabilityId) => {
    onCapabilitySelect(activeCapability === id ? null : id);
  };

  return (
    <div className="flex min-h-[calc(80vh-4rem)] flex-1 items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center sm:mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary sm:mb-5">
            <Sparkles className="h-4 w-4" />
            AI Coach
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            What do you want to create today?
          </h1>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">{heroSubhead}</p>
        </div>

        <div
          className={cn(
            "rounded-2xl border bg-card shadow-sm transition-colors",
            isStreaming ? "border-primary/55" : "border-border"
          )}
        >
          <div className="max-h-[calc(1.55rem*10+2.25rem)] overflow-y-auto">
            <Textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || submitDisabled || !description.trim()) return;
                // Enter / Cmd+Enter submit when ready; Shift+Enter inserts a newline.
                if (e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                onSubmit();
              }}
              disabled={isStreaming}
              placeholder="Describe your idea, or pick a mode below..."
              className="min-h-[56px] resize-none border-0 bg-transparent px-5 py-4 text-base leading-relaxed shadow-none focus-visible:ring-0"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {attachedContext?.planCardTitle ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                <CalendarDays className="h-3 w-3" />
                {attachedContext.planCardDay
                  ? `Day ${attachedContext.planCardDay}`
                  : attachedContext.planCardTitle.slice(0, 24)}
                <button type="button" onClick={onClearPlanContext} aria-label="Remove plan context">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null}

            <div className="ml-auto">
              <Button
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={onSubmit}
                disabled={submitDisabled}
                aria-label="Write script"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "→"}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-6" ref={modePanelRef}>
          <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
            Try AI Coach for...
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {COACH_CAPABILITIES.map((cap) => (
              <button
                key={cap.id}
                type="button"
                onClick={() => handleModeClick(cap.id)}
                disabled={isStreaming}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  activeCapability === cap.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                )}
                title={cap.hint}
              >
                {cap.label}
              </button>
            ))}
          </div>

          {activeCapability ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
              <p className="border-b border-border px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {activeCapability === "write_script"
                  ? writePanelHeader
                  : COACH_MODE_PANEL_HEADERS[activeCapability]}
              </p>
              {modeActions.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {activeCapability === "from_plan"
                    ? "Generate a 30-day plan first, then come back here."
                    : "Write a script first, then try this mode."}
                </p>
              ) : (
                modeActions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={isStreaming || isBusy}
                    onClick={() => void handleActionClick(action)}
                    className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5 disabled:opacity-50"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm text-primary">
                      {action.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{action.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {action.subtitle}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
