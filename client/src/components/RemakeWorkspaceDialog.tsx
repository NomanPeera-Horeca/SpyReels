import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  History,
  ImagePlus,
  Loader2,
  MessageCircle,
  Mic,
  Play,
  Scissors,
  Search,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import type { LibraryRemakeState } from "@/lib/libraryRemakeChainCore";
import { RemakeHowSpyReelsWritesDialog } from "@/components/RemakeHowSpyReelsWritesDialog";

type WorkspaceTab = "script" | "visuals" | "preview";
type EditorTab = "script" | "caption";
type ClarifyTarget = "script" | "caption" | "both";
type VisualMode = "home" | "results" | "search" | "generate" | "upload";

export type RemakeWorkspaceTarget = {
  scriptId: number | null;
  reelId: number | null;
  remakeKey: string;
};

type RemakeWorkspaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RemakeWorkspaceTarget | null;
  remakeState: LibraryRemakeState | null;
  onOpenTeleprompter?: (reelId: number, scriptId: number) => void;
  /** Local /dev preview seed when there is no saved script yet. */
  previewSeed?: { script: string; caption: string };
};

const MOCK_CLIPS = [
  {
    id: "1",
    label: "Kitchen path",
    description: "Restaurant owner entering the kitchen before service",
    bg: "linear-gradient(145deg,#6d3acb,#2e2459 48%,#111827)",
  },
  {
    id: "2",
    label: "Prep station",
    description: "Busy prep counter, POS screen and ticket rail",
    bg: "linear-gradient(145deg,#5540b6,#26335b 48%,#111827)",
  },
  {
    id: "3",
    label: "Service line",
    description: "Fast dinner service with cooks moving through the line",
    bg: "linear-gradient(145deg,#7c3aed,#44275f 48%,#17131d)",
  },
];

