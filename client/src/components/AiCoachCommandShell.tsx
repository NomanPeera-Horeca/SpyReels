import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CalendarDays, Link2, Loader2, Sparkles, X } from "lucide-react";
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
import { trpc } from "@/lib/trpc";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { ingestUrlAndStartLibraryRemake } from "@/lib/ingestUrlAndStartLibraryRemake";
import { toast } from "sonner";

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

type SocialSource = {
  url: string;
  platform: "Instagram Reels" | "TikTok" | "YouTube Shorts";
};

function findSocialSource(value: string): SocialSource | null {
  const matches = value.match(/https?:\/\/[^\s]+/gi) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[),.;!?]+$/, "");
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      if (host === "instagram.com" || host.endsWith(".instagram.com")) {
        return { url, platform: "Instagram Reels" };
      }
      if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
        return { url, platform: "TikTok" };
      }
      if (
        host === "youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "youtu.be" ||
        host.endsWith(".youtu.be")
      ) {
        return { url, platform: "YouTube Shorts" };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function inferInputIntent(value: string): InputIntent | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const social = findSocialSource(trimmed);
  if (social) {
    return {
      label: `${social.platform} link detected`,
      helper: "I will load the source and start the real remake workflow using your creator profile.",
      platform: social.platform,
      icon: "link",
    };
  }

  const lineCount = trimmed.split(/\n+/).filter(Boolean).length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const looksLikeScript = lineCount >= 4 || wordCount >= 90;

  if (looksLikeScript) {
    return {
      label: "Existing script detected",
      helper: "I will keep your pasted words, structure them as a Reel, then you can keep editing with Agent.",
      platform: null,
      icon: "script",
    };
  }

  return {
    label: "Reel idea detected",
    helper: "I will use your profile, compare strong directions, and write the best version.",
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
  const [linkBusy, setLinkBusy] = useState(false);
  const [promptReady, setPromptReady] = useState(false);
  const intent = useMemo(() => inferInputIntent(description), [description]);
  const trpcUtils = trpc.useUtils();
  const addByUrlMutation = trpc.collected.addByUrl.useMutation();
  const convertRoughMutation = trpc.studio.convertRough.useMutation();
  const { startRemake, RemakeDialogs } = useLibraryRemakeChain();
  const conversionBusy = convertRoughMutation.isPending;

  useAutoGrowTextarea(textareaRef, description);

  useEffect(() => {
    return () => streamAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (isStreaming || linkBusy || conversionBusy) {
      setPromptReady(false);
      return;
    }
    setPromptReady(description.trim().length >= 10);
  }, [description, isStreaming, linkBusy, conversionBusy]);

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
    if (isStreaming || isBusy || linkBusy || conversionBusy) return;
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

  const handleSubmitRequest = async () => {
    if (isBusy || isStreaming || linkBusy || conversionBusy) return;

    const social = findSocialSource(description);
    if (social) {
      setLinkBusy(true);
      try {
        await ingestUrlAndStartLibraryRemake(social.url, {
          addByUrl: async (url) => {
            const added = await addByUrlMutation.mutateAsync({ url });
            await trpcUtils.collected.list.invalidate();
            return { id: added.id, duplicate: added.duplicate };
          },
          fetchCollectedList: () => trpcUtils.collected.list.fetch(undefined, { staleTime: 0 }),
          startRemake,
        });
        onDescriptionChange("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load that video. Try again.");
      } finally {
        setLinkBusy(false);
      }
      return;
    }

    if (intent?.icon === "script") {
      const roughScript = description.trim();
      if (roughScript.length > 12000) {
        toast.error("That script is too long. Keep it under 12,000 characters.");
        return;
      }
      try {
        const converted = await convertRoughMutation.mutateAsync({ roughScript });
        onDescriptionChange("");
        window.location.assign(`/studio?script=${converted.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not convert that script. Try again.");
      }
      return;
    }

    onSubmit();
  };

  const submitDisabled = !promptReady || isBusy || isStreaming || linkBusy || conversionBusy;
  const secondaryCapabilities = COACH_CAPABILITIES.filter((cap) => cap.id !== "write_script");
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
              isStreaming || linkBusy || conversionBusy ? "border-violet-500/45" : "border-border/80"
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
                disabled={isStreaming || linkBusy || conversionBusy}
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
                  <span className="truncate">{conversionBusy ? "Converting your script" : intent.label}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/60">Agent adapts to what you give it.</span>
              )}

              <Button
                size="icon"
                className="ml-auto h-10 w-10 rounded-full bg-violet-600 hover:bg-violet-700"
                onClick={() => void handleSubmitRequest()}
                disabled={submitDisabled}
                aria-label="Create script"
              >
                {isBusy || linkBusy || conversionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" aria-hidden />}
              </Button>
            </div>
          </div>

          {starterChips.length > 0 && !description.trim() && !activeCapability ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {starterChips.slice(0, 3).map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  disabled={isStreaming || isBusy || linkBusy || conversionBusy}
                  onClick={() => {
                    onDescriptionChange(chip.value);
                    textareaRef.current?.focus();
                  }}
                  className="max-w-full rounded-full border border-border/70 bg-background/40 px-4 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-violet-500/30 hover:bg-violet-500/5 hover:text-foreground disabled:opacity-50"
                >
                  <span className="line-clamp-1">{chip.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {intent ? (
            <div className="mx-auto mt-5 max-w-[680px] rounded-2xl border border-border/60 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground/85">
                {intent.icon === "script" ? "Working from your existing script." : intent.icon === "link" ? `Remaking from ${intent.platform}.` : "Creating a Reel from your idea."}
              </span>{" "}
              {intent.helper}
            </div>
          ) : null}

          <div className="mt-9" ref={modePanelRef}>
            <p className="mb-3 text-center text-xs text-muted-foreground">More ways to create</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              {secondaryCapabilities.map((cap) => (
                <button
                  key={cap.id}
                  type="button"
                  onClick={() => onCapabilitySelect(activeCapability === cap.id ? null : cap.id)}
                  disabled={isStreaming || linkBusy || conversionBusy}
                  className={cn(
                    "text-sm transition-colors",
                    activeCapability === cap.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  title={cap.hint}
                >
                  {cap.label}
                </button>
              ))}
            </div>

            {activeCapability ? (
              <div className="mx-auto mt-4 max-w-xl overflow-hidden rounded-2xl border border-border/70 bg-card">
                <p className="border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">
                  {activeCapability === "write_script" ? writeScriptHeader : COACH_MODE_PANEL_HEADERS[activeCapability]}
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
                      disabled={isStreaming || isBusy || linkBusy || conversionBusy}
                      onClick={() => void handleActionClick(action)}
                      className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-violet-500/5 disabled:opacity-50"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-sm text-violet-500">
                        {action.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{action.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{action.subtitle}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {RemakeDialogs}
    </>
  );
}
