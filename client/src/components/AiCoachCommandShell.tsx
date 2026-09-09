import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CalendarDays, Link2, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type CoachCapabilityId,
  type StudioPrefillMeta,
} from "@shared/studioCoachUi";
import type { CoachModeAction } from "@shared/coachModeActions";
import type { StarterChip } from "@shared/ideaStarterPrompts";
import { cn } from "@/lib/utils";
import { useAutoGrowTextarea } from "@/hooks/useAutoGrowTextarea";
import {
  extractSocialSource,
  looksLikeExistingScript,
} from "@shared/contentAgentTools";
import { useAiCoachCommandAgentController } from "@/hooks/useAiCoachCommandAgentController";

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

type InputIntent = {
  label: string;
  helper: string;
  platform: string | null;
  icon: "idea" | "link" | "script";
};

function inferInputIntent(value: string): InputIntent | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const social = extractSocialSource(trimmed);
  if (social) {
    return {
      label: `${social.platformLabel} link detected`,
      helper: "Agent will load the source and start the real remake workflow using your creator profile.",
      platform: social.platformLabel,
      icon: "link",
    };
  }

  if (looksLikeExistingScript(trimmed)) {
    return {
      label: "Existing script detected",
      helper: "Agent will keep your pasted words, structure them as a Reel, then keep the same content context for edits.",
      platform: null,
      icon: "script",
    };
  }

  return {
    label: "Reel idea detected",
    helper: "Agent will use your profile, compare strong directions, and write the best version.",
    platform: null,
    icon: "idea",
  };
}

export function AiCoachCommandShell({
  description,
  onDescriptionChange,
  onSubmit,
  isBusy,
  attachedContext,
  onClearPlanContext,
  heroSubhead,
  nichePill = null,
}: AiCoachCommandShellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [promptReady, setPromptReady] = useState(false);
  const intent = useMemo(() => inferInputIntent(description), [description]);
  const agent = useAiCoachCommandAgentController({
    description,
    attachedPlanCardId: attachedContext?.planCardId,
    onDescriptionChange,
    onWriteIdea: onSubmit,
  });
  const busy = isBusy || agent.isBusy;

  useAutoGrowTextarea(textareaRef, description);

  useEffect(() => {
    if (busy) {
      setPromptReady(false);
      return;
    }
    setPromptReady(description.trim().length >= 10);
  }, [description, busy]);

  const handleSubmitRequest = async () => {
    if (busy || !promptReady) return;
    await agent.submit();
  };

  const submitDisabled = !promptReady || busy;
  const nicheLabel = nichePill?.trim() || heroSubhead?.split("·")[0]?.replace(/^Scripts for\s*/i, "").trim() || "your niche";

  return (
    <>
      <div className="flex min-h-[calc(80vh-4rem)] flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[760px]">
          <div className="mb-8 text-center sm:mb-10">
            <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-500">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <h1 className="text-[1.9rem] font-semibold tracking-tight text-foreground sm:text-[2.35rem]">
              What do you want to create today?
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-[15px]">
              For <span className="font-medium text-foreground/80">{nicheLabel}</span> · Short-form video
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              Instagram Reels · TikTok · YouTube Shorts
            </p>
          </div>

          <div
            className={cn(
              "overflow-hidden rounded-[26px] border bg-card/80 shadow-[0_18px_70px_rgba(0,0,0,0.12)] transition-colors",
              busy ? "border-violet-500/45" : "border-border/80"
            )}
          >
            <div className="max-h-[calc(1.6rem*9+2rem)] overflow-y-auto">
              <Textarea
                ref={textareaRef}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || submitDisabled || !description.trim()) return;
                  if (e.shiftKey || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  void handleSubmitRequest();
                }}
                disabled={busy}
                name="spyreels-agent-prompt"
                autoComplete="off"
                autoCorrect="on"
                spellCheck
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                placeholder="Describe an idea, paste a script, or paste an Instagram / TikTok / YouTube link..."
                className="min-h-[118px] resize-none border-0 bg-transparent px-6 py-5 text-[16px] leading-relaxed shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
                autoFocus
              />
            </div>

            <div className="flex min-h-14 flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
              {attachedContext?.planCardTitle ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs text-violet-500">
                  <CalendarDays className="h-3 w-3" />
                  {attachedContext.planCardDay ? `Day ${attachedContext.planCardDay}` : "Plan idea"}
                  <button type="button" onClick={onClearPlanContext} aria-label="Remove plan context">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : intent ? (
                <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  {intent.icon === "link" ? <Link2 className="h-3.5 w-3.5 text-violet-500" /> : <span className="h-2 w-2 rounded-full bg-violet-500" />}
                  <span className="truncate">{busy ? "Agent is working" : intent.label}</span>
                </span>
              ) : null}

              <Button
                size="icon"
                className="ml-auto h-10 w-10 rounded-full bg-violet-600 hover:bg-violet-700"
                onClick={() => void handleSubmitRequest()}
                disabled={submitDisabled}
                aria-label="Send to Agent"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" aria-hidden />}
              </Button>
            </div>
          </div>

          {intent ? (
            <div className="mx-auto mt-5 max-w-[680px] rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground/85">
                {intent.icon === "script" ? "Working from your existing script." : intent.icon === "link" ? `Remaking from ${intent.platform}.` : "Creating a Reel from your idea."}
              </span>{" "}
              {intent.helper}
            </div>
          ) : null}
        </div>
      </div>
      {agent.RemakeDialogs}
    </>
  );
}
