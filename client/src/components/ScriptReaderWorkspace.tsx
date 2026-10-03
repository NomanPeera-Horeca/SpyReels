import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Check,
  Clipboard,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { TeleprompterMode } from "@/pages/TeleprompterMode";

const QUICK_AI_ACTIONS = [
  {
    label: "Stronger hook",
    instruction:
      "Make the opening hook substantially stronger and more scroll-stopping. Keep the same topic, facts, and core message.",
  },
  {
    label: "More natural",
    instruction:
      "Make this sound more natural and conversational when spoken on camera. Keep the same topic and key points.",
  },
  {
    label: "Easier to say",
    instruction:
      "Make this easier to say out loud on camera. Use shorter sentences, simpler phrasing, and natural spoken rhythm without losing the meaning.",
  },
] as const;

function formatSchedule(date: string | Date | null | undefined, time?: string | null) {
  if (!date) return "Not scheduled";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return "Not scheduled";
  const formatted = parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return time ? `${formatted}, ${time}` : formatted;
}

function selectionBelongsTo(container: HTMLElement | null, selection: Selection | null) {
  if (!container || !selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  return container.contains(node.nodeType === Node.TEXT_NODE ? node.parentNode : node);
}

export function ScriptReaderWorkspace({
  scriptId,
  backPath,
}: {
  scriptId: number;
  backPath: string;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const scriptQuery = trpc.scripts.get.useQuery(
    { id: scriptId },
    { staleTime: 10_000, retry: false }
  );
  const brollQuery = trpc.scripts.getBrollGeneration.useQuery(
    { scriptId },
    { staleTime: 30_000, retry: false }
  );
  const script = scriptQuery.data;
  const savedCaption =
    (script as { generatedCaption?: string | null } | undefined)?.generatedCaption?.trim() || "";
  const savedFrame0 =
    (script as { frame0OnScreenText?: string | null } | undefined)?.frame0OnScreenText?.trim() || "";
  const brollBeats = brollQuery.data?.result?.beats?.length ?? 0;

  const [content, setContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [showSelectionTools, setShowSelectionTools] = useState(false);
  const [undoContent, setUndoContent] = useState<string | null>(null);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const scriptTextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!script || isEditing) return;
    setContent(script.content ?? "");
  }, [script?.id, script?.content, isEditing]);

  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.scripts.get.invalidate({ id: scriptId }),
        utils.scripts.list.invalidate(),
      ]);
    },
  });

  const rewriteMutation = trpc.scripts.aiRewrite.useMutation({
    onSuccess: async (data) => {
      setContent(data.content);
      setSelectedText("");
      setShowSelectionTools(false);
      await Promise.all([
        utils.scripts.get.invalidate({ id: scriptId }),
        utils.scripts.list.invalidate(),
      ]);
      toast.success("SpyReels updated the script");
    },
    onError: (error) => toast.error(error.message || "AI edit failed"),
  });

  const selectionMutation = trpc.scripts.rewriteSelection.useMutation({
    onSuccess: async (data) => {
      setContent(data.content);
      setSelectedText("");
      setShowSelectionTools(false);
      await Promise.all([
        utils.scripts.get.invalidate({ id: scriptId }),
        utils.scripts.list.invalidate(),
      ]);
      toast.success("Selected text updated");
    },
    onError: (error) => toast.error(error.message || "AI edit failed"),
  });

  const shorterMutation = trpc.scripts.makeShorter.useMutation({
    onSuccess: async (data) => {
      setContent(data.content);
      await Promise.all([
        utils.scripts.get.invalidate({ id: scriptId }),
        utils.scripts.list.invalidate(),
      ]);
      toast.success("Script shortened to about 45 seconds");
    },
    onError: (error) => toast.error(error.message || "Could not shorten script"),
  });

  const aiBusy =
    rewriteMutation.isPending ||
    selectionMutation.isPending ||
    shorterMutation.isPending ||
    updateMutation.isPending;

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content]
  );

  const beginEdit = useCallback(() => {
    setEditSnapshot(content);
    setIsEditing(true);
    setShowSelectionTools(false);
    setSelectedText("");
  }, [content]);

  const cancelEdit = useCallback(() => {
    setContent(editSnapshot || script?.content || "");
    setIsEditing(false);
  }, [editSnapshot, script?.content]);

  const saveManualEdit = useCallback(async () => {
    if (!content.trim()) {
      toast.error("Script cannot be empty");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: scriptId,
        content,
        changeType: "manual_edit",
        changeDescription: "Manual edit from Script Reader",
      });
      setIsEditing(false);
      toast.success("Script saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save script");
    }
  }, [content, scriptId, updateMutation]);

  const captureSelection = useCallback(() => {
    if (isEditing) return;
    const selection = window.getSelection();
    if (!selectionBelongsTo(scriptTextRef.current, selection)) {
      setShowSelectionTools(false);
      return;
    }
    const text = selection?.toString().trim() ?? "";
    if (text.length < 6) {
      setShowSelectionTools(false);
      setSelectedText("");
      return;
    }
    setSelectedText(text);
    setShowSelectionTools(true);
  }, [isEditing]);

  const runAi = useCallback(
    async (instruction: string, forceSelection?: string) => {
      const trimmedInstruction = instruction.trim();
      if (!trimmedInstruction || !content.trim() || aiBusy) return;
      const targetSelection = (forceSelection ?? selectedText).trim();
      setUndoContent(content);
      try {
        if (targetSelection) {
          await selectionMutation.mutateAsync({
            scriptId,
            fullContent: content,
            selectedText: targetSelection,
            instruction: trimmedInstruction,
          });
        } else {
          await rewriteMutation.mutateAsync({
            scriptId,
            content,
            instruction: trimmedInstruction,
          });
        }
      } catch {
        setUndoContent(null);
      }
    },
    [aiBusy, content, rewriteMutation, scriptId, selectedText, selectionMutation]
  );

  const undoLastAiEdit = useCallback(async () => {
    if (!undoContent || updateMutation.isPending) return;
    const previous = undoContent;
    setUndoContent(null);
    try {
      await updateMutation.mutateAsync({
        id: scriptId,
        content: previous,
        changeType: "manual_edit",
        changeDescription: "Undo AI edit from Script Reader",
      });
      setContent(previous);
      toast.success("AI edit undone");
    } catch (error) {
      setUndoContent(previous);
      toast.error(error instanceof Error ? error.message : "Could not undo change");
    }
  }, [scriptId, undoContent, updateMutation]);

  const copyScript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Script copied");
    } catch {
      toast.error("Could not copy script");
    }
  }, [content]);

  if (scriptQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening script...
      </div>
    );
  }

  if (scriptQuery.isError || !script) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-base font-semibold">Could not open this script</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Return to My Scripts and try again.
          </p>
          <Button className="mt-4" onClick={() => navigate(backPath)}>
            Back to My Scripts
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-2 gap-1.5 text-muted-foreground"
              onClick={() => navigate(backPath)}
            >
              <ArrowLeft className="h-4 w-4" /> My Scripts
            </Button>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Script Reader</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Read first. Edit, ask SpyReels, or start filming when you are ready.
            </p>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            {isEditing ? (
              <>
                <Button variant="outline" onClick={cancelEdit} disabled={updateMutation.isPending}>
                  Cancel
                </Button>
                <Button onClick={() => void saveManualEdit()} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Save changes
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={beginEdit}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" onClick={() => setAiOpen(true)}>
                  <Sparkles className="mr-2 h-4 w-4" /> Ask SpyReels
                </Button>
                <Button onClick={() => setShowTeleprompter(true)}>
                  <Play className="mr-2 h-4 w-4" /> Start filming
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-2xl border bg-card/40 p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {script.recreatedScriptId != null ? (
                <Badge variant="secondary">Remake</Badge>
              ) : null}
              {script.tags?.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  style={{ borderColor: `${tag.color}66`, color: tag.color }}
                >
                  {tag.name}
                </Badge>
              ))}
              <Badge
                className={
                  script.status === "approved"
                    ? "bg-emerald-600/15 text-emerald-500 hover:bg-emerald-600/15"
                    : ""
                }
                variant={script.status === "approved" ? "secondary" : "outline"}
              >
                {script.status === "approved" ? "Approved" : "Draft"}
              </Badge>
            </div>

            <h2 className="max-w-4xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {script.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{wordCount} words</span>
              <span aria-hidden>•</span>
              <span>{formatSchedule(script.postDate, (script as { postTime?: string | null }).postTime)}</span>
            </div>

            <div className="relative mt-5">
              {isEditing ? (
                <Textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="min-h-[440px] resize-y rounded-xl border-primary/50 bg-background/35 p-4 text-base leading-8 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] sm:p-5 sm:text-lg"
                  autoFocus
                />
              ) : (
                <div
                  ref={scriptTextRef}
                  onMouseUp={captureSelection}
                  onTouchEnd={captureSelection}
                  className="min-h-[440px] whitespace-pre-wrap rounded-xl border border-border/70 bg-background/25 p-4 text-base leading-8 text-foreground selection:bg-primary/30 sm:p-5 sm:text-lg"
                >
                  {content}
                </div>
              )}

              {showSelectionTools && !isEditing ? (
                <div className="absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-xl border border-primary/35 bg-popover/95 p-1.5 shadow-xl backdrop-blur">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void runAi("Make only this selected text shorter and easier to say.", selectedText)}
                    disabled={aiBusy}
                  >
                    Shorter
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void runAi("Make only this selected text punchier and more compelling while keeping the meaning.", selectedText)}
                    disabled={aiBusy}
                  >
                    Punchier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAiOpen(true)}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Ask AI
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setSelectedText("");
                      setShowSelectionTools(false);
                      window.getSelection()?.removeAllRanges();
                    }}
                    aria-label="Close selection tools"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            {isEditing ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Manual changes save to this same script and its existing version history.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Highlight any sentence to edit only that part with SpyReels.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
              {isEditing ? (
                <>
                  <Button variant="outline" className="flex-1" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={() => void saveManualEdit()} disabled={updateMutation.isPending}>
                    Save changes
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={beginEdit} className="flex-1">
                    <Pencil className="mr-1.5 h-4 w-4" /> Edit
                  </Button>
                  <Button variant="outline" onClick={() => setAiOpen(true)} className="flex-1">
                    <Sparkles className="mr-1.5 h-4 w-4" /> Ask SpyReels
                  </Button>
                  <Button onClick={() => setShowTeleprompter(true)} className="basis-full">
                    <Play className="mr-1.5 h-4 w-4" /> Start filming
                  </Button>
                </>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border bg-card/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Remake pack
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Same durable Remake object as the workspace. No re-run needed.
              </p>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Caption</p>
                  {savedCaption ? (
                    <div className="mt-1 flex items-start justify-between gap-2">
                      <p className="line-clamp-4 text-[13px] leading-snug">{savedCaption}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Copy caption"
                        onClick={() => {
                          void navigator.clipboard.writeText(savedCaption).then(
                            () => toast.success("Caption copied"),
                            () => toast.error("Could not copy caption")
                          );
                        }}
                      >
                        <Clipboard className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Generate a caption in Remake Visuals / publishing.
                    </p>
                  )}
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">B-roll</p>
                  <p className="mt-1 text-[13px]">
                    {brollQuery.isLoading
                      ? "Loading…"
                      : brollBeats > 0
                        ? `${brollBeats} matched beat${brollBeats === 1 ? "" : "s"} saved`
                        : "No stock pack yet"}
                  </p>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Opening Hook</p>
                  <p className="mt-1 text-[13px] font-semibold tracking-tight">
                    {savedFrame0 || "Edit in Remake Preview"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Script details
              </p>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium capitalize">{script.status}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Schedule</dt>
                  <dd className="max-w-[170px] text-right font-medium">
                    {formatSchedule(script.postDate, (script as { postTime?: string | null }).postTime)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Next action</dt>
                  <dd className="font-medium">Film</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border bg-card/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Quick AI edits
              </p>
              <div className="mt-3 grid gap-2">
                {QUICK_AI_ACTIONS.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    className="justify-start"
                    disabled={aiBusy}
                    onClick={() => void runAi(action.instruction)}
                  >
                    <Sparkles className="mr-2 h-4 w-4 text-primary" />
                    {action.label}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  className="justify-start"
                  disabled={aiBusy}
                  onClick={() => {
                    setUndoContent(content);
                    shorterMutation.mutate({
                      scriptId,
                      content,
                      targetSeconds: 45,
                    });
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-primary" /> Cut to 45 sec
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border bg-card/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                More
              </p>
              <div className="mt-3 grid gap-2">
                <Button variant="outline" className="justify-start" onClick={copyScript}>
                  <Clipboard className="mr-2 h-4 w-4" /> Copy script
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => navigate(`/scripts/${scriptId}`)}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Open full editor
                </Button>
                {undoContent ? (
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => void undoLastAiEdit()}
                    disabled={updateMutation.isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Undo AI edit
                  </Button>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {aiOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/35 sm:bg-black/20" onClick={() => setAiOpen(false)}>
          <aside
            className="absolute inset-x-0 bottom-0 flex max-h-[72vh] flex-col rounded-t-2xl border bg-background shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[390px] sm:rounded-none sm:rounded-l-2xl"
            onClick={(event) => event.stopPropagation()}
            aria-label="Ask SpyReels"
          >
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Existing Script AI
                </p>
                <h2 className="mt-1 text-xl font-bold">Ask SpyReels</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedText
                    ? "Only your selected text will change."
                    : "SpyReels will update this same live script."}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setAiOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {selectedText ? (
                <div className="mb-4 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Selected:</span> “{selectedText.slice(0, 240)}{selectedText.length > 240 ? "..." : ""}”
                </div>
              ) : null}

              <div className="rounded-xl border bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
                Tell me what to change. The existing SpyReels rewrite engine updates the script directly and keeps the existing version history.
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {QUICK_AI_ACTIONS.map((action) => (
                  <Button
                    key={action.label}
                    size="sm"
                    variant="outline"
                    disabled={aiBusy}
                    onClick={() => void runAi(action.instruction)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex items-end gap-2">
                <Textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  placeholder={
                    selectedText
                      ? "What should SpyReels change in this selection?"
                      : "Ask SpyReels to improve this script..."
                  }
                  className="min-h-[76px] resize-none"
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      if (aiPrompt.trim()) {
                        void runAi(aiPrompt);
                        setAiPrompt("");
                      }
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  disabled={!aiPrompt.trim() || aiBusy}
                  onClick={() => {
                    const prompt = aiPrompt.trim();
                    if (!prompt) return;
                    void runAi(prompt);
                    setAiPrompt("");
                  }}
                >
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {undoContent ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => void undoLastAiEdit()}
                  disabled={updateMutation.isPending}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Undo last AI edit
                </Button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {showTeleprompter ? (
        <TeleprompterMode script={content} onClose={() => setShowTeleprompter(false)} />
      ) : null}
    </>
  );
}
