import { useEffect, useRef, useState } from "react";
import { ArrowUp, CalendarDays, Loader2, Sparkles, X } from "lucide-react";
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
import type { StarterChip } from "@shared/ideaStarterPrompts";
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
  writeScriptHeader: string;
  nichePill?: string | null;
  starterChips?: StarterChip[];
};

/**
 * Claude / Perplexity style empty state: short greeting, one composer,
 * compact chips. Never dump onboarding bios into the hero.
 */
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
  writeScriptHeader,
  nichePill = null,
  starterChips = [],
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
    <div className="flex min-h-[calc(80vh-4rem)] flex-1 items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center sm:mb-10">
          <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground sm:text-3xl">
            What do you want to create today?
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground sm:text-[15px]">
            {heroSubhead}
          </p>
          {nichePill ? (
            <p className="mt-3 inline-flex items-center rounded-full border border-border/80 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              {nichePill}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "rounded-3xl border bg-card/80 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition-colors",
            isStreaming ? "border-primary/50" : "border-border/80"
          )}
        >
          <div className="max-h-[calc(1.55rem*8+2rem)] overflow-y-auto">
            <Textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || submitDisabled || !description.trim()) return;
                if (e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                onSubmit();
              }}
              disabled={isStreaming}
              name="spyreels-ai-coach-prompt"
              autoComplete="off"
              autoCorrect="on"
              spellCheck
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              placeholder="Describe your Reel idea..."
              className="min-h-[72px] resize-none border-0 bg-transparent px-5 py-4 text-[15px] leading-relaxed shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-0">
            {attachedContext?.planCardTitle ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                <CalendarDays className="h-3 w-3" />
                {attachedContext.planCardDay
                  ? `Day ${attachedContext.planCardDay}`
                  : "Spark"}
                <button type="button" onClick={onClearPlanContext} aria-label="Remove plan context">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : null}

            <div className="ml-auto">
              <Button
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={onSubmit}
                disabled={submitDisabled}
                aria-label="Write script"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
          </div>
        </div>

        {starterChips.length > 0 && !description.trim() && !activeCapability ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {starterChips.slice(0, 3).map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={isStreaming || isBusy}
                onClick={() => {
                  onDescriptionChange(chip.value);
                  textareaRef.current?.focus();
                }}
                className="max-w-full rounded-full border border-border/70 bg-background/50 px-3.5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
              >
                <span className="line-clamp-1">{chip.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-8" ref={modePanelRef}>
          <div className="flex flex-wrap justify-center gap-2">
            {COACH_CAPABILITIES.map((cap) => (
              <button
                key={cap.id}
                type="button"
                onClick={() => handleModeClick(cap.id)}
                disabled={isStreaming}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                  activeCapability === cap.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border/70 bg-transparent text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
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
                  ? writeScriptHeader
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
