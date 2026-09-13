import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import {
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  FileText,
  Loader2,
  MessageSquareSparkles,
  Play,
  RotateCcw,
  Scissors,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { useAppBack } from "@/hooks/useAppBack";
import { parseScriptsTagFilter, scriptsListPath } from "@/lib/scriptsListPath";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShareScript } from "@/components/ShareScript";
import { openSendToWorkspaceModal } from "@/components/SendToWorkspaceModal";
import { TeleprompterMode } from "./TeleprompterMode";

const SELECTION_MIN_LENGTH = 6;

type AiScope = "whole" | "selection";

type UndoSnapshot = {
  content: string;
  label: string;
} | null;

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scriptTypeLabel(recreatedScriptId: number | null | undefined) {
  return recreatedScriptId != null ? "Remake" : "Script";
}

export default function ScriptEditor() {
  const [, params] = useRoute("/scripts/:id");
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const scriptId = params?.id ? Number.parseInt(params.id, 10) : null;
  const backPath = useMemo(
    () => scriptsListPath(parseScriptsTagFilter(searchString)),
    [searchString]
  );
  const handleBack = useAppBack(backPath);
  const utils = trpc.useUtils();

  const scriptQuery = trpc.scripts.get.useQuery(
    { id: scriptId! },
    { enabled: scriptId != null && Number.isFinite(scriptId) }
  );

  const script = scriptQuery.data;
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editStartContent, setEditStartContent] = useState("");
  const [editStartTitle, setEditStartTitle] = useState("");
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiScope, setAiScope] = useState<AiScope>("whole");
  const [selectedText, setSelectedText] = useState("");
  const [selectionBarOpen, setSelectionBarOpen] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot>(null);
  const [lastAiMessage, setLastAiMessage] = useState<string | null>(null);
  const scriptReadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!script) return;
    setContent(script.content ?? "");
    setTitle(script.title ?? "");
    setEditStartContent(script.content ?? "");
    setEditStartTitle(script.title ?? "");
    setSelectedText("");
    setSelectionBarOpen(false);
    setUndoSnapshot(null);
  }, [script?.id]);

  const invalidateScript = useCallback(async () => {
    if (!scriptId) return;
    await Promise.all([
      utils.scripts.get.invalidate({ id: scriptId }),
      utils.scripts.list.invalidate(),
    ]);
  }, [scriptId, utils]);

  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: async () => {
      await invalidateScript();
    },
    onError: (error) => toast.error(error.message || "Could not save script"),
  });

  const aiRewriteMutation = trpc.scripts.aiRewrite.useMutation({
    onSuccess: async (data) => {
      setContent(data.content);
      setEditStartContent(data.content);
      setLastAiMessage("Updated the live script. Undo is available if you want the previous version back.");
      setSelectedText("");
      setSelectionBarOpen(false);
      await invalidateScript();
    },
    onError: (error) => toast.error(error.message || "AI edit failed"),
  });

  const selectionMutation = trpc.scripts.rewriteSelection.useMutation({
    onSuccess: async (data) => {
      setContent(data.content);
      setEditStartContent(data.content);
      setLastAiMessage("Updated only the selected text. The rest of your script stayed unchanged.");
      setSelectedText("");
      setSelectionBarOpen(false);
      await invalidateScript();
    },
    onError: (error) => toast.error(error.message || "AI edit failed"),
  });

  const shortenMutation = trpc.scripts.makeShorter.useMutation({
    onSuccess: async (data) => {
      setContent(data.content);
      setEditStartContent(data.content);
      setLastAiMessage("Shortened the live script for a 45 second delivery.");
      await invalidateScript();
    },
    onError: (error) => toast.error(error.message || "Could not shorten script"),
  });

  const simplifyMutation = trpc.scripts.simplify.useMutation({
    onSuccess: async (data) => {
      setContent(data.content);
      setEditStartContent(data.content);
      setLastAiMessage("Made the live script easier to say on camera.");
      await invalidateScript();
    },
    onError: (error) => toast.error(error.message || "Could not simplify script"),
  });

  const aiPending =
    aiRewriteMutation.isPending ||
    selectionMutation.isPending ||
    shortenMutation.isPending ||
    simplifyMutation.isPending;

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content]
  );
  const durationSeconds = Math.max(1, Math.round(wordCount / 3));
  const scheduledDate = formatDate(script?.postDate);

  const dirty = isEditing && (content !== editStartContent || title !== editStartTitle);

  const startEditing = () => {
    setEditStartContent(content);
    setEditStartTitle(title);
    setIsEditing(true);
    setSelectionBarOpen(false);
  };

  const cancelEditing = () => {
    setContent(editStartContent);
    setTitle(editStartTitle);
    setIsEditing(false);
  };

  const saveEditing = () => {
    if (!scriptId) return;
    const titleChanged = title !== editStartTitle;
    const contentChanged = content !== editStartContent;
    if (!titleChanged && !contentChanged) {
      setIsEditing(false);
      return;
    }

    updateMutation.mutate(
      {
        id: scriptId,
        ...(titleChanged ? { title: title.trim() || editStartTitle } : {}),
        ...(contentChanged
          ? {
              content,
              changeType: "manual_edit" as const,
              changeDescription: "Manual edit from Script Reader",
            }
          : {}),
      },
      {
        onSuccess: () => {
          setEditStartTitle(title.trim() || editStartTitle);
          setEditStartContent(content);
          setIsEditing(false);
          toast.success("Changes saved");
        },
      }
    );
  };

  const safeBack = () => {
    if (dirty && !window.confirm("Leave without saving your script changes?")) return;
    handleBack();
  };

  const openAi = (scope: AiScope = "whole") => {
    if (scope === "selection" && !selectedText.trim()) return;
    setAiScope(scope);
    setAiOpen(true);
    setSelectionBarOpen(false);
  };

  const captureSelection = () => {
    if (isEditing) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (text.length < SELECTION_MIN_LENGTH) {
      setSelectedText("");
      setSelectionBarOpen(false);
      return;
    }
    const container = scriptReadRef.current;
    const anchor = selection?.anchorNode;
    const focus = selection?.focusNode;
    if (!container || !anchor || !focus || !container.contains(anchor) || !container.contains(focus)) {
      setSelectedText("");
      setSelectionBarOpen(false);
      return;
    }
    setSelectedText(text);
    setAiScope("selection");
    setSelectionBarOpen(true);
  };

  const rememberUndo = (label: string) => {
    setUndoSnapshot({ content, label });
  };

  const runWholeAi = (instruction: string) => {
    if (!scriptId || aiPending) return;
    rememberUndo(instruction);
    setLastAiMessage(null);
    aiRewriteMutation.mutate({ scriptId, content, instruction });
  };

  const runSelectionAi = (instruction: string) => {
    if (!scriptId || !selectedText || aiPending) return;
    rememberUndo(instruction);
    setLastAiMessage(null);
    selectionMutation.mutate({
      scriptId,
      fullContent: content,
      selectedText,
      instruction,
    });
  };

  const sendAiPrompt = () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiPrompt("");
    if (aiScope === "selection" && selectedText.trim()) {
      runSelectionAi(prompt);
      return;
    }
    runWholeAi(prompt);
  };

  const quickShorter = () => {
    if (selectedText) {
      runSelectionAi("Make this selected text shorter and easier to say while keeping the same meaning.");
    } else if (scriptId && !aiPending) {
      rememberUndo("Shorten to 45 seconds");
      shortenMutation.mutate({ scriptId, content, targetSeconds: 45 });
    }
  };

  const quickEasier = () => {
    if (selectedText) {
      runSelectionAi("Make this selected text easier and more natural to say on camera while keeping the meaning.");
    } else if (scriptId && !aiPending) {
      rememberUndo("Make easier to say");
      simplifyMutation.mutate({ scriptId, content });
    }
  };

  const undoAi = () => {
    if (!scriptId || !undoSnapshot || updateMutation.isPending) return;
    const previous = undoSnapshot;
    updateMutation.mutate(
      {
        id: scriptId,
        content: previous.content,
        changeType: "manual_edit",
        changeDescription: `Undo AI edit: ${previous.label}`,
      },
      {
        onSuccess: () => {
          setContent(previous.content);
          setEditStartContent(previous.content);
          setUndoSnapshot(null);
          setLastAiMessage("Restored the previous script version.");
          toast.success("AI edit undone");
        },
      }
    );
  };

  if (!scriptId || !Number.isFinite(scriptId)) {
    return <div className="p-6 text-center text-muted-foreground">Script not found</div>;
  }

  if (scriptQuery.isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!script) {
    return <div className="p-6 text-center text-muted-foreground">Script not found</div>;
  }

  return (
    <div className="relative min-h-full bg-background">
      <div className="mx-auto w-full max-w-[1320px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={safeBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">My Scripts</span>
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Script Reader</p>
              <p className="truncate text-sm text-muted-foreground">Read first, edit or ask AI when you need to.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelEditing} disabled={updateMutation.isPending}>
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
                <Button size="sm" onClick={saveEditing} disabled={updateMutation.isPending || !dirty}>
                  {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                  Save changes
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => openAi("whole")}>
              <MessageSquareSparkles className="h-3.5 w-3.5 mr-1.5" />
              Ask SpyReels
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(content).then(() => toast.success("Copied"))}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Copy</span>
            </Button>
            <div className="hidden sm:block">
              <ShareScript title={title} content={content} variant="button" size="sm" />
            </div>
            <Button size="sm" onClick={() => setShowTeleprompter(true)} className="shadow-sm">
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Start filming
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-2xl border border-border/70 bg-card/70 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{scriptTypeLabel(script.recreatedScriptId)}</Badge>
                {script.tags?.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
                <Badge className={script.status === "approved" ? "bg-emerald-600 text-white" : ""} variant={script.status === "approved" ? "default" : "outline"}>
                  {script.status === "approved" ? "Approved" : "Draft"}
                </Badge>
              </div>

              {isEditing ? (
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mb-4 h-auto border-primary/30 bg-background/50 px-3 py-2 text-2xl sm:text-3xl font-bold tracking-tight"
                  aria-label="Script title"
                />
              ) : (
                <h1 className="mb-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
              )}

              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{wordCount} words</span>
                <span>About {durationSeconds}s</span>
                {scheduledDate ? <span>Scheduled {scheduledDate}</span> : null}
                {script.sourceHandle ? <span>Source @{script.sourceHandle}</span> : null}
              </div>

              {isEditing ? (
                <>
                  <Textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    className="min-h-[520px] resize-y border-primary/40 bg-background/40 p-4 text-base leading-8 focus-visible:ring-primary/30 sm:text-lg"
                    placeholder="Write your script..."
                  />
                  <p className="mt-2 text-xs text-muted-foreground">You are editing the same saved script. Save changes when you are done.</p>
                </>
              ) : (
                <div className="relative">
                  <div
                    ref={scriptReadRef}
                    onMouseUp={captureSelection}
                    onTouchEnd={() => window.setTimeout(captureSelection, 50)}
                    className="min-h-[480px] whitespace-pre-wrap rounded-xl border border-border/60 bg-background/25 p-4 text-base leading-8 selection:bg-primary/25 sm:p-5 sm:text-lg"
                  >
                    {content}
                  </div>
                  {selectionBarOpen ? (
                    <div className="sticky bottom-3 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-xl border border-primary/30 bg-popover/95 p-1.5 shadow-2xl backdrop-blur">
                      <span className="max-w-[220px] truncate px-2 text-xs text-muted-foreground">Selected: {selectedText}</span>
                      <Button variant="ghost" size="sm" className="h-8" onClick={quickShorter} disabled={aiPending}>
                        <Scissors className="h-3.5 w-3.5 mr-1" /> Shorter
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => runSelectionAi("Make this selected text punchier and more engaging while keeping the same meaning.")} disabled={aiPending}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Punchier
                      </Button>
                      <Button size="sm" className="h-8" onClick={() => openAi("selection")} disabled={aiPending}>
                        Ask AI
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                One live script, version history stays attached to this record.
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  openSendToWorkspaceModal({ scriptId: script.id, scriptTitle: title })
                }
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send to workspace
              </Button>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Script details</p>
              <DetailRow label="Type" value={scriptTypeLabel(script.recreatedScriptId)} />
              <DetailRow label="Status" value={script.status === "approved" ? "Approved" : "Draft"} />
              <DetailRow label="Length" value={`${wordCount} words`} />
              <DetailRow label="Speaking time" value={`About ${durationSeconds}s`} />
              <DetailRow label="Schedule" value={scheduledDate ?? "Not scheduled"} last />
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick AI edits</p>
              <div className="grid gap-2">
                <Button variant="outline" className="justify-start" onClick={() => runWholeAi("Make the hook stronger and more scroll-stopping. Keep the same topic and factual claims.")} disabled={aiPending}>
                  <Wand2 className="h-4 w-4 mr-2" /> Stronger hook
                </Button>
                <Button variant="outline" className="justify-start" onClick={quickEasier} disabled={aiPending}>
                  <Sparkles className="h-4 w-4 mr-2" /> Easier to say
                </Button>
                <Button variant="outline" className="justify-start" onClick={quickShorter} disabled={aiPending}>
                  <Scissors className="h-4 w-4 mr-2" /> Cut to 45 sec
                </Button>
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={() => setShowTeleprompter(true)}>
              <Play className="h-4 w-4 mr-2" /> Start filming
            </Button>
          </aside>
        </div>
      </div>

      {aiOpen ? (
        <>
          <button
            aria-label="Close Ask SpyReels"
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
            onClick={() => setAiOpen(false)}
          />
          <aside className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[72vh] flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:left-auto sm:top-0 sm:h-screen sm:max-h-none sm:w-[390px] sm:rounded-none sm:rounded-l-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Existing script AI, reused</p>
                <h2 className="mt-1 text-xl font-bold">Ask SpyReels</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {aiScope === "selection" ? "Editing only your selected text." : "Editing the whole live script."}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAiOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {aiScope === "selection" && selectedText ? (
                <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Selected:</span> {selectedText}
                </div>
              ) : null}

              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm leading-6">
                Tell me what to change. I will update this same script and keep the change in its existing version history.
              </div>

              {lastAiMessage ? (
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  <div className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{lastAiMessage}</span>
                  </div>
                  {undoSnapshot ? (
                    <Button variant="ghost" size="sm" className="mt-2 h-8 text-emerald-200 hover:text-emerald-100" onClick={undoAi} disabled={updateMutation.isPending}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Undo AI edit
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => aiScope === "selection" ? runSelectionAi("Make this sound more natural and conversational on camera.") : runWholeAi("Make this sound more natural and conversational on camera.")} disabled={aiPending}>More natural</Button>
                <Button variant="outline" size="sm" onClick={() => aiScope === "selection" ? runSelectionAi("Make this hook or selected wording stronger and more engaging.") : runWholeAi("Make the hook stronger and more engaging while keeping the same topic.")} disabled={aiPending}>Stronger hook</Button>
                <Button variant="outline" size="sm" onClick={quickEasier} disabled={aiPending}>Easier to say</Button>
                <Button variant="outline" size="sm" onClick={quickShorter} disabled={aiPending}>Shorter</Button>
              </div>
            </div>

            <div className="border-t border-border/60 p-3 sm:p-4">
              <div className="flex gap-2">
                <Input
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendAiPrompt();
                    }
                  }}
                  placeholder={aiScope === "selection" ? "What should I change in this selection?" : "Ask SpyReels to improve this script..."}
                  disabled={aiPending}
                />
                <Button onClick={sendAiPrompt} disabled={!aiPrompt.trim() || aiPending}>
                  {aiPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </aside>
        </>
      ) : null}

      {showTeleprompter ? (
        <TeleprompterMode script={content} onClose={() => setShowTeleprompter(false)} />
      ) : null}
    </div>
  );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2.5 text-sm ${last ? "" : "border-b border-border/50"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
