import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  History,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAppBack } from "@/hooks/useAppBack";
import { parseScriptsTagFilter, scriptsListPath } from "@/lib/scriptsListPath";
import { TeleprompterMode } from "./TeleprompterMode";

const QUICK_AI_ACTIONS = [
  { label: "Stronger hook", instruction: "Make the opening hook much stronger and more scroll-stopping while keeping the same topic and facts." },
  { label: "Easier to say", instruction: "Make this easier and more natural to say out loud on camera. Use short conversational sentences." },
  { label: "More natural", instruction: "Make this sound more natural, human, and conversational without changing the core message." },
] as const;

type AiTarget = "whole" | "selection";

type VersionLike = {
  id: number;
  versionNumber: number;
  changeDescription?: string | null;
  createdAt?: string | Date | null;
};

function formatSchedule(date: string | Date | null | undefined, time?: string | null) {
  if (!date) return "Not scheduled";
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "Not scheduled";
  const label = value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return time ? `${label} · ${time}` : label;
}

export default function ScriptReader() {
  const [, params] = useRoute("/scripts/:id");
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const scriptId = params?.id ? Number(params.id) : null;
  const backPath = useMemo(
    () => scriptsListPath(parseScriptsTagFilter(searchString)),
    [searchString]
  );
  const handleBack = useAppBack(backPath);
  const utils = trpc.useUtils();

  const scriptQuery = trpc.scripts.get.useQuery(
    { id: scriptId! },
    { enabled: Number.isFinite(scriptId) && !!scriptId }
  );
  const script = scriptQuery.data;

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<{ title: string; content: string } | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [aiTarget, setAiTarget] = useState<AiTarget>("whole");
  const [showHistory, setShowHistory] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [undoVersionId, setUndoVersionId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!script) return;
    setContent(script.content ?? "");
    setTitle(script.title ?? "Untitled script");
  }, [script?.id, script?.content, script?.title]);

  const versions = useMemo(() => {
    const items = ((script as { versions?: VersionLike[] } | undefined)?.versions ?? []).slice();
    return items.sort((a, b) => b.versionNumber - a.versionNumber);
  }, [script]);

  const captureUndoVersion = useCallback(() => {
    const current = versions[0];
    setUndoVersionId(current?.id ?? null);
  }, [versions]);

  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: () => {
      void utils.scripts.get.invalidate({ id: scriptId! });
      void utils.scripts.list.invalidate();
      setIsEditing(false);
      setEditSnapshot(null);
      toast.success("Script saved");
    },
    onError: () => toast.error("Could not save script"),
  });

  const rewriteMutation = trpc.scripts.aiRewrite.useMutation({
    onSuccess: (data) => {
      setContent(data.content);
      void utils.scripts.get.invalidate({ id: scriptId! });
      void utils.scripts.list.invalidate();
      toast.success("SpyReels updated the script");
    },
    onError: () => toast.error("SpyReels could not update the script"),
  });

  const rewriteSelectionMutation = trpc.scripts.rewriteSelection.useMutation({
    onSuccess: (data) => {
      setContent(data.content);
      setSelectedText("");
      setAiTarget("whole");
      void utils.scripts.get.invalidate({ id: scriptId! });
      void utils.scripts.list.invalidate();
      toast.success("Selection updated");
    },
    onError: () => toast.error("Could not update that selection"),
  });

  const shorterMutation = trpc.scripts.makeShorter.useMutation({
    onSuccess: (data) => {
      setContent(data.content);
      void utils.scripts.get.invalidate({ id: scriptId! });
      void utils.scripts.list.invalidate();
      toast.success("Script shortened");
    },
    onError: () => toast.error("Could not shorten the script"),
  });

  const simplifyMutation = trpc.scripts.simplify.useMutation({
    onSuccess: (data) => {
      setContent(data.content);
      void utils.scripts.get.invalidate({ id: scriptId! });
      void utils.scripts.list.invalidate();
      toast.success("Script made easier to say");
    },
    onError: () => toast.error("Could not simplify the script"),
  });

  const restoreMutation = trpc.scripts.restoreVersion.useMutation({
    onSuccess: (data) => {
      setContent(data.content);
      setUndoVersionId(null);
      void utils.scripts.get.invalidate({ id: scriptId! });
      void utils.scripts.list.invalidate();
      toast.success("Previous version restored");
    },
    onError: () => toast.error("Could not restore that version"),
  });

  const aiPending = rewriteMutation.isPending || rewriteSelectionMutation.isPending || shorterMutation.isPending || simplifyMutation.isPending;

  const beginEdit = () => {
    setEditSnapshot({ title, content });
    setIsEditing(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const cancelEdit = () => {
    if (editSnapshot) {
      setTitle(editSnapshot.title);
      setContent(editSnapshot.content);
    }
    setIsEditing(false);
    setEditSnapshot(null);
  };

  const saveManualEdit = () => {
    if (!scriptId || !title.trim() || !content.trim()) return;
    updateMutation.mutate({
      id: scriptId,
      title: title.trim(),
      content: content.trim(),
      changeType: "manual_edit",
      changeDescription: "Manual edit from Script Reader",
    });
  };

  const rememberSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const selected = content.slice(el.selectionStart, el.selectionEnd).trim();
    if (selected.length >= 6) {
      setSelectedText(selected);
      setAiTarget("selection");
    } else {
      setSelectedText("");
      setAiTarget("whole");
    }
  };

  const openAi = (target: AiTarget = selectedText ? "selection" : "whole") => {
    setAiTarget(target);
    setShowAi(true);
  };

  const applyAi = (instruction: string) => {
    if (!scriptId || !content.trim() || !instruction.trim() || aiPending) return;
    captureUndoVersion();
    if (aiTarget === "selection" && selectedText) {
      rewriteSelectionMutation.mutate({
        scriptId,
        fullContent: content,
        selectedText,
        instruction: instruction.trim(),
      });
    } else {
      rewriteMutation.mutate({
        scriptId,
        content,
        instruction: instruction.trim(),
      });
    }
    setAiInstruction("");
  };

  const copyScript = async () => {
    await navigator.clipboard.writeText(content);
    toast.success("Script copied");
  };

  if (!scriptId || scriptQuery.isError) {
    return <div className="p-6 text-center text-muted-foreground">Script not found</div>;
  }

  if (scriptQuery.isLoading || !script) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (showTeleprompter) {
    return <TeleprompterMode script={content} onClose={() => setShowTeleprompter(false)} />;
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const scheduledLabel = formatSchedule(script.postDate, (script as { postTime?: string | null }).postTime);

  return (
    <div className="relative mx-auto w-full max-w-[1320px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={handleBack} className="mb-2 -ml-2 text-muted-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> My Scripts
          </Button>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Script Reader</h1>
          <p className="mt-1 text-sm text-muted-foreground">Read first. Edit or ask SpyReels only when you need to.</p>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
              <Button onClick={saveManualEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save changes
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={beginEdit}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
              <Button variant="outline" onClick={() => openAi()}><Sparkles className="mr-2 h-4 w-4" />Ask SpyReels</Button>
              <Button onClick={() => setShowTeleprompter(true)}><Play className="mr-2 h-4 w-4" />Start filming</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-2xl border border-border/70 bg-card/30 p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {script.recreatedScriptId != null ? <Badge variant="secondary">Remake</Badge> : null}
            {script.tags?.map((tag) => <Badge key={tag.id} variant="outline">{tag.name}</Badge>)}
            <Badge className={script.status === "approved" ? "bg-emerald-600 text-white" : ""} variant={script.status === "approved" ? "default" : "secondary"}>
              {script.status === "approved" ? "Approved" : "Draft"}
            </Badge>
          </div>

          {isEditing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mb-4 w-full border-0 bg-transparent p-0 text-3xl font-bold tracking-tight outline-none sm:text-4xl"
              aria-label="Script title"
            />
          ) : (
            <h2 className="mb-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{wordCount} words</span>
            <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{scheduledLabel}</span>
          </div>

          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={content}
              readOnly={!isEditing}
              onChange={(e) => setContent(e.target.value)}
              onSelect={rememberSelection}
              onMouseUp={rememberSelection}
              className={`min-h-[430px] resize-none rounded-xl px-4 py-4 text-[17px] leading-8 sm:min-h-[520px] sm:px-5 sm:py-5 sm:text-lg ${
                isEditing
                  ? "border-primary/60 bg-background/70 ring-2 ring-primary/10"
                  : "cursor-text border-border/60 bg-background/35 focus-visible:ring-0"
              }`}
              aria-label={isEditing ? "Edit script" : "Read script"}
            />

            {!isEditing && selectedText ? (
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-primary/30 bg-popover p-1 shadow-xl">
                <Button size="sm" variant="ghost" onClick={() => { setAiTarget("selection"); applyAi("Make this selected text shorter and tighter while keeping the meaning."); }}>Shorter</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAiTarget("selection"); applyAi("Make this selected text punchier and more compelling for spoken short-form video."); }}>Punchier</Button>
                <Button size="sm" variant="ghost" onClick={() => openAi("selection")}><Wand2 className="mr-1.5 h-3.5 w-3.5" />Ask AI</Button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 md:hidden">
            {isEditing ? (
              <>
                <Button variant="outline" className="flex-1" onClick={cancelEdit}>Cancel</Button>
                <Button className="flex-1" onClick={saveManualEdit} disabled={updateMutation.isPending}>Save changes</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={beginEdit}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
                <Button variant="outline" onClick={() => openAi()}><Sparkles className="mr-1.5 h-4 w-4" />Ask SpyReels</Button>
                <Button className="flex-1" onClick={() => setShowTeleprompter(true)}><Play className="mr-1.5 h-4 w-4" />Start filming</Button>
              </>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card/30 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Script details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3 border-b border-border/60 pb-3"><span className="text-muted-foreground">Status</span><strong className="capitalize">{script.status}</strong></div>
              <div className="flex justify-between gap-3 border-b border-border/60 pb-3"><span className="text-muted-foreground">Words</span><strong>{wordCount}</strong></div>
              <div className="flex justify-between gap-3 border-b border-border/60 pb-3"><span className="text-muted-foreground">Schedule</span><strong className="text-right">{scheduledLabel}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Next action</span><strong>Film</strong></div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/30 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick AI edits</h3>
            <div className="space-y-2">
              {QUICK_AI_ACTIONS.map((action) => (
                <Button key={action.label} variant="outline" className="w-full justify-between" disabled={aiPending} onClick={() => { setAiTarget("whole"); applyAi(action.instruction); }}>
                  {action.label}<ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              ))}
              <Button variant="outline" className="w-full justify-between" disabled={aiPending} onClick={() => { if (!scriptId) return; captureUndoVersion(); shorterMutation.mutate({ scriptId, content, targetSeconds: 45 }); }}>
                Cut to 45 seconds<ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={copyScript}><Copy className="mr-1.5 h-4 w-4" />Copy</Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowHistory(true)}><History className="mr-1.5 h-4 w-4" />History</Button>
          </div>
        </aside>
      </div>

      {showAi ? (
        <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAi(false); }}>
          <aside className="absolute inset-x-0 bottom-0 flex max-h-[72vh] flex-col rounded-t-2xl border border-border bg-background shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[390px] md:rounded-none md:rounded-l-2xl">
            <div className="flex items-start justify-between border-b border-border p-4">
              <div>
                <div className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-primary" />Ask SpyReels</div>
                <p className="mt-1 text-xs text-muted-foreground">Uses the same saved script and existing AI rewrite history.</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowAi(false)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-xl border border-border/70 bg-muted/25 p-3 text-sm">
                {aiTarget === "selection" && selectedText ? (
                  <><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Selected text</div><p className="line-clamp-4 text-muted-foreground">“{selectedText}”</p></>
                ) : (
                  <><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Whole script</div><p className="text-muted-foreground">Your instruction will update the same live script. Nothing is copied into a second editor.</p></>
                )}
              </div>

              {undoVersionId ? (
                <Button variant="outline" className="mt-3 w-full" disabled={restoreMutation.isPending} onClick={() => scriptId && restoreMutation.mutate({ scriptId, versionId: undoVersionId })}>
                  <RotateCcw className="mr-2 h-4 w-4" />Undo last AI change
                </Button>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {QUICK_AI_ACTIONS.map((action) => (
                  <Button key={action.label} size="sm" variant="outline" disabled={aiPending} onClick={() => applyAi(action.instruction)}>{action.label}</Button>
                ))}
              </div>
            </div>

            <div className="border-t border-border p-4">
              <div className="flex gap-2">
                <Textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  placeholder={aiTarget === "selection" ? "What should I change in this selection?" : "Ask SpyReels to improve this script..."}
                  className="min-h-[82px] resize-none"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") applyAi(aiInstruction);
                  }}
                />
                <Button size="icon" className="h-[82px] w-12" disabled={!aiInstruction.trim() || aiPending} onClick={() => applyAi(aiInstruction)}>
                  {aiPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {showHistory ? (
        <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowHistory(false); }}>
          <aside className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-border bg-background p-4 shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[390px] md:rounded-none md:rounded-l-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div><h3 className="font-semibold">Version history</h3><p className="text-xs text-muted-foreground">Existing script history, reused.</p></div>
              <Button size="icon" variant="ghost" onClick={() => setShowHistory(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2">
              {versions.map((version, index) => (
                <div key={version.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div><div className="text-sm font-medium">Version {version.versionNumber}</div><div className="mt-1 text-xs text-muted-foreground">{version.changeDescription || "Script update"}</div></div>
                    {index === 0 ? <Badge variant="secondary"><Check className="mr-1 h-3 w-3" />Current</Badge> : <Button size="sm" variant="outline" disabled={restoreMutation.isPending} onClick={() => restoreMutation.mutate({ scriptId, versionId: version.id })}>Restore</Button>}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
