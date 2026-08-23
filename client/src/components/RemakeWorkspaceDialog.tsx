import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import {
  formatSchedulePostButtonSubtitle,
  pickNextOpenPostSchedule,
  postDateToOccupiedYmd,
  toLocalYmd,
} from "@shared/coachScriptSave";
import { useLocation } from "wouter";

type LeftTab = "ai" | "drafts" | "media";
type EditorTab = "script" | "caption";
type ViewMode = "edit" | "preview";
type ClarifyTarget = "script" | "caption" | "both";

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
    bg: "linear-gradient(140deg,#312e81,#0f172a)",
  },
  {
    id: "2",
    label: "Prep station",
    bg: "linear-gradient(140deg,#4c1d95,#111827)",
  },
  {
    id: "3",
    label: "Service line",
    bg: "linear-gradient(140deg,#1e3a8a,#0f172a)",
  },
];

function firstHookLine(script: string): string {
  const line = script
    .split(/\n+/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "Your hook will show here";
  return line.replace(/^\[.*?\]\s*/, "").slice(0, 90);
}

function needsClarify(prompt: string): boolean {
  const p = prompt.toLowerCase();
  if (/\b(script and caption|both|everything)\b/.test(p)) return false;
  if (/\b(script|spoken|say|hook|lines?)\b/.test(p) && !/\b(caption|hashtag)\b/.test(p))
    return false;
  if (/\b(caption|hashtag|cta under)\b/.test(p) && !/\b(script|spoken|say)\b/.test(p))
    return false;
  return /\b(improve|better|fix|rewrite|update|change|polish)\b/.test(p);
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
  const [, setLocation] = useLocation();
  const isPreview = Boolean(previewSeed) && scriptId == null;

  const [leftTab, setLeftTab] = useState<LeftTab>("ai");
  const [editorTab, setEditorTab] = useState<EditorTab>("script");
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [script, setScript] = useState("");
  const [caption, setCaption] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [status, setStatus] = useState("All changes saved");
  const [statusBusy, setStatusBusy] = useState(false);
  const [scriptUpdated, setScriptUpdated] = useState(false);
  const [captionUpdated, setCaptionUpdated] = useState(false);
  const [glowField, setGlowField] = useState<EditorTab | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffBefore, setDiffBefore] = useState("");
  const [diffAfter, setDiffAfter] = useState("");
  const [undoTarget, setUndoTarget] = useState<{
    field: EditorTab;
    value: string;
  } | null>(null);
  const [schedMenuOpen, setSchedMenuOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState<"home" | "results" | "search" | "generate" | "upload">(
    "home"
  );
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [brollMatched, setBrollMatched] = useState(false);
  const hydratedIdRef = useRef<number | null>(null);

  const scriptQuery = trpc.scripts.get.useQuery(
    { id: scriptId ?? 0 },
    { enabled: open && scriptId != null && !isPreview, staleTime: 10_000 }
  );
  const scriptsListQuery = trpc.scripts.list.useQuery(
    {},
    { enabled: open && !isPreview, staleTime: 30_000, retry: false }
  );
  const onboardingQuery = trpc.onboarding.getState.useQuery(undefined, {
    enabled: open && !isPreview,
    staleTime: 60_000,
    retry: false,
  });

  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: () => {
      void utils.scripts.get.invalidate({ id: scriptId! });
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
    if (aud && biz) return `${biz.slice(0, 28)}${biz.length > 28 ? "…" : ""} · ${aud.slice(0, 32)}`;
    if (aud) return aud.slice(0, 48);
    if (biz) return biz.slice(0, 48);
    return "Your voice · Edit to personalize";
  }, [onboardingQuery.data]);

  const scheduleSlot = useMemo(() => {
    const occupied = (scriptsListQuery.data ?? [])
      .filter((s) => s.id !== scriptId)
      .map((s) => postDateToOccupiedYmd(s.postDate))
      .filter((ymd): ymd is string => Boolean(ymd));
    return pickNextOpenPostSchedule(occupied);
  }, [scriptsListQuery.data, scriptId]);

  const scheduleSubtitle = formatSchedulePostButtonSubtitle(
    scheduleSlot.postDate,
    scheduleSlot.postTime
  );

  const isGenerating =
    remakeState?.stage === "transcribing" || remakeState?.stage === "generating";
  const progressPercent = remakeState?.progressPercent ?? 0;

  useEffect(() => {
    if (!open) {
      hydratedIdRef.current = null;
      return;
    }
    hydratedIdRef.current = null;
    setScript("");
    setCaption("");
    setLeftTab("ai");
    setEditorTab("script");
    setViewMode("edit");
    setAiResult(null);
    setClarifyOpen(false);
    setMediaMode("home");
    setBrollMatched(false);
    setSchedMenuOpen(false);
  }, [open, target?.remakeKey]);

  useEffect(() => {
    if (!open || scriptId == null) return;
    if (remakeState?.stage !== "ready") return;
    // Generation just finished: drop any empty hydrate lock and refetch content.
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
    // Never lock hydration on an empty draft. recreate.generate creates the row
    // before content is written; locking here leaves the editor blank forever.
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
      setStatus("SpyReels is rewriting…");
      setAiResult(null);
      try {
        const targets: EditorTab[] =
          field === "both" ? ["script", "caption"] : [field];

        for (const t of targets) {
          const before = t === "script" ? script : caption;
          let after = before;

          if (t === "caption") {
            if (
              /hashtag/i.test(prompt) ||
              /rewrite the caption/i.test(prompt) ||
              /call to action|cta/i.test(prompt) ||
              !before.trim()
            ) {
              const gen = await captionMutation.mutateAsync({
                scriptId,
                content: script || before || "Reel script",
                style: "educational",
                captionLength: "medium",
                targetAudience: onboardingQuery.data?.targetAudience ?? undefined,
              });
              after = gen.caption;
              if (/hashtag/i.test(prompt) && gen.hashtags?.length) {
                after = `${gen.caption}\n\n${gen.hashtags.map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`;
              }
            } else {
              const rewritten = await aiRewriteMutation.mutateAsync({
                scriptId,
                content: before || script,
                instruction: `Rewrite this Instagram Reel caption only. ${prompt}. Return only the caption text.`,
              });
              after = rewritten.content;
            }
            setDiffBefore(before);
            setDiffAfter(after);
            setUndoTarget({ field: "caption", value: before });
            setCaption(after);
            flashUpdated("caption");
            setEditorTab("caption");
            await updateMutation.mutateAsync({
              id: scriptId,
              generatedCaption: after,
            });
          } else {
            const useGrammar = /grammar|spelling|typo/i.test(prompt);
            const rewritten = useGrammar
              ? await grammarMutation.mutateAsync({ scriptId, content: before })
              : await aiRewriteMutation.mutateAsync({
                  scriptId,
                  content: before,
                  instruction: prompt,
                });
            after = rewritten.content;
            setDiffBefore(before);
            setDiffAfter(after);
            setUndoTarget({ field: "script", value: before });
            setScript(after);
            flashUpdated("script");
            setEditorTab("script");
          }
        }

        setAiResult("Done. Review the update on the right, or undo if you prefer the previous version.");
        setDiffOpen(true);
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
      caption,
      captionMutation,
      flashUpdated,
      grammarMutation,
      onboardingQuery.data?.targetAudience,
      script,
      scriptId,
      updateMutation,
      isPreview,
    ]
  );

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

  const saveDraft = useCallback(async () => {
    if (scriptId == null) {
      toast.message("Script is still generating");
      return;
    }
    setStatusBusy(true);
    setStatus("Saving draft…");
    try {
      await updateMutation.mutateAsync({
        id: scriptId,
        content: script,
        generatedCaption: caption || null,
        changeType: "manual_edit",
        changeDescription: "Remake workspace save",
      });
      toast.success("Draft saved");
    } catch {
      /* toast in mutation */
    }
  }, [caption, script, scriptId, updateMutation]);

  const schedulePost = useCallback(async () => {
    if (scriptId == null) {
      if (isPreview) {
        toast.message(`Preview: would schedule for ${scheduleSubtitle}`);
        return;
      }
      toast.message("Script is still generating");
      return;
    }
    setStatusBusy(true);
    setStatus("Scheduling…");
    try {
      await updateMutation.mutateAsync({
        id: scriptId,
        content: script,
        generatedCaption: caption || null,
        postDate: toLocalYmd(scheduleSlot.postDate),
        postTime: scheduleSlot.postTime,
        status: "approved",
        changeType: "manual_edit",
        changeDescription: `Scheduled for ${scheduleSubtitle}`,
      });
      void utils.scripts.list.invalidate();
      toast.success(`Scheduled for ${scheduleSubtitle}`);
      onOpenChange(false);
      setLocation(`/scripts/${scriptId}`);
    } catch {
      /* toast in mutation */
    }
  }, [
    caption,
    isPreview,
    onOpenChange,
    scheduleSlot.postDate,
    scheduleSlot.postTime,
    scheduleSubtitle,
    script,
    scriptId,
    setLocation,
    updateMutation,
    utils.scripts.list,
  ]);

  const versions = scriptQuery.data?.versions ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="remake-ws flex h-[min(90vh,820px)] max-h-[90vh] w-[min(1120px,100%)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-[#2a2640] bg-[#211e2b] p-0 text-[#f3f0fa] sm:max-w-[min(1120px,calc(100%-1.5rem))]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Remake workspace</DialogTitle>
            <DialogDescription>
              Improve your script, caption, and B-roll before you film.
            </DialogDescription>
          </DialogHeader>

          <style>{REMAKE_WS_CSS}</style>

          <div className="rw-head">
            <div className="rw-tabs">
              {(
                [
                  ["ai", "AI Assist"],
                  ["drafts", "Drafts"],
                  ["media", "Media"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rw-tab${leftTab === id ? " on" : ""}`}
                  onClick={() => setLeftTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="rw-x"
              title="Close"
              onClick={() => onOpenChange(false)}
            >
              ×
            </button>
          </div>

          <div className="rw-body">
            <div className="rw-left">
              {leftTab === "ai" ? (
                <div className="rw-pane on">
                  <div className="rw-scroll">
                    <div className="rw-h3">What should we improve?</div>
                    <div className="rw-actions">
                      {[
                        ["Make the hook stronger", "Stronger hook"],
                        ["Make it easier to say", "Easier to say"],
                        ["Make it more casual", "More casual"],
                        ["Fix the grammar", "Fix grammar"],
                      ].map(([prompt, label]) => (
                        <button
                          key={label}
                          type="button"
                          className="rw-chip"
                          disabled={aiBusy || isGenerating}
                          onClick={() => runAiPrompt(prompt)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {aiBusy ? (
                      <div className="rw-loading">
                        <span className="rw-dots">
                          <span />
                          <span />
                          <span />
                        </span>
                        SpyReels is rewriting…
                      </div>
                    ) : null}
                    {aiResult ? (
                      <div className="rw-result">
                        <p>{aiResult}</p>
                        <div className="rw-links">
                          <button
                            type="button"
                            className="rw-link"
                            onClick={() => setDiffOpen(true)}
                          >
                            What changed
                          </button>
                          {undoTarget ? (
                            <button
                              type="button"
                              className="rw-link"
                              onClick={() => {
                                if (undoTarget.field === "script") setScript(undoTarget.value);
                                else setCaption(undoTarget.value);
                                setUndoTarget(null);
                                setAiResult(null);
                                toast.message("Reverted last AI change");
                              }}
                            >
                              Undo
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="rw-compose">
                    <div className="rw-voice-line">
                      Writing in your voice: <strong>{voiceSummary}</strong>{" "}
                      <button
                        type="button"
                        className="rw-link"
                        style={{ fontSize: 12 }}
                        onClick={() => {
                          if (isPreview) {
                            toast.message("Log in to edit How SpyReels writes");
                            return;
                          }
                          setVoiceOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </div>
                    <div className="rw-ask">
                      <textarea
                        value={aiInput}
                        onChange={(e) => setAiInput(e.target.value)}
                        placeholder="Tell SpyReels what you want changed…"
                        disabled={aiBusy}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            runAiPrompt(aiInput);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="rw-send"
                        title="Send"
                        disabled={aiBusy || !aiInput.trim()}
                        onClick={() => runAiPrompt(aiInput)}
                      >
                        ➤
                      </button>
                    </div>
                    {clarifyOpen ? (
                      <div className="rw-clarify">
                        Update the script, caption, or both?
                        <div className="rw-row">
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
                                const p = pendingPrompt;
                                setClarifyOpen(false);
                                setPendingPrompt(null);
                                if (p) void applyAiToField(p, id);
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="rw-util-links">
                      <button
                        type="button"
                        className="rw-link"
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
                      <button
                        type="button"
                        className="rw-link"
                        onClick={() => setHistoryOpen(true)}
                      >
                        History
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {leftTab === "drafts" ? (
                <div className="rw-pane on">
                  <div className="rw-scroll">
                    <div className="rw-h3">Drafts</div>
                    <p className="rw-muted" style={{ margin: "4px 0 12px" }}>
                      Recent versions of this Reel.
                    </p>
                    {versions.length === 0 ? (
                      <p className="rw-muted">No versions yet. Save or ask AI to create one.</p>
                    ) : (
                      versions
                        .slice()
                        .reverse()
                        .slice(0, 8)
                        .map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className="rw-draft-item"
                            onClick={() => {
                              setScript(v.content);
                              setEditorTab("script");
                              setViewMode("edit");
                              flashUpdated("script");
                              toast.message(`Opened version ${v.versionNumber}`);
                            }}
                          >
                            <strong>
                              {v.changeDescription?.trim() || `Version ${v.versionNumber}`}
                            </strong>
                            <span>
                              {v.changeType} · v{v.versionNumber}
                            </span>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              ) : null}

              {leftTab === "media" ? (
                <div className="rw-pane on">
                  <div className="rw-scroll">
                    {mediaMode === "home" ? (
                      <div>
                        <div className="rw-h3">Add B-roll to your Reel</div>
                        <p className="rw-muted">
                          SpyReels can automatically match visuals to your script.
                        </p>
                        <button
                          type="button"
                          className="rw-btn rw-btn-primary"
                          style={{ width: "100%", marginTop: 14 }}
                          disabled={!script.trim() || suggestBrollMutation.isPending}
                          onClick={async () => {
                            if (scriptId == null) {
                              toast.message("Wait for script generation to finish");
                              return;
                            }
                            setStatusBusy(true);
                            setStatus("Matching B-roll…");
                            try {
                              await suggestBrollMutation.mutateAsync({
                                scriptId,
                                content: script,
                              });
                              setBrollMatched(true);
                              setMediaMode("results");
                              toast.success("B-roll matched to your script");
                            } catch (err) {
                              toast.error(
                                err instanceof Error ? err.message : "B-roll match failed"
                              );
                            } finally {
                              setStatusBusy(false);
                              setStatus("All changes saved");
                            }
                          }}
                        >
                          {suggestBrollMutation.isPending ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" /> Matching…
                            </span>
                          ) : (
                            "Auto-match B-roll"
                          )}
                        </button>
                        <div className="rw-media-secondary">
                          <button
                            type="button"
                            className="rw-btn rw-btn-ghost rw-btn-sm"
                            onClick={() => setMediaMode("search")}
                          >
                            Search clips
                          </button>
                          <button
                            type="button"
                            className="rw-btn rw-btn-ghost rw-btn-sm"
                            onClick={() => setMediaMode("generate")}
                          >
                            Generate with AI
                          </button>
                          <button
                            type="button"
                            className="rw-btn rw-btn-ghost rw-btn-sm"
                            onClick={() => setMediaMode("upload")}
                          >
                            Upload my own
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {mediaMode === "results" || mediaMode === "search" ? (
                      <div>
                        <button
                          type="button"
                          className="rw-link"
                          onClick={() => setMediaMode("home")}
                        >
                          ← Back
                        </button>
                        <div className="rw-moment">
                          <div className="rw-line">
                            {brollMatched
                              ? "Matched to your opening line"
                              : "Search stock clips"}
                          </div>
                          {mediaMode === "search" ? (
                            <div className="rw-search-row">
                              <input placeholder="Search Pexels / Pixabay…" />
                              <button
                                type="button"
                                className="rw-btn rw-btn-soft rw-btn-sm"
                                onClick={() => toast.message("Search coming next")}
                              >
                                Search
                              </button>
                            </div>
                          ) : null}
                          <div className="rw-clips">
                            {MOCK_CLIPS.map((c) => (
                              <div
                                key={c.id}
                                className={`rw-clip${selectedClip === c.id ? " on" : ""}`}
                              >
                                <div
                                  className="rw-pic"
                                  style={{ background: c.bg }}
                                />
                                <div className="rw-meta">
                                  <span>{c.label}</span>
                                  <span>0:04</span>
                                </div>
                                <button
                                  type="button"
                                  className="rw-use"
                                  onClick={() => {
                                    setSelectedClip(c.id);
                                    toast.success(`Using ${c.label}`);
                                  }}
                                >
                                  Use
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {mediaMode === "generate" ? (
                      <div>
                        <button
                          type="button"
                          className="rw-link"
                          onClick={() => setMediaMode("home")}
                        >
                          ← Back
                        </button>
                        <p className="rw-muted" style={{ marginTop: 12 }}>
                          Describe the shot you want and SpyReels will generate options.
                        </p>
                        <div className="rw-search-row">
                          <input placeholder="e.g. busy restaurant kitchen at dinner rush" />
                          <button
                            type="button"
                            className="rw-btn rw-btn-primary rw-btn-sm"
                            onClick={() => toast.message("AI clip generate coming next")}
                          >
                            Generate
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {mediaMode === "upload" ? (
                      <div>
                        <button
                          type="button"
                          className="rw-link"
                          onClick={() => setMediaMode("home")}
                        >
                          ← Back
                        </button>
                        <div className="rw-drop">
                          Drop a clip here, or click to upload from your device.
                          <div style={{ marginTop: 12 }}>
                            <button
                              type="button"
                              className="rw-btn rw-btn-ghost rw-btn-sm"
                              onClick={() => toast.message("Upload picker coming next")}
                            >
                              Choose file
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rw-right">
              <div className="rw-right-head">
                <div className="rw-seg">
                  <button
                    type="button"
                    className={viewMode === "edit" ? "on" : ""}
                    onClick={() => setViewMode("edit")}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={viewMode === "preview" ? "on" : ""}
                    onClick={() => setViewMode("preview")}
                  >
                    Preview
                  </button>
                </div>
                <button
                  type="button"
                  className="rw-tele-mini"
                  title="Read your script while filming"
                  disabled={scriptId == null || target?.reelId == null}
                  onClick={() => {
                    if (scriptId == null || target?.reelId == null) {
                      toast.message("Script is not ready yet");
                      return;
                    }
                    onOpenTeleprompter?.(target.reelId, scriptId);
                  }}
                >
                  Open teleprompter
                </button>
              </div>

              {viewMode === "edit" ? (
                <div className="rw-pane on" style={{ display: "flex" }}>
                  <div className="rw-scroll">
                    {isGenerating ? (
                      <div className="rw-gen-banner">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {remakeState?.stage === "transcribing"
                          ? "Transcribing source Reel…"
                          : "Writing your remake script…"}
                        <span className="rw-muted">{progressPercent}%</span>
                      </div>
                    ) : null}

                    {!isGenerating && scriptId == null && !previewSeed ? (
                      <div className="rw-gen-banner">
                        {remakeState?.stage === "error"
                          ? remakeState.errorMessage?.trim() ||
                            "Remake failed. Close and tap Remake to try again."
                          : remakeState?.stage === "inspiration"
                            ? remakeState.classificationReason?.trim() ||
                              "This video looks inspiration-only. Pick one with clear talking to remake."
                            : "Preparing your remake. If this stays empty, close and tap Remake again."}
                      </div>
                    ) : null}

                    <div className="rw-editor-tabs">
                      <button
                        type="button"
                        className={editorTab === "script" ? "on" : ""}
                        onClick={() => setEditorTab("script")}
                      >
                        Script
                      </button>
                      <button
                        type="button"
                        className={editorTab === "caption" ? "on" : ""}
                        onClick={() => setEditorTab("caption")}
                      >
                        Caption
                      </button>
                    </div>

                    {editorTab === "script" ? (
                      <div>
                        <div className="rw-field-label">
                          <h4>
                            Video Script{" "}
                            <span className={`rw-updated${scriptUpdated ? " show" : ""}`}>
                              Updated
                            </span>
                          </h4>
                          <p>What you will say on camera</p>
                        </div>
                        <textarea
                          className={`rw-editor${glowField === "script" ? " glow" : ""}`}
                          value={script}
                          onChange={(e) => {
                            setScript(e.target.value);
                            setStatusBusy(true);
                            setStatus("Unsaved changes");
                          }}
                          placeholder={
                            isGenerating
                              ? "Your script will appear here…"
                              : "Write or paste your spoken script…"
                          }
                          disabled={isGenerating && !script}
                        />
                        <div className="rw-ctx">
                          <button
                            type="button"
                            className="rw-btn rw-btn-soft rw-btn-sm"
                            disabled={aiBusy || !script.trim()}
                            onClick={() => runAiPrompt("Make the hook stronger", "script")}
                          >
                            Stronger hook
                          </button>
                          <button
                            type="button"
                            className="rw-btn rw-btn-ghost rw-btn-sm"
                            disabled={aiBusy || !script.trim()}
                            onClick={() => runAiPrompt("Make it shorter", "script")}
                          >
                            Make shorter
                          </button>
                          <button
                            type="button"
                            className="rw-btn rw-btn-ghost rw-btn-sm"
                            disabled={aiBusy || !script.trim()}
                            onClick={() => runAiPrompt("Fix the grammar", "script")}
                          >
                            Fix grammar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="rw-field-label">
                          <h4>
                            Instagram Caption{" "}
                            <span className={`rw-updated${captionUpdated ? " show" : ""}`}>
                              Updated
                            </span>
                          </h4>
                          <p>The text people see under your Reel</p>
                        </div>
                        <textarea
                          className={`rw-editor caption${glowField === "caption" ? " glow" : ""}`}
                          value={caption}
                          onChange={(e) => {
                            setCaption(e.target.value);
                            setStatusBusy(true);
                            setStatus("Unsaved changes");
                          }}
                          placeholder="Write a caption, or ask AI to generate one…"
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
                            onClick={() =>
                              runAiPrompt("Improve the call to action", "caption")
                            }
                          >
                            Improve CTA
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rw-pane on" style={{ display: "flex" }}>
                  <div className="rw-scroll">
                    <div className="rw-preview-wrap">
                      <div className="rw-phone">
                        <div
                          className="rw-phone-bg"
                          style={
                            selectedClip
                              ? {
                                  background:
                                    MOCK_CLIPS.find((c) => c.id === selectedClip)?.bg,
                                }
                              : undefined
                          }
                        />
                        <div className="rw-phone-handle">@you</div>
                        <div className="rw-phone-ui">
                          <div className="rw-hook">{firstHookLine(script)}</div>
                        </div>
                      </div>
                      <div className="rw-cap-preview">
                        {caption.trim() || "Caption preview will show here"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rw-foot">
            <div className={`rw-status${statusBusy ? " busy" : ""}`}>{status}</div>
            <div className="rw-foot-right">
              <button
                type="button"
                className="rw-btn-text"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rw-btn rw-btn-ghost"
                onClick={() => void saveDraft()}
                disabled={updateMutation.isPending || (scriptId == null && !isPreview)}
              >
                + New draft
              </button>
              <div className="rw-split">
                <button
                  type="button"
                  className="rw-main rw-main-sched"
                  onClick={() => void schedulePost()}
                >
                  <span className="rw-main-title">Schedule post</span>
                  <span className="rw-main-sub">{scheduleSubtitle}</span>
                </button>
                <button
                  type="button"
                  className="rw-more"
                  title="More schedule options"
                  onClick={() => setSchedMenuOpen((v) => !v)}
                >
                  ▾
                </button>
              </div>
              {schedMenuOpen ? (
                <div className="rw-sched-menu open">
                  <button
                    type="button"
                    onClick={() => {
                      setSchedMenuOpen(false);
                      toast.message("Publish flow opens from Plan");
                    }}
                  >
                    Post now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSchedMenuOpen(false);
                      void schedulePost();
                    }}
                  >
                    Schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSchedMenuOpen(false);
                      void saveDraft();
                    }}
                  >
                    Save as draft
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-lg border-[#2a2640] bg-[#211e2b] text-[#f3f0fa]">
          <DialogHeader>
            <DialogTitle>What changed</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <div className="mb-1 text-xs font-semibold text-[#a39db8]">Before</div>
              <pre className="rw-diff-box whitespace-pre-wrap">{diffBefore || "(empty)"}</pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-[#a39db8]">After</div>
              <pre className="rw-diff-box after whitespace-pre-wrap">{diffAfter || "(empty)"}</pre>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rw-btn rw-btn-ghost"
              onClick={() => setDiffOpen(false)}
            >
              Close
            </button>
            {undoTarget ? (
              <button
                type="button"
                className="rw-btn rw-btn-soft"
                onClick={() => {
                  if (undoTarget.field === "script") setScript(undoTarget.value);
                  else setCaption(undoTarget.value);
                  setUndoTarget(null);
                  setDiffOpen(false);
                }}
              >
                Undo
              </button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md border-[#2a2640] bg-[#1a1724] text-[#f3f0fa]">
          <DialogHeader>
            <DialogTitle>History</DialogTitle>
            <DialogDescription className="text-[#a39db8]">
              Versions of this Reel script
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-auto">
            {isPreview ? (
              <p className="text-sm text-[#a39db8]">
                Preview mode has no saved versions. Run Remake while logged in to see history.
              </p>
            ) : versions.length === 0 ? (
              <p className="text-sm text-[#a39db8]">No history yet.</p>
            ) : (
              versions
                .slice()
                .reverse()
                .map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="rw-draft-item"
                    onClick={() => {
                      setScript(v.content);
                      setHistoryOpen(false);
                      setViewMode("edit");
                      setEditorTab("script");
                      flashUpdated("script");
                    }}
                  >
                    <strong>
                      {v.changeDescription?.trim() || `Version ${v.versionNumber}`}
                    </strong>
                    <span>
                      {v.changeType} · v{v.versionNumber}
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
.remake-ws { --rw-border:#2a2640; --rw-muted:#a39db8; --rw-primary:#7c3aed; --rw-soft:rgba(124,58,237,0.16); --rw-ok:#34d399; }
.remake-ws .rw-head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 14px; border-bottom:1px solid var(--rw-border); flex-shrink:0; }
.remake-ws .rw-tabs { display:flex; gap:4px; }
.remake-ws .rw-tab { border:0; background:transparent; color:var(--rw-muted); font-weight:750; padding:8px 12px; border-radius:10px; cursor:pointer; }
.remake-ws .rw-tab.on { background:rgba(255,255,255,0.06); color:#fff; }
.remake-ws .rw-x { border:0; background:transparent; color:var(--rw-muted); font-size:22px; cursor:pointer; padding:4px 6px; }
.remake-ws .rw-body { display:grid; grid-template-columns:36% 64%; flex:1; min-height:0; overflow:hidden; }
@media (max-width:880px){ .remake-ws .rw-body{ grid-template-columns:1fr; overflow:auto; } .remake-ws .rw-left{ max-height:40vh; border-right:0; border-bottom:1px solid var(--rw-border);} }
.remake-ws .rw-left, .remake-ws .rw-right { min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.remake-ws .rw-left { border-right:1px solid var(--rw-border); background:rgba(0,0,0,0.12); }
.remake-ws .rw-pane { display:none; flex:1; flex-direction:column; min-height:0; overflow:hidden; }
.remake-ws .rw-pane.on { display:flex; }
.remake-ws .rw-scroll { flex:1; overflow:auto; padding:16px; }
.remake-ws .rw-compose { border-top:1px solid var(--rw-border); padding:12px; flex-shrink:0; background:rgba(0,0,0,0.18); }
.remake-ws .rw-h3 { font-size:17px; font-weight:800; margin-bottom:4px; }
.remake-ws .rw-muted { color:var(--rw-muted); }
.remake-ws .rw-actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
.remake-ws .rw-chip { border:1px solid var(--rw-border); background:rgba(255,255,255,0.03); color:#ddd6fe; border-radius:999px; padding:8px 12px; font-weight:650; cursor:pointer; font-size:13px; }
.remake-ws .rw-chip:hover { border-color:rgba(124,58,237,0.45); }
.remake-ws .rw-chip:disabled { opacity:0.5; cursor:not-allowed; }
.remake-ws .rw-result { background:rgba(0,0,0,0.2); border-radius:12px; padding:12px; margin-top:8px; }
.remake-ws .rw-links { display:flex; gap:14px; margin-top:8px; }
.remake-ws .rw-link { border:0; background:none; color:#c4b5fd; font-weight:700; cursor:pointer; text-decoration:underline; text-underline-offset:2px; padding:0; font-size:13px; }
.remake-ws .rw-ask { display:flex; gap:8px; align-items:flex-end; }
.remake-ws .rw-ask textarea { flex:1; min-height:64px; resize:none; border-radius:12px; border:1px solid var(--rw-border); background:rgba(0,0,0,0.28); color:#f3f0fa; padding:10px 12px; outline:none; }
.remake-ws .rw-ask textarea:focus { border-color:rgba(124,58,237,0.5); }
.remake-ws .rw-send { width:42px; height:42px; border:0; border-radius:11px; background:var(--rw-primary); color:#fff; font-weight:800; cursor:pointer; }
.remake-ws .rw-send:disabled { opacity:0.5; }
.remake-ws .rw-clarify { margin-top:8px; padding:10px 12px; border-radius:10px; background:var(--rw-soft); font-size:13px; }
.remake-ws .rw-clarify .rw-row { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
.remake-ws .rw-loading { color:var(--rw-muted); font-size:13px; padding:8px 0; display:flex; align-items:center; gap:8px; }
.remake-ws .rw-dots span { display:inline-block; width:6px; height:6px; border-radius:50%; background:#a78bfa; margin-right:3px; animation:rwblink 1s infinite; }
.remake-ws .rw-dots span:nth-child(2){ animation-delay:.15s; }
.remake-ws .rw-dots span:nth-child(3){ animation-delay:.3s; }
@keyframes rwblink { 0%,100%{opacity:.25} 50%{opacity:1} }
.remake-ws .rw-voice-line { font-size:12px; color:var(--rw-muted); margin-bottom:8px; }
.remake-ws .rw-voice-line strong { color:#ddd6fe; font-weight:700; }
.remake-ws .rw-util-links { display:flex; gap:14px; margin-top:10px; }
.remake-ws .rw-btn { border:0; border-radius:10px; font-weight:700; padding:10px 14px; cursor:pointer; font-size:14px; }
.remake-ws .rw-btn:disabled { opacity:0.5; cursor:not-allowed; }
.remake-ws .rw-btn-primary { background:var(--rw-primary); color:#fff; }
.remake-ws .rw-btn-ghost { background:transparent; color:var(--rw-muted); border:1px solid var(--rw-border); }
.remake-ws .rw-btn-soft { background:var(--rw-soft); color:#ddd6fe; }
.remake-ws .rw-btn-sm { padding:7px 11px; border-radius:999px; font-size:13px; }
.remake-ws .rw-draft-item { width:100%; text-align:left; border:0; background:rgba(0,0,0,0.2); color:#f3f0fa; border-radius:12px; padding:12px; cursor:pointer; margin-bottom:8px; }
.remake-ws .rw-draft-item strong { display:block; }
.remake-ws .rw-draft-item span { color:var(--rw-muted); font-size:13px; }
.remake-ws .rw-media-secondary { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.remake-ws .rw-moment { margin-top:16px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.06); }
.remake-ws .rw-line { font-weight:700; margin-bottom:10px; }
.remake-ws .rw-clips { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.remake-ws .rw-clip { border-radius:10px; overflow:hidden; background:#12101a; border:1px solid transparent; }
.remake-ws .rw-clip.on { border-color:var(--rw-primary); }
.remake-ws .rw-pic { aspect-ratio:9/12; }
.remake-ws .rw-meta { padding:6px; font-size:11px; color:var(--rw-muted); display:flex; justify-content:space-between; gap:4px; }
.remake-ws .rw-use { width:100%; border:0; background:rgba(124,58,237,0.2); color:#ddd6fe; font-weight:700; font-size:12px; padding:6px; cursor:pointer; }
.remake-ws .rw-search-row { display:flex; gap:8px; margin:12px 0; }
.remake-ws .rw-search-row input { flex:1; border-radius:10px; border:1px solid var(--rw-border); background:rgba(0,0,0,0.28); color:#f3f0fa; padding:10px 12px; outline:none; }
.remake-ws .rw-drop { border:1px dashed var(--rw-border); border-radius:12px; padding:28px 16px; text-align:center; color:var(--rw-muted); margin-top:12px; }
.remake-ws .rw-right-head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 16px; border-bottom:1px solid var(--rw-border); flex-shrink:0; }
.remake-ws .rw-seg { display:inline-flex; background:rgba(255,255,255,0.04); border:1px solid var(--rw-border); border-radius:10px; padding:3px; }
.remake-ws .rw-seg button { border:0; background:transparent; color:var(--rw-muted); font-weight:750; padding:7px 12px; border-radius:8px; cursor:pointer; }
.remake-ws .rw-seg button.on { background:#fff; color:#1a1028; }
.remake-ws .rw-tele-mini { border:0; background:transparent; color:var(--rw-muted); font-size:13px; font-weight:650; cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
.remake-ws .rw-tele-mini:disabled { opacity:0.45; cursor:not-allowed; text-decoration:none; }
.remake-ws .rw-editor-tabs { display:flex; gap:4px; margin-bottom:14px; }
.remake-ws .rw-editor-tabs button { border:0; background:transparent; color:var(--rw-muted); font-weight:750; padding:8px 12px; border-radius:10px; cursor:pointer; }
.remake-ws .rw-editor-tabs button.on { background:var(--rw-soft); color:#fff; }
.remake-ws .rw-field-label h4 { font-size:15px; font-weight:800; }
.remake-ws .rw-field-label p { font-size:13px; color:var(--rw-muted); margin:2px 0 10px; }
.remake-ws .rw-editor { width:100%; min-height:240px; border-radius:12px; border:1px solid var(--rw-border); background:rgba(0,0,0,0.22); color:#f3f0fa; padding:14px; font-size:16px; line-height:1.55; resize:vertical; outline:none; }
.remake-ws .rw-editor.caption { min-height:180px; }
.remake-ws .rw-editor:focus { border-color:rgba(124,58,237,0.4); }
.remake-ws .rw-editor.glow { box-shadow:0 0 0 2px rgba(124,58,237,0.5); border-color:var(--rw-primary); }
.remake-ws .rw-updated { display:inline-block; font-size:12px; font-weight:800; color:#fff; background:var(--rw-primary); border-radius:999px; padding:2px 8px; margin-left:8px; opacity:0; transition:opacity .2s; }
.remake-ws .rw-updated.show { opacity:1; }
.remake-ws .rw-ctx { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.remake-ws .rw-preview-wrap { display:flex; flex-direction:column; align-items:center; gap:14px; padding-top:8px; }
.remake-ws .rw-phone { width:min(250px,100%); aspect-ratio:9/16; border-radius:22px; border:2px solid #3f3a55; overflow:hidden; position:relative; background:#0a0910; }
.remake-ws .rw-phone-bg { position:absolute; inset:0; background-size:cover; background-position:center; background-image:linear-gradient(160deg, rgba(124,58,237,0.45), #111827 60%); }
.remake-ws .rw-phone-ui { position:absolute; left:12px; right:12px; bottom:40px; color:#fff; }
.remake-ws .rw-hook { font-weight:800; font-size:15px; text-shadow:0 1px 4px rgba(0,0,0,.6); }
.remake-ws .rw-phone-handle { position:absolute; left:12px; top:14px; color:#fff; font-weight:700; font-size:13px; }
.remake-ws .rw-cap-preview { width:min(300px,100%); background:rgba(0,0,0,0.25); border-radius:12px; padding:12px 14px; white-space:pre-wrap; font-size:14px; color:#d8d4e6; }
.remake-ws .rw-foot { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:11px 14px; border-top:1px solid var(--rw-border); background:rgba(0,0,0,0.22); flex-shrink:0; }
.remake-ws .rw-status { color:var(--rw-ok); font-weight:700; font-size:13px; }
.remake-ws .rw-status.busy { color:var(--rw-muted); }
.remake-ws .rw-foot-right { display:flex; gap:8px; align-items:center; flex-wrap:wrap; position:relative; }
.remake-ws .rw-btn-text { border:0; background:transparent; color:var(--rw-muted); font-weight:650; padding:8px 10px; cursor:pointer; font-size:14px; }
.remake-ws .rw-btn-text:hover { color:#fff; }
.remake-ws .rw-split { display:inline-flex; border-radius:11px; overflow:hidden; }
.remake-ws .rw-main { border:0; background:var(--rw-primary); color:#fff; font-weight:750; padding:10px 14px; cursor:pointer; text-align:left; }
.remake-ws .rw-main-sched { display:flex; flex-direction:column; gap:2px; line-height:1.2; min-width:190px; }
.remake-ws .rw-main-title { font-size:14px; font-weight:800; }
.remake-ws .rw-main-sub { font-size:11px; font-weight:600; opacity:0.9; }
.remake-ws .rw-more { border:0; border-left:1px solid rgba(255,255,255,0.2); background:#6d28d9; color:#fff; padding:0 11px; cursor:pointer; font-weight:800; }
.remake-ws .rw-sched-menu { display:none; position:absolute; right:0; bottom:calc(100% + 8px); min-width:210px; background:#1a1722; border:1px solid var(--rw-border); border-radius:12px; overflow:hidden; z-index:5; }
.remake-ws .rw-sched-menu.open { display:block; }
.remake-ws .rw-sched-menu button { display:block; width:100%; text-align:left; border:0; background:transparent; color:#f3f0fa; padding:11px 13px; font-weight:650; cursor:pointer; }
.remake-ws .rw-sched-menu button:hover { background:var(--rw-soft); }
.remake-ws .rw-gen-banner { display:flex; align-items:center; gap:8px; margin-bottom:12px; padding:10px 12px; border-radius:10px; background:var(--rw-soft); font-size:13px; font-weight:650; }
.rw-diff-box { margin:0; padding:12px; border-radius:10px; background:rgba(0,0,0,0.25); white-space:pre-wrap; font-size:14px; line-height:1.5; color:#f3f0fa; }
.rw-diff-box.after { outline:1px solid rgba(124,58,237,0.4); }
`;