function firstHookLine(script: string): string {
  const line = script
    .split(/\n+/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "Your hook will show here";
  return line.replace(/^\[.*?\]\s*/, "").slice(0, 110);
}

function needsClarify(prompt: string): boolean {
  const p = prompt.toLowerCase();
  if (/\b(script and caption|both|everything)\b/.test(p)) return false;
  if (/\b(script|spoken|say|hook|lines?)\b/.test(p) && !/\b(caption|hashtag)\b/.test(p)) {
    return false;
  }
  if (/\b(caption|hashtag|cta under)\b/.test(p) && !/\b(script|spoken|say)\b/.test(p)) {
    return false;
  }
  return /\b(improve|better|fix|rewrite|update|change|polish)\b/.test(p);
}

function scriptsNearlyIdentical(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

export function RemakeWorkspaceDialog({
  open,
  onOpenChange,
  target,
  remakeState,
  onOpenTeleprompter,
  previewSeed,
}: RemakeWorkspaceDialogProps) {
  const scriptId = target?.scriptId ?? null;
  const utils = trpc.useUtils();
  const isPreview = Boolean(previewSeed) && scriptId == null;

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("script");
  const [editorTab, setEditorTab] = useState<EditorTab>("script");
  const [captionOpen, setCaptionOpen] = useState(false);
  const [script, setScript] = useState("");
  const [caption, setCaption] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [lastUserPrompt, setLastUserPrompt] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{
    userPrompt: string;
    scriptBefore: string;
    captionBefore: string;
    scriptDraft: string | null;
    captionDraft: string | null;
    applied: boolean;
    note: string;
  } | null>(null);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [status, setStatus] = useState("All changes saved");
  const [statusBusy, setStatusBusy] = useState(false);
  const [scriptUpdated, setScriptUpdated] = useState(false);
  const [captionUpdated, setCaptionUpdated] = useState(false);
  const [glowField, setGlowField] = useState<EditorTab | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<{
    field: EditorTab | "both";
    script: string;
    caption: string;
  } | null>(null);
  const [visualMode, setVisualMode] = useState<VisualMode>("home");
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [brollMatched, setBrollMatched] = useState(false);
  const hydratedIdRef = useRef<number | null>(null);

  const scriptQuery = trpc.scripts.get.useQuery(
    { id: scriptId ?? 0 },
    { enabled: open && scriptId != null && !isPreview, staleTime: 10_000 }
  );
  const onboardingQuery = trpc.onboarding.getState.useQuery(undefined, {
    enabled: open && !isPreview,
    staleTime: 60_000,
    retry: false,
  });

  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: () => {
      if (scriptId != null) void utils.scripts.get.invalidate({ id: scriptId });
      setStatus("All changes saved");
      setStatusBusy(false);
    },
    onError: (err) => {
      setStatusBusy(false);
      toast.error(err.message || "Could not save draft");
    },
  });
  const aiRewriteMutation = trpc.scripts.aiRewrite.useMutation();
  const grammarMutation = trpc.scripts.grammarCheck.useMutation();
  const captionMutation = trpc.scripts.generateCaption.useMutation();
  const suggestBrollMutation = trpc.scripts.suggestBroll.useMutation();

  const voiceSummary = useMemo(() => {
    const aud = onboardingQuery.data?.targetAudience?.trim();
    const biz = onboardingQuery.data?.businessDescription?.trim();
    if (aud && biz) {
      return `${biz.slice(0, 28)}${biz.length > 28 ? "…" : ""} · ${aud.slice(0, 32)}`;
    }
    if (aud) return aud.slice(0, 48);
    if (biz) return biz.slice(0, 48);
    return "Your voice · Edit to personalize";
  }, [onboardingQuery.data]);

  const isGenerating =
    remakeState?.stage === "transcribing" || remakeState?.stage === "generating";
  const progressPercent = remakeState?.progressPercent ?? 0;

  const visualMoments = useMemo(() => {
    const lines = script
      .split(/\n+/)
      .map((line) => line.trim().replace(/^\[.*?\]\s*/, ""))
      .filter(Boolean);
    return MOCK_CLIPS.map((clip, index) => ({
      ...clip,
      scriptLine: lines[index] || lines[0] || "Your script moment will show here",
    }));
  }, [script]);

  useEffect(() => {
    if (!open) {
      hydratedIdRef.current = null;
      return;
    }
    hydratedIdRef.current = null;
    setScript("");
    setCaption("");
    setWorkspaceTab("script");
    setEditorTab("script");
    setCaptionOpen(false);
    setLastUserPrompt(null);
    setAiSuggestion(null);
    setUndoTarget(null);
    setClarifyOpen(false);
    setPendingPrompt(null);
    setVisualMode("home");
    setSelectedClip(null);
    setBrollMatched(false);
    setStatus("All changes saved");
    setStatusBusy(false);
  }, [open, target?.remakeKey]);

  useEffect(() => {
    if (!open || scriptId == null) return;
    if (remakeState?.stage !== "ready") return;
    hydratedIdRef.current = null;
    void utils.scripts.get.invalidate({ id: scriptId });
  }, [open, remakeState?.stage, scriptId, utils.scripts.get]);

  useEffect(() => {
    if (!open) {
      hydratedIdRef.current = null;
      return;
    }
    if (previewSeed && scriptId == null) {
      setScript(previewSeed.script);
      setCaption(previewSeed.caption);
      return;
    }
    if (scriptId == null || !scriptQuery.data) return;

    const content = scriptQuery.data.content ?? "";
    if (!content.trim()) return;
    if (hydratedIdRef.current === scriptId) return;

    hydratedIdRef.current = scriptId;
    setScript(content);
    const cap = (scriptQuery.data as { generatedCaption?: string | null }).generatedCaption;
    setCaption(cap?.trim() || "");
  }, [open, scriptId, scriptQuery.data, previewSeed]);

  const flashUpdated = useCallback((field: EditorTab) => {
    if (field === "script") {
      setScriptUpdated(true);
      window.setTimeout(() => setScriptUpdated(false), 1800);
    } else {
      setCaptionUpdated(true);
      window.setTimeout(() => setCaptionUpdated(false), 1800);
    }
    setGlowField(field);
    window.setTimeout(() => setGlowField(null), 900);
  }, []);

  const applyAiToField = useCallback(
    async (prompt: string, field: ClarifyTarget) => {
      if (scriptId == null) {
        if (isPreview) {
          toast.message("Preview mode: AI rewrite needs a real remake script");
          return;
        }
        toast.message("Wait for your remake script to finish generating");
        return;
      }

      setAiBusy(true);
      setStatusBusy(true);
      setStatus("SpyReels is rewriting...");
      setLastUserPrompt(prompt);
      try {
        const iterating = aiSuggestion != null && !aiSuggestion.applied ? aiSuggestion : null;
        const scriptBefore = iterating?.scriptBefore ?? script;
        const captionBefore = iterating?.captionBefore ?? caption;
        let scriptDraft = iterating?.scriptDraft ?? null;
        let captionDraft = iterating?.captionDraft ?? null;

        if (field === "script" || field === "both") {
          const before = iterating?.scriptDraft ?? script;
          const useGrammar = /grammar|spelling|typo/i.test(prompt);
          const rewritten = useGrammar
            ? await grammarMutation.mutateAsync({
                scriptId,
                content: before,
                persist: false,
              })
            : await aiRewriteMutation.mutateAsync({
                scriptId,
                content: before,
                instruction: prompt,
                persist: false,
              });
          scriptDraft = rewritten.content;

          if (!useGrammar && scriptsNearlyIdentical(before, scriptDraft)) {
            toast.message("Rewrite looked unchanged. Trying a stronger pass...");
            const stronger = await aiRewriteMutation.mutateAsync({
              scriptId,
              content: before,
              instruction: `${prompt}. Rewrite more aggressively: new openings, simpler spoken lines, keep the same points.`,
              persist: false,
            });
            scriptDraft = stronger.content;
          }
        }

        if (field === "caption" || field === "both") {
          const before = iterating?.captionDraft ?? caption;
          let after = before;
          if (
            /hashtag/i.test(prompt) ||
            /rewrite the caption/i.test(prompt) ||
            /call to action|cta/i.test(prompt) ||
            !before.trim()
          ) {
            const gen = await captionMutation.mutateAsync({
              scriptId,
              content: (iterating?.scriptDraft ?? script) || before || "Reel script",
              style: "educational",
              captionLength: "medium",
              targetAudience: onboardingQuery.data?.targetAudience ?? undefined,
            });
            after = gen.caption;
            if (/hashtag/i.test(prompt) && gen.hashtags?.length) {
              after = `${gen.caption}\n\n${gen.hashtags
                .map((h: string) => (h.startsWith("#") ? h : `#${h}`))
                .join(" ")}`;
            }
          } else {
            const rewritten = await aiRewriteMutation.mutateAsync({
              scriptId,
              content: before || script,
              instruction: `Rewrite this Instagram Reel caption only. ${prompt}. Return only the caption text.`,
              persist: false,
            });
            after = rewritten.content;
          }
          captionDraft = after;
        }

        if (
          (scriptDraft != null && scriptsNearlyIdentical(script, scriptDraft)) ||
          (captionDraft != null &&
            caption.trim() &&
            scriptsNearlyIdentical(caption, captionDraft))
        ) {
          toast.message(
            "AI returned a very similar draft. Try Shorter or give SpyReels a more specific ask."
          );
        }

        setAiSuggestion({
          userPrompt: prompt,
          scriptBefore,
          captionBefore,
          scriptDraft: field === "caption" ? iterating?.scriptDraft ?? null : scriptDraft,
          captionDraft: field === "script" ? iterating?.captionDraft ?? null : captionDraft,
          applied: false,
          note:
            "Here is an improved version. Apply it when you like it, or ask for another tweak.",
        });

        setWorkspaceTab("script");
        if (field === "caption") {
          setEditorTab("caption");
          setCaptionOpen(true);
        } else {
          setEditorTab("script");
        }
        setStatus("All changes saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "AI update failed");
        setStatus("All changes saved");
      } finally {
        setAiBusy(false);
        setStatusBusy(false);
      }
    },
    [
      aiRewriteMutation,
      aiSuggestion,
      caption,
      captionMutation,
      grammarMutation,
      onboardingQuery.data?.targetAudience,
      script,
      scriptId,
      isPreview,
    ]
  );

  const applySuggestionToEditor = useCallback(async () => {
    if (!aiSuggestion || aiSuggestion.applied) return;
    const nextScript = aiSuggestion.scriptDraft;
    const nextCaption = aiSuggestion.captionDraft;

    setUndoTarget({
      field:
        nextScript != null && nextCaption != null
          ? "both"
          : nextCaption != null
            ? "caption"
            : "script",
      script: aiSuggestion.scriptBefore,
      caption: aiSuggestion.captionBefore,
    });

    if (nextScript != null) {
      setScript(nextScript);
      flashUpdated("script");
      setEditorTab("script");
    }
    if (nextCaption != null) {
      setCaption(nextCaption);
      flashUpdated("caption");
      setCaptionOpen(true);
      if (nextScript == null) setEditorTab("caption");
    }

    if (scriptId != null && (nextScript != null || nextCaption != null)) {
      try {
        await updateMutation.mutateAsync({
          id: scriptId,
          ...(nextScript != null ? { content: nextScript } : {}),
          ...(nextCaption != null ? { generatedCaption: nextCaption } : {}),
          changeType: "ai_rewrite",
          changeDescription: aiSuggestion.userPrompt.slice(0, 120),
        });
      } catch {
        /* mutation owns the error toast */
      }
    }

    setAiSuggestion({ ...aiSuggestion, applied: true });
    toast.success("Applied to your draft");
  }, [aiSuggestion, flashUpdated, scriptId, updateMutation]);

  const undoLastAiApply = useCallback(() => {
    if (!undoTarget) return;
    setScript(undoTarget.script);
    setCaption(undoTarget.caption);
    setUndoTarget(null);
    if (aiSuggestion) setAiSuggestion({ ...aiSuggestion, applied: false });
    toast.message("Reverted last AI apply");
  }, [aiSuggestion, undoTarget]);

  const resetAiConversation = useCallback(() => {
    setLastUserPrompt(null);
    setAiSuggestion(null);
    setUndoTarget(null);
    setClarifyOpen(false);
    setPendingPrompt(null);
  }, []);

  const runAiPrompt = useCallback(
    (raw: string, force?: EditorTab) => {
      const prompt = raw.trim();
      if (!prompt) return;
      setAiInput("");

      if (force) {
        void applyAiToField(prompt, force);
        return;
      }
      if (needsClarify(prompt)) {
        setPendingPrompt(prompt);
        setClarifyOpen(true);
        return;
      }
      if (/\b(caption|hashtag)\b/i.test(prompt) && !/\b(script|spoken|say|hook)\b/i.test(prompt)) {
        void applyAiToField(prompt, "caption");
        return;
      }
      void applyAiToField(prompt, editorTab);
    },
    [applyAiToField, editorTab]
  );

  const saveDraft = useCallback(
    async (quiet = false) => {
      if (scriptId == null) {
        if (isPreview) {
          if (!quiet) toast.message("Preview mode does not save changes");
          return false;
        }
        if (!quiet) toast.message("Script is still generating");
        return false;
      }

      setStatusBusy(true);
      setStatus("Saving...");
      try {
        await updateMutation.mutateAsync({
          id: scriptId,
          content: script,
          generatedCaption: caption || null,
          changeType: "manual_edit",
          changeDescription: "Remake workspace save",
        });
        if (!quiet) toast.success("Saved");
        return true;
      } catch {
        return false;
      }
    },
    [caption, isPreview, script, scriptId, updateMutation]
  );

  const closeWorkspace = useCallback(async () => {
    if (status === "Unsaved changes" && scriptId != null) {
      const saved = await saveDraft(true);
      if (!saved) return;
    }
    onOpenChange(false);
  }, [onOpenChange, saveDraft, scriptId, status]);

  const readyToFilm = useCallback(async () => {
    if (scriptId == null) {
      if (isPreview) {
        toast.message("Preview: this would save your script and open the teleprompter");
        return;
      }
      toast.message("Wait for your remake script to finish generating");
      return;
    }

    const saved = await saveDraft(true);
    if (!saved) return;
    toast.success("Ready to film");

    if (target?.reelId != null && onOpenTeleprompter) {
      onOpenTeleprompter(target.reelId, scriptId);
    }
  }, [isPreview, onOpenTeleprompter, saveDraft, scriptId, target?.reelId]);

  const matchBroll = useCallback(async () => {
    if (!script.trim()) return;
    if (scriptId == null) {
      if (isPreview) {
        setBrollMatched(true);
        setVisualMode("results");
        return;
      }
      toast.message("Wait for script generation to finish");
      return;
    }

    setStatusBusy(true);
    setStatus("Matching B-roll...");
    try {
      await suggestBrollMutation.mutateAsync({
        scriptId,
        content: script,
      });
      setBrollMatched(true);
      setVisualMode("results");
      toast.success("B-roll matched to your script");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "B-roll match failed");
    } finally {
      setStatusBusy(false);
      setStatus("All changes saved");
    }
  }, [isPreview, script, scriptId, suggestBrollMutation]);

  const versions = scriptQuery.data?.versions ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="remake-ws flex h-[min(92vh,850px)] max-h-[92vh] w-[min(1180px,100%)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-[#2d2940] bg-[#1c1926] p-0 text-[#f5f2fa] sm:max-w-[min(1180px,calc(100%-1.5rem))]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Remake workspace</DialogTitle>
            <DialogDescription>
              Improve your Reel script, choose visuals, preview it, and get ready to film.
            </DialogDescription>
          </DialogHeader>

          <style>{REMAKE_WS_CSS}</style>

          <header className="rw-head">
            <div className="rw-head-copy">
              <div className="rw-title-row">
                <span className="rw-title">Remake</span>
                <span className="rw-source-pill">Based on a viral Reel</span>
              </div>
              <span className="rw-subtitle">Turn the source into your version</span>
            </div>

            <nav className="rw-workspace-tabs" aria-label="Remake steps">
              {(
                [
                  ["script", "Script"],
                  ["visuals", "Visuals"],
                  ["preview", "Preview"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={workspaceTab === id ? "on" : ""}
                  onClick={() => setWorkspaceTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="rw-head-actions">
              <button
                type="button"
                className="rw-versions-btn"
                onClick={() => setHistoryOpen(true)}
              >
                <History className="h-4 w-4" />
                Versions
                <span>{versions.length}</span>
              </button>
              <button
                type="button"
                className="rw-x"
                title="Close"
                aria-label="Close remake workspace"
                onClick={() => void closeWorkspace()}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="rw-body">
            <aside className="rw-left">
              <div className="rw-ai-scroll">
                <div className="rw-ai-heading">
                  <div className="rw-ai-icon">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="rw-ai-copy">
                    <div className="rw-h3">AI Assist</div>
                    <p>Improve the Reel without leaving your workspace.</p>
                  </div>
                  {(lastUserPrompt || aiSuggestion) && !aiBusy ? (
                    <button
                      type="button"
                      className="rw-refresh"
                      title="Start a new AI request"
                      onClick={resetAiConversation}
                    >
                      ↻
                    </button>
                  ) : null}
                </div>

                {!lastUserPrompt && !aiSuggestion && !aiBusy ? (
                  <div className="rw-improve-block">
                    <div className="rw-section-label">Improve</div>
                    <div className="rw-quick-grid">
                      <button
                        type="button"
                        className="rw-quick-card"
                        disabled={isGenerating || !script.trim()}
                        onClick={() =>
                          runAiPrompt(
                            "Rewrite with a sharper opening hook in the first two lines. Keep the same points but change the wording.",
                            "script"
                          )
                        }
                      >
                        <Wand2 className="h-4 w-4" />
                        <span>Stronger hook</span>
                      </button>
                      <button
                        type="button"
                        className="rw-quick-card"
                        disabled={isGenerating || !script.trim()}
                        onClick={() =>
                          runAiPrompt(
                            "Rewrite so it is easier to say out loud: shorter sentences, simpler words, natural spoken rhythm. Keep the same points but change the wording.",
                            "script"
                          )
                        }
                      >
                        <Mic className="h-4 w-4" />
                        <span>Easier to say</span>
                      </button>
                      <button
                        type="button"
                        className="rw-quick-card"
                        disabled={isGenerating || !script.trim()}
                        onClick={() => runAiPrompt("Make it shorter", "script")}
                      >
                        <Scissors className="h-4 w-4" />
                        <span>Shorter</span>
                      </button>
                      <button
                        type="button"
                        className="rw-quick-card"
                        disabled={isGenerating || !script.trim()}
                        onClick={() =>
                          runAiPrompt(
                            "Rewrite in a more casual spoken tone, like talking to a friend on camera. Keep the same points but change the wording.",
                            "script"
                          )
                        }
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>More casual</span>
                      </button>
                    </div>
                  </div>
                ) : null}

                {lastUserPrompt ? (
                  <div className="rw-chat-user">
                    <span>You</span>
                    <p>{lastUserPrompt}</p>
                  </div>
                ) : null}

                {aiBusy ? (
                  <div className="rw-loading">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    SpyReels is rewriting...
                  </div>
                ) : null}

                {aiSuggestion && !aiBusy ? (
                  <div className="rw-suggest">
                    <div className="rw-suggest-top">
                      <Sparkles className="h-4 w-4" />
                      <strong>Suggestion ready</strong>
                    </div>
                    <p className="rw-suggest-note">{aiSuggestion.note}</p>

                    {aiSuggestion.scriptDraft != null ? (
                      <div className="rw-suggest-card">
                        <div className="rw-suggest-kicker">Script suggestion</div>
                        <pre>{aiSuggestion.scriptDraft}</pre>
                      </div>
                    ) : null}
                    {aiSuggestion.captionDraft != null ? (
                      <div className="rw-suggest-card">
                        <div className="rw-suggest-kicker">Caption suggestion</div>
                        <pre>{aiSuggestion.captionDraft}</pre>
                      </div>
                    ) : null}

                    <div className="rw-suggest-actions">
                      {!aiSuggestion.applied ? (
                        <button
                          type="button"
                          className="rw-btn rw-btn-primary rw-btn-sm"
                          onClick={() => void applySuggestionToEditor()}
                        >
                          Apply
                        </button>
                      ) : (
                        <span className="rw-applied">
                          <Check className="h-3.5 w-3.5" /> Applied
                        </span>
                      )}
                      {undoTarget ? (
                        <button type="button" className="rw-link" onClick={undoLastAiApply}>
                          Undo
                        </button>
                      ) : null}
                    </div>

                    <div className="rw-make-it">
                      <span>Make it</span>
                      {(
                        [
                          ["Make it shorter", "Shorter"],
                          ["Make it longer", "Longer"],
                          ["Make it bolder", "Bolder"],
                          ["Make it more casual", "More casual"],
                        ] as const
                      ).map(([prompt, label]) => (
                        <button
                          key={label}
                          type="button"
                          className="rw-link"
                          disabled={aiBusy}
                          onClick={() => {
                            const field: EditorTab =
                              aiSuggestion.scriptDraft != null ? "script" : "caption";
                            void applyAiToField(prompt, field);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rw-compose">
                <div className="rw-compose-label">Ask SpyReels</div>
                <div className="rw-ask">
                  <textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Make the hook less generic..."
                    disabled={aiBusy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        runAiPrompt(aiInput);
                      }
                    }}
                  />
                  <div className="rw-ask-bottom">
                    <button
                      type="button"
                      className="rw-voice-btn"
                      onClick={() => {
                        if (isPreview) {
                          toast.message("Log in to edit How SpyReels writes");
                          return;
                        }
                        setVoiceOpen(true);
                      }}
                    >
                      {voiceSummary}
                    </button>
                    <button
                      type="button"
                      className="rw-send"
                      title="Send"
                      disabled={aiBusy || !aiInput.trim()}
                      onClick={() => runAiPrompt(aiInput)}
                    >
                      →
                    </button>
                  </div>
                </div>

                {clarifyOpen ? (
                  <div className="rw-clarify">
                    Update the script, caption, or both?
                    <div>
                      {(
                        [
                          ["script", "Script"],
                          ["caption", "Caption"],
                          ["both", "Both"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className="rw-btn rw-btn-sm rw-btn-soft"
                          onClick={() => {
                            const prompt = pendingPrompt;
                            setClarifyOpen(false);
                            setPendingPrompt(null);
                            if (prompt) void applyAiToField(prompt, id);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="rw-how-link"
                  onClick={() => {
                    if (isPreview) {
                      toast.message("Log in to edit How SpyReels writes");
                      return;
                    }
                    setVoiceOpen(true);
                  }}
                >
                  How SpyReels writes
                </button>
              </div>
            </aside>

            <main className="rw-main-panel">
              {workspaceTab === "script" ? (
                <div className="rw-main-scroll rw-script-view">
                  {isGenerating ? (
                    <div className="rw-gen-banner">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>
                        {remakeState?.stage === "transcribing"
                          ? "Transcribing source Reel..."
                          : "Writing your remake script..."}
                      </span>
                      <strong>{progressPercent}%</strong>
                    </div>
                  ) : null}

                  {!isGenerating && scriptId == null && !previewSeed ? (
                    <div className="rw-gen-banner rw-gen-warning">
                      {remakeState?.stage === "error"
                        ? remakeState.errorMessage?.trim() ||
                          "Remake failed. Close and tap Remake to try again."
                        : remakeState?.stage === "inspiration"
                          ? remakeState.classificationReason?.trim() ||
                            "This video looks inspiration-only. Pick one with clear talking to remake."
                          : "Preparing your remake. If this stays empty, close and tap Remake again."}
                    </div>
                  ) : null}

                  <div className="rw-editor-head">
                    <div>
                      <div className="rw-editor-title-row">
                        <h3>Video script</h3>
                        {!isGenerating && script.trim() ? <span className="rw-ready-pill">Ready</span> : null}
                        <span className={`rw-updated${scriptUpdated ? " show" : ""}`}>Updated</span>
                      </div>
                      <p>What you will say on camera</p>
                    </div>
                    <button
                      type="button"
                      className="rw-tele-btn"
                      disabled={scriptId == null || target?.reelId == null}
                      onClick={() => {
                        if (scriptId == null || target?.reelId == null) {
                          toast.message("Script is not ready yet");
                          return;
                        }
                        onOpenTeleprompter?.(target.reelId, scriptId);
                      }}
                    >
                      <Play className="h-3.5 w-3.5" /> Open teleprompter
                    </button>
                  </div>

                  <textarea
                    className={`rw-editor${glowField === "script" ? " glow" : ""}`}
                    value={script}
                    onFocus={() => setEditorTab("script")}
                    onChange={(e) => {
                      setScript(e.target.value);
                      setEditorTab("script");
                      setStatusBusy(true);
                      setStatus("Unsaved changes");
                    }}
                    placeholder={
                      isGenerating
                        ? "Your script will appear here..."
                        : "Write or paste your spoken script..."
                    }
                    disabled={isGenerating && !script}
                  />

                  <div className="rw-ctx">
                    <button
                      type="button"
                      className="rw-btn rw-btn-soft rw-btn-sm"
                      disabled={aiBusy || !script.trim() || isGenerating}
                      onClick={() => runAiPrompt("Improve this Reel script in my voice", "script")}
                    >
                      Improve script
                    </button>
                    <button
                      type="button"
                      className="rw-btn rw-btn-ghost rw-btn-sm"
                      disabled={aiBusy || !script.trim() || isGenerating}
                      onClick={() => runAiPrompt("Fix the grammar", "script")}
                    >
                      Fix grammar
                    </button>
                    <button
                      type="button"
                      className="rw-btn rw-btn-ghost rw-btn-sm"
                      disabled={aiBusy || !script.trim() || isGenerating}
                      onClick={() => runAiPrompt("Make it shorter", "script")}
                    >
                      Make shorter
                    </button>
                  </div>

                  <div className="rw-caption-card">
                    <button
                      type="button"
                      className="rw-caption-toggle"
                      onClick={() => setCaptionOpen((value) => !value)}
                    >
                      <div>
                        <div className="rw-caption-title-row">
                          <strong>Caption</strong>
                          <span className={`rw-updated${captionUpdated ? " show" : ""}`}>Updated</span>
                        </div>
                        <span>Secondary publishing text</span>
                      </div>
                      {captionOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {captionOpen ? (
                      <div className="rw-caption-body">
                        <textarea
                          className={`rw-editor caption${glowField === "caption" ? " glow" : ""}`}
                          value={caption}
                          onFocus={() => setEditorTab("caption")}
                          onChange={(e) => {
                            setCaption(e.target.value);
                            setEditorTab("caption");
                            setStatusBusy(true);
                            setStatus("Unsaved changes");
                          }}
                          placeholder="Write a caption, or ask AI to generate one..."
                        />
                        <div className="rw-ctx">
                          <button
                            type="button"
                            className="rw-btn rw-btn-soft rw-btn-sm"
                            disabled={aiBusy || scriptId == null}
                            onClick={() => runAiPrompt("Rewrite the caption", "caption")}
                          >
                            Rewrite
                          </button>
                          <button
                            type="button"
                            className="rw-btn rw-btn-ghost rw-btn-sm"
                            disabled={aiBusy || scriptId == null}
                            onClick={() => runAiPrompt("Add 3 hashtags", "caption")}
                          >
                            Add hashtags
                          </button>
                          <button
                            type="button"
                            className="rw-btn rw-btn-ghost rw-btn-sm"
                            disabled={aiBusy || scriptId == null}
                            onClick={() => runAiPrompt("Improve the call to action", "caption")}
                          >
                            Improve CTA
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {workspaceTab === "visuals" ? (
                <div className="rw-main-scroll rw-visuals-view">
                  <div className="rw-visuals-head">
                    <div>
                      <h3>Recommended B-roll</h3>
                      <p>Match visuals to the moments that need them.</p>
                    </div>
                    <button
                      type="button"
                      className="rw-btn rw-btn-primary"
                      disabled={!script.trim() || suggestBrollMutation.isPending}
                      onClick={() => void matchBroll()}
                    >
                      {suggestBrollMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Matching...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4" /> Auto-match visuals
                        </>
                      )}
                    </button>
                  </div>

                  {visualMode === "search" ? (
                    <div className="rw-search-row">
                      <Search className="h-4 w-4" />
                      <input placeholder="Search stock clips..." />
                      <button
                        type="button"
                        className="rw-btn rw-btn-soft rw-btn-sm"
                        onClick={() => toast.message("Search coming next")}
                      >
                        Search
                      </button>
                    </div>
                  ) : null}

                  {visualMode === "generate" ? (
                    <div className="rw-search-row">
                      <Sparkles className="h-4 w-4" />
                      <input placeholder="Describe the shot you want..." />
                      <button
                        type="button"
                        className="rw-btn rw-btn-primary rw-btn-sm"
                        onClick={() => toast.message("AI clip generation coming next")}
                      >
                        Generate
                      </button>
                    </div>
                  ) : null}

                  {visualMode === "upload" ? (
                    <div className="rw-upload-box">
                      <Upload className="h-5 w-5" />
                      <strong>Upload your own clip</strong>
                      <span>Drop a video here, or choose a file from your device.</span>
                      <button
                        type="button"
                        className="rw-btn rw-btn-ghost rw-btn-sm"
                        onClick={() => toast.message("Upload picker coming next")}
                      >
                        Choose file
                      </button>
                    </div>
                  ) : null}

                  {!brollMatched && visualMode === "home" ? (
                    <div className="rw-visual-empty">
                      <div className="rw-visual-empty-icon">
                        <Film className="h-6 w-6" />
                      </div>
                      <h4>Your script is ready for visuals</h4>
                      <p>
                        Auto-match B-roll to the strongest moments, then replace anything you do not like.
                      </p>
                      <button
                        type="button"
                        className="rw-btn rw-btn-primary"
                        disabled={!script.trim() || suggestBrollMutation.isPending}
                        onClick={() => void matchBroll()}
                      >
                        <Wand2 className="h-4 w-4" /> Auto-match B-roll
                      </button>
                    </div>
                  ) : null}

                  {brollMatched || visualMode === "results" || visualMode === "search" ? (
                    <div className="rw-visual-list">
                      {visualMoments.map((moment, index) => (
                        <div key={moment.id} className="rw-visual-card">
                          <button
                            type="button"
                            className={`rw-visual-thumb${selectedClip === moment.id ? " selected" : ""}`}
                            style={{ background: moment.bg }}
                            onClick={() => setSelectedClip(moment.id)}
                            aria-label={`Use ${moment.label}`}
                          >
                            <span>0:0{index + 3}</span>
                          </button>
                          <div className="rw-visual-copy">
                            <span className="rw-visual-kicker">{index === 0 ? "Opening hook" : `Moment ${index + 1}`}</span>
                            <strong>{moment.scriptLine}</strong>
                            <p>{moment.description}</p>
                          </div>
                          <button
                            type="button"
                            className="rw-replace"
                            onClick={() => {
                              setSelectedClip(moment.id);
                              toast.success(`Using ${moment.label}`);
                            }}
                          >
                            {selectedClip === moment.id ? "Selected" : "Use"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="rw-visual-tools">
                    <button type="button" onClick={() => setVisualMode("search")}>
                      <Search className="h-3.5 w-3.5" /> Search clips
                    </button>
                    <button type="button" onClick={() => setVisualMode("generate")}>
                      <ImagePlus className="h-3.5 w-3.5" /> Generate
                    </button>
                    <button type="button" onClick={() => setVisualMode("upload")}>
                      <Upload className="h-3.5 w-3.5" /> Upload
                    </button>
                  </div>
                </div>
              ) : null}

              {workspaceTab === "preview" ? (
                <div className="rw-main-scroll rw-preview-view">
                  <div className="rw-preview-heading">
                    <h3>Reel preview</h3>
                    <p>Check the opening frame before you film.</p>
                  </div>
                  <div className="rw-preview-wrap">
                    <div className="rw-phone">
                      <div
                        className="rw-phone-bg"
                        style={
                          selectedClip
                            ? {
                                background:
                                  MOCK_CLIPS.find((clip) => clip.id === selectedClip)?.bg,
                              }
                            : undefined
                        }
                      />
                      <div className="rw-phone-shade" />
                      <div className="rw-phone-handle">@you</div>
                      <div className="rw-phone-ui">
                        <div className="rw-hook">{firstHookLine(script)}</div>
                      </div>
                      <div className="rw-phone-progress">
                        <span />
                      </div>
                    </div>
                    <div className="rw-cap-preview">
                      {caption.trim() || "Caption preview will show here"}
                    </div>
                  </div>
                </div>
              ) : null}
            </main>
          </div>

          <footer className="rw-foot">
            <div className={`rw-status${statusBusy ? " busy" : ""}`}>
              {statusBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {status}
            </div>
            <div className="rw-foot-right">
              <button type="button" className="rw-close-btn" onClick={() => void closeWorkspace()}>
                Close
              </button>
              <button
                type="button"
                className="rw-ready-btn"
                disabled={isGenerating || !script.trim() || updateMutation.isPending}
                onClick={() => void readyToFilm()}
              >
                <Play className="h-4 w-4" />
                Ready to film
              </button>
            </div>
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md border-[#2a2640] bg-[#1a1724] text-[#f3f0fa]">
          <DialogHeader>
            <DialogTitle>Versions</DialogTitle>
            <DialogDescription className="text-[#a39db8]">
              Previous versions of this Reel script
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-auto">
            {isPreview ? (
              <p className="text-sm text-[#a39db8]">
                Preview mode has no saved versions. Run Remake while logged in to see history.
              </p>
            ) : versions.length === 0 ? (
              <p className="text-sm text-[#a39db8]">No versions yet.</p>
            ) : (
              versions
                .slice()
                .reverse()
                .map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    className="rw-version-item"
                    onClick={() => {
                      setScript(version.content);
                      setHistoryOpen(false);
                      setWorkspaceTab("script");
                      setEditorTab("script");
                      setCaptionOpen(false);
                      setStatus("Unsaved changes");
                      flashUpdated("script");
                    }}
                  >
                    <strong>
                      {version.changeDescription?.trim() || `Version ${version.versionNumber}`}
                    </strong>
                    <span>
                      {version.changeType} · v{version.versionNumber}
                    </span>
                  </button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {!isPreview ? (
        <RemakeHowSpyReelsWritesDialog open={voiceOpen} onOpenChange={setVoiceOpen} />
      ) : null}
    </>
  );
}

const REMAKE_WS_CSS = `
.remake-ws {
  --rw-border:#2d2940;
  --rw-muted:#918aa4;
  --rw-primary:#7437e8;
  --rw-primary-hover:#8248ed;
  --rw-soft:rgba(116,55,232,0.15);
  --rw-ok:#5fe0aa;
}
.remake-ws .rw-head {
  display:grid;
  grid-template-columns:minmax(210px,1fr) auto minmax(210px,1fr);
  align-items:center;
  gap:16px;
  padding:13px 18px;
  border-bottom:1px solid var(--rw-border);
  background:#1b1824;
  flex-shrink:0;
}
.remake-ws .rw-head-copy { min-width:0; }
.remake-ws .rw-title-row { display:flex; align-items:center; gap:8px; min-width:0; }
.remake-ws .rw-title { font-size:15px; line-height:1.2; font-weight:800; color:#fff; }
.remake-ws .rw-source-pill {
  border:1px solid #3a3450;
  background:#242032;
  color:#aca4bd;
  border-radius:999px;
  padding:3px 8px;
  font-size:10px;
  font-weight:700;
  white-space:nowrap;
}
.remake-ws .rw-subtitle { display:block; margin-top:3px; color:#827b92; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.remake-ws .rw-workspace-tabs {
  display:flex;
  gap:3px;
  padding:4px;
  border:1px solid #332e45;
  border-radius:12px;
  background:#15121d;
}
.remake-ws .rw-workspace-tabs button {
  border:0;
  background:transparent;
  color:#9b94aa;
  border-radius:9px;
  padding:8px 16px;
  font-size:13px;
  font-weight:750;
  cursor:pointer;
}
.remake-ws .rw-workspace-tabs button:hover { color:#fff; }
.remake-ws .rw-workspace-tabs button.on { background:#302a42; color:#fff; box-shadow:0 1px 4px rgba(0,0,0,.22); }
.remake-ws .rw-head-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; }
.remake-ws .rw-versions-btn {
  display:inline-flex;
  align-items:center;
  gap:7px;
  border:1px solid #342f46;
  background:#211d2d;
  color:#b5adc7;
  border-radius:9px;
  padding:8px 10px;
  font-size:12px;
  font-weight:700;
  cursor:pointer;
}
.remake-ws .rw-versions-btn:hover { color:#fff; border-color:#4a4261; }
.remake-ws .rw-versions-btn span { border-radius:5px; background:#302a43; padding:1px 5px; font-size:10px; }
.remake-ws .rw-x {
  display:grid;
  place-items:center;
  width:36px;
  height:36px;
  border:0;
  background:transparent;
  color:#91899f;
  border-radius:9px;
  cursor:pointer;
}
.remake-ws .rw-x:hover { background:rgba(255,255,255,.05); color:#fff; }
.remake-ws .rw-body { display:grid; grid-template-columns:340px minmax(0,1fr); flex:1; min-height:0; overflow:hidden; }
.remake-ws .rw-left {
  display:flex;
  min-height:0;
  flex-direction:column;
  border-right:1px solid var(--rw-border);
  background:#18151f;
  overflow:hidden;
}
.remake-ws .rw-ai-scroll { flex:1; overflow:auto; padding:18px 16px; }
.remake-ws .rw-ai-heading { display:flex; align-items:flex-start; gap:10px; }
.remake-ws .rw-ai-icon { display:grid; place-items:center; width:32px; height:32px; border-radius:9px; background:var(--rw-primary); color:#fff; flex-shrink:0; }
.remake-ws .rw-ai-copy { min-width:0; flex:1; }
.remake-ws .rw-h3 { color:#fff; font-size:14px; font-weight:800; }
.remake-ws .rw-ai-copy p { margin:3px 0 0; color:var(--rw-muted); font-size:12px; line-height:1.5; }
.remake-ws .rw-refresh { border:1px solid #342f46; background:#211d2d; color:#aaa1bc; width:30px; height:30px; border-radius:999px; cursor:pointer; }
.remake-ws .rw-refresh:hover { color:#fff; border-color:#51456a; }
.remake-ws .rw-improve-block { margin-top:24px; }
.remake-ws .rw-section-label { margin-bottom:8px; color:#716a81; font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.remake-ws .rw-quick-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.remake-ws .rw-quick-card {
  display:flex;
  min-height:72px;
  flex-direction:column;
  align-items:flex-start;
  justify-content:space-between;
  border:1px solid #302b42;
  background:#211d2b;
  color:#d9d2e4;
  border-radius:12px;
  padding:11px;
  text-align:left;
  cursor:pointer;
}
.remake-ws .rw-quick-card svg { color:#a17aea; }
.remake-ws .rw-quick-card span { font-size:12px; font-weight:750; }
.remake-ws .rw-quick-card:hover { border-color:#593e8c; background:#251f34; color:#fff; }
.remake-ws .rw-quick-card:disabled { opacity:.45; cursor:not-allowed; }
.remake-ws .rw-chat-user { margin-top:20px; border:1px solid #322d42; border-radius:12px; background:#211d2b; padding:11px 12px; }
.remake-ws .rw-chat-user span { display:block; margin-bottom:4px; color:#7f788d; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
.remake-ws .rw-chat-user p { margin:0; color:#eee9f4; font-size:12px; line-height:1.5; }
.remake-ws .rw-loading { display:flex; align-items:center; gap:8px; margin-top:16px; color:#aaa2b8; font-size:12px; }
.remake-ws .rw-suggest { margin-top:16px; border:1px solid #493664; border-radius:13px; background:#21182f; padding:12px; }
.remake-ws .rw-suggest-top { display:flex; align-items:center; gap:7px; color:#fff; font-size:12px; }
.remake-ws .rw-suggest-top svg { color:#a77cff; }
.remake-ws .rw-suggest-note { margin:7px 0 10px; color:#a79db7; font-size:12px; line-height:1.45; }
.remake-ws .rw-suggest-card { margin-top:8px; border:1px solid #3a3150; background:#15121b; border-radius:10px; padding:10px; }
.remake-ws .rw-suggest-kicker { margin-bottom:7px; color:#a98cff; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; }
.remake-ws .rw-suggest-card pre { max-height:190px; margin:0; overflow:auto; white-space:pre-wrap; font-family:inherit; color:#ece8f1; font-size:12px; line-height:1.5; }
.remake-ws .rw-suggest-actions { display:flex; align-items:center; gap:10px; margin-top:10px; }
.remake-ws .rw-applied { display:inline-flex; align-items:center; gap:5px; color:var(--rw-ok); font-size:12px; font-weight:750; }
.remake-ws .rw-make-it { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; margin-top:10px; }
.remake-ws .rw-make-it > span { color:#80788e; font-size:10px; font-weight:750; }
.remake-ws .rw-compose { flex-shrink:0; border-top:1px solid var(--rw-border); background:#15121b; padding:13px; }
.remake-ws .rw-compose-label { margin-bottom:7px; color:#a69eb6; font-size:11px; font-weight:750; }
.remake-ws .rw-ask { border:1px solid #353047; background:#100e15; border-radius:12px; padding:8px; }
.remake-ws .rw-ask:focus-within { border-color:#65489a; }
.remake-ws .rw-ask textarea { width:100%; min-height:56px; resize:none; border:0; background:transparent; color:#fff; outline:none; padding:1px 2px; font-size:13px; line-height:1.45; }
.remake-ws .rw-ask textarea::placeholder { color:#625c6d; }
.remake-ws .rw-ask-bottom { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:5px; }
.remake-ws .rw-voice-btn { max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border:0; background:transparent; color:#827b91; font-size:10px; font-weight:700; cursor:pointer; text-align:left; }
.remake-ws .rw-voice-btn:hover { color:#b8afc7; }
.remake-ws .rw-send { display:grid; place-items:center; width:31px; height:31px; border:0; border-radius:8px; background:var(--rw-primary); color:#fff; font-size:18px; cursor:pointer; }
.remake-ws .rw-send:disabled { opacity:.35; cursor:not-allowed; }
.remake-ws .rw-clarify { margin-top:8px; border-radius:10px; background:var(--rw-soft); padding:9px 10px; color:#c7bed5; font-size:11px; }
.remake-ws .rw-clarify > div { display:flex; gap:6px; margin-top:7px; }
.remake-ws .rw-how-link { margin-top:9px; border:0; background:transparent; color:#7e758e; font-size:10px; font-weight:650; text-decoration:underline; text-underline-offset:2px; cursor:pointer; }
.remake-ws .rw-how-link:hover { color:#b5aac6; }
.remake-ws .rw-main-panel { min-height:0; overflow:hidden; background:#211e2b; }
.remake-ws .rw-main-scroll { height:100%; overflow:auto; }
.remake-ws .rw-script-view { max-width:830px; margin:0 auto; padding:26px 30px 34px; }
.remake-ws .rw-gen-banner { display:flex; align-items:center; gap:8px; margin-bottom:14px; border-radius:10px; background:var(--rw-soft); padding:10px 12px; color:#d9d1e7; font-size:12px; font-weight:650; }
.remake-ws .rw-gen-banner strong { margin-left:auto; color:#aaa1b8; font-size:11px; }
.remake-ws .rw-gen-warning { color:#c8bfd7; }
.remake-ws .rw-editor-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:13px; }
.remake-ws .rw-editor-title-row { display:flex; align-items:center; gap:7px; }
.remake-ws .rw-editor-head h3 { margin:0; color:#fff; font-size:19px; font-weight:800; }
.remake-ws .rw-editor-head p { margin:3px 0 0; color:var(--rw-muted); font-size:12px; }
.remake-ws .rw-ready-pill { border-radius:999px; background:#1c3b31; color:#5fe0aa; padding:3px 7px; font-size:9px; font-weight:800; }
.remake-ws .rw-updated { border-radius:999px; background:var(--rw-primary); color:#fff; padding:3px 7px; font-size:9px; font-weight:800; opacity:0; transition:opacity .2s; }
.remake-ws .rw-updated.show { opacity:1; }
.remake-ws .rw-tele-btn { display:inline-flex; align-items:center; gap:6px; border:1px solid #342f46; background:#191620; color:#b8b1c5; border-radius:9px; padding:8px 10px; font-size:11px; font-weight:700; cursor:pointer; }
.remake-ws .rw-tele-btn:hover { color:#fff; border-color:#4d4562; }
.remake-ws .rw-tele-btn:disabled { opacity:.4; cursor:not-allowed; }
.remake-ws .rw-editor { width:100%; min-height:430px; resize:vertical; border:1px solid #302b41; background:#17141d; color:#f0edf4; border-radius:14px; padding:17px; outline:none; font-size:15px; line-height:1.65; }
.remake-ws .rw-editor:focus { border-color:#59447c; }
.remake-ws .rw-editor.glow { border-color:var(--rw-primary); box-shadow:0 0 0 2px rgba(116,55,232,.2); }
.remake-ws .rw-editor.caption { min-height:145px; }
.remake-ws .rw-ctx { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
.remake-ws .rw-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; border:0; border-radius:10px; padding:9px 13px; font-size:12px; font-weight:750; cursor:pointer; }
.remake-ws .rw-btn:disabled { opacity:.45; cursor:not-allowed; }
.remake-ws .rw-btn-primary { background:var(--rw-primary); color:#fff; }
.remake-ws .rw-btn-primary:hover:not(:disabled) { background:var(--rw-primary-hover); }
.remake-ws .rw-btn-soft { background:var(--rw-soft); color:#ddd4ec; }
.remake-ws .rw-btn-ghost { border:1px solid #342f46; background:#201c29; color:#aaa2b8; }
.remake-ws .rw-btn-ghost:hover:not(:disabled) { color:#fff; border-color:#4d4462; }
.remake-ws .rw-btn-sm { border-radius:999px; padding:6px 10px; font-size:11px; }
.remake-ws .rw-link { border:0; background:transparent; color:#b495ed; padding:0; font-size:11px; font-weight:750; text-decoration:underline; text-underline-offset:2px; cursor:pointer; }
.remake-ws .rw-link:disabled { opacity:.45; cursor:not-allowed; }
.remake-ws .rw-caption-card { margin-top:20px; overflow:hidden; border:1px solid #302b41; background:#191620; border-radius:14px; }
.remake-ws .rw-caption-toggle { display:flex; width:100%; align-items:center; justify-content:space-between; gap:12px; border:0; background:transparent; color:#fff; padding:13px 15px; text-align:left; cursor:pointer; }
.remake-ws .rw-caption-title-row { display:flex; align-items:center; gap:7px; }
.remake-ws .rw-caption-toggle strong { font-size:13px; }
.remake-ws .rw-caption-toggle > div > span { display:block; margin-top:2px; color:#817a8e; font-size:10px; }
.remake-ws .rw-caption-toggle svg { color:#817a8e; }
.remake-ws .rw-caption-body { border-top:1px solid #2b2738; padding:14px; }
.remake-ws .rw-visuals-view { max-width:860px; margin:0 auto; padding:27px 30px 34px; }
.remake-ws .rw-visuals-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }
.remake-ws .rw-visuals-head h3 { margin:0; color:#fff; font-size:19px; font-weight:800; }
.remake-ws .rw-visuals-head p { margin:4px 0 0; color:var(--rw-muted); font-size:12px; }
.remake-ws .rw-visual-empty { display:flex; min-height:360px; flex-direction:column; align-items:center; justify-content:center; margin-top:20px; border:1px dashed #3b354b; background:#191620; border-radius:16px; padding:34px; text-align:center; }
.remake-ws .rw-visual-empty-icon { display:grid; place-items:center; width:52px; height:52px; border-radius:14px; background:#292139; color:#9f7bea; }
.remake-ws .rw-visual-empty h4 { margin:13px 0 6px; color:#fff; font-size:15px; font-weight:800; }
.remake-ws .rw-visual-empty p { max-width:390px; margin:0 0 16px; color:#90889e; font-size:12px; line-height:1.55; }
.remake-ws .rw-search-row { display:flex; align-items:center; gap:8px; margin-top:18px; border:1px solid #332e44; background:#17141d; border-radius:12px; padding:8px 9px; color:#81798f; }
.remake-ws .rw-search-row input { flex:1; min-width:0; border:0; background:transparent; color:#fff; outline:none; font-size:12px; }
.remake-ws .rw-upload-box { display:flex; flex-direction:column; align-items:center; gap:7px; margin-top:18px; border:1px dashed #3d3650; background:#18151e; border-radius:14px; padding:28px; color:#91899e; text-align:center; }
.remake-ws .rw-upload-box strong { color:#e7e1ed; font-size:13px; }
.remake-ws .rw-upload-box span { font-size:11px; }
.remake-ws .rw-visual-list { display:flex; flex-direction:column; gap:10px; margin-top:20px; }
.remake-ws .rw-visual-card { display:grid; grid-template-columns:78px minmax(0,1fr) auto; align-items:center; gap:13px; border:1px solid #302b41; background:#18151e; border-radius:14px; padding:10px; }
.remake-ws .rw-visual-thumb { position:relative; width:78px; aspect-ratio:9/12; overflow:hidden; border:1px solid transparent; border-radius:10px; cursor:pointer; }
.remake-ws .rw-visual-thumb.selected { border-color:#9a71eb; box-shadow:0 0 0 2px rgba(116,55,232,.22); }
.remake-ws .rw-visual-thumb span { position:absolute; left:7px; bottom:6px; color:#fff; font-size:9px; font-weight:800; text-shadow:0 1px 3px rgba(0,0,0,.8); }
.remake-ws .rw-visual-copy { min-width:0; }
.remake-ws .rw-visual-kicker { display:block; margin-bottom:4px; color:#7f778d; font-size:9px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
.remake-ws .rw-visual-copy strong { display:block; overflow:hidden; color:#e9e3ef; font-size:12px; font-weight:750; line-height:1.45; text-overflow:ellipsis; white-space:nowrap; }
.remake-ws .rw-visual-copy p { overflow:hidden; margin:6px 0 0; color:#8c8499; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
.remake-ws .rw-replace { border:1px solid #393246; background:transparent; color:#aaa2b8; border-radius:8px; padding:7px 10px; font-size:10px; font-weight:750; cursor:pointer; }
.remake-ws .rw-replace:hover { color:#fff; border-color:#5a4575; }
.remake-ws .rw-visual-tools { display:flex; flex-wrap:wrap; gap:7px; margin-top:16px; }
.remake-ws .rw-visual-tools button { display:inline-flex; align-items:center; gap:6px; border:1px solid #342f46; background:#191620; color:#9e96ab; border-radius:8px; padding:7px 9px; font-size:10px; font-weight:700; cursor:pointer; }
.remake-ws .rw-visual-tools button:hover { color:#fff; border-color:#4d4262; }
.remake-ws .rw-preview-view { display:flex; min-height:100%; flex-direction:column; align-items:center; justify-content:center; padding:28px; }
.remake-ws .rw-preview-heading { margin-bottom:14px; text-align:center; }
.remake-ws .rw-preview-heading h3 { margin:0; color:#fff; font-size:17px; font-weight:800; }
.remake-ws .rw-preview-heading p { margin:4px 0 0; color:#857d91; font-size:11px; }
.remake-ws .rw-preview-wrap { display:flex; flex-direction:column; align-items:center; gap:13px; }
.remake-ws .rw-phone { position:relative; width:min(280px,100%); aspect-ratio:9/16; overflow:hidden; border:2px solid #433b58; border-radius:28px; background:#111018; box-shadow:0 24px 50px rgba(0,0,0,.35); }
.remake-ws .rw-phone-bg { position:absolute; inset:0; background:linear-gradient(160deg,rgba(116,55,232,.5),#171827 62%); background-size:cover; background-position:center; }
.remake-ws .rw-phone-shade { position:absolute; inset:0; background:linear-gradient(to top,rgba(0,0,0,.76),transparent 58%,rgba(0,0,0,.22)); }
.remake-ws .rw-phone-handle { position:absolute; left:14px; top:15px; color:#fff; font-size:11px; font-weight:800; }
.remake-ws .rw-phone-ui { position:absolute; left:14px; right:14px; bottom:54px; color:#fff; }
.remake-ws .rw-hook { color:#fff; font-size:17px; line-height:1.34; font-weight:850; text-shadow:0 1px 5px rgba(0,0,0,.7); }
.remake-ws .rw-phone-progress { position:absolute; left:14px; right:14px; bottom:16px; height:3px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.18); }
.remake-ws .rw-phone-progress span { display:block; width:22%; height:100%; border-radius:999px; background:rgba(255,255,255,.84); }
.remake-ws .rw-cap-preview { width:min(350px,100%); max-height:110px; overflow:auto; border:1px solid #302b41; background:#17141d; color:#aaa3b7; border-radius:11px; padding:11px 13px; white-space:pre-wrap; font-size:11px; line-height:1.5; }
.remake-ws .rw-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-shrink:0; border-top:1px solid var(--rw-border); background:#15121b; padding:11px 17px; }
.remake-ws .rw-status { display:inline-flex; align-items:center; gap:6px; color:var(--rw-ok); font-size:11px; font-weight:750; }
.remake-ws .rw-status.busy { color:#9a92a7; }
.remake-ws .rw-foot-right { display:flex; align-items:center; gap:7px; }
.remake-ws .rw-close-btn { border:0; background:transparent; color:#9b93a8; border-radius:8px; padding:8px 12px; font-size:12px; font-weight:700; cursor:pointer; }
.remake-ws .rw-close-btn:hover { background:rgba(255,255,255,.04); color:#fff; }
.remake-ws .rw-ready-btn { display:inline-flex; align-items:center; gap:7px; border:0; background:var(--rw-primary); color:#fff; border-radius:10px; padding:10px 16px; font-size:12px; font-weight:800; cursor:pointer; box-shadow:0 8px 24px rgba(65,30,130,.25); }
.remake-ws .rw-ready-btn:hover:not(:disabled) { background:var(--rw-primary-hover); }
.remake-ws .rw-ready-btn:disabled { opacity:.45; cursor:not-allowed; }
.remake-ws .rw-version-item { display:block; width:100%; border:1px solid #302b41; background:#17141d; color:#f3f0fa; border-radius:10px; padding:11px 12px; text-align:left; cursor:pointer; }
.remake-ws .rw-version-item:hover { border-color:#4d4265; background:#1e1928; }
.remake-ws .rw-version-item strong { display:block; font-size:12px; }
.remake-ws .rw-version-item span { display:block; margin-top:3px; color:#8e879d; font-size:10px; }
@media (max-width:900px) {
  .remake-ws .rw-head { grid-template-columns:1fr auto; }
  .remake-ws .rw-workspace-tabs { grid-row:2; grid-column:1 / -1; justify-self:center; }
  .remake-ws .rw-body { grid-template-columns:1fr; overflow:auto; }
  .remake-ws .rw-left { min-height:320px; max-height:42vh; border-right:0; border-bottom:1px solid var(--rw-border); }
  .remake-ws .rw-main-panel { min-height:520px; }
}
@media (max-width:620px) {
  .remake-ws .rw-head { padding:10px 11px; gap:10px; }
  .remake-ws .rw-source-pill, .remake-ws .rw-subtitle, .remake-ws .rw-versions-btn svg { display:none; }
  .remake-ws .rw-versions-btn { padding:7px 8px; }
  .remake-ws .rw-workspace-tabs { width:100%; }
  .remake-ws .rw-workspace-tabs button { flex:1; padding:7px 10px; }
  .remake-ws .rw-script-view, .remake-ws .rw-visuals-view { padding:20px 16px 28px; }
  .remake-ws .rw-editor-head, .remake-ws .rw-visuals-head { flex-direction:column; }
  .remake-ws .rw-tele-btn, .remake-ws .rw-visuals-head .rw-btn { width:100%; justify-content:center; }
  .remake-ws .rw-editor { min-height:360px; }
  .remake-ws .rw-foot { align-items:flex-start; }
  .remake-ws .rw-foot-right { margin-left:auto; }
}
`;
