import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePostHog } from "@posthog/react";
import {
  Lightbulb, Send, Loader2, CheckCircle2, XCircle, Clock,
  Trash2, RotateCcw, FileText, Plus, ChevronDown, Zap,
  Mic, Sparkles, ThumbsUp, ThumbsDown, Pencil,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link } from "wouter";

const TONE_OPTIONS = [
  { value: "engaging", label: "Engaging", emoji: "🎯" },
  { value: "casual", label: "Casual", emoji: "😎" },
  { value: "professional", label: "Professional", emoji: "💼" },
  { value: "humorous", label: "Humorous", emoji: "😂" },
  { value: "educational", label: "Educational", emoji: "📚" },
];

const CREATOR_GOALS = [
  { value: "balanced", label: "Balanced", hint: "Hook + trust mix" },
  { value: "growth_virality", label: "Max reach", hint: "Discovery-first" },
  { value: "personal_brand", label: "Personal brand", hint: "Calendar & voice" },
  { value: "education_authority", label: "Teach / authority", hint: "Saves & clarity" },
  { value: "warm_promo", label: "Soft promo", hint: "Value then offer" },
] as const;

const FILMING_FORMATS = [
  {
    id: "talking_head",
    label: "You on camera, speaking",
    icon: "🎥",
    sub: "Selfie-style, face to camera",
  },
  {
    id: "broll_voiceover",
    label: "Show your space or product, speak over it",
    icon: "🏨",
    sub: "B-roll footage, your voice narrates",
  },
  {
    id: "faceless_text",
    label: "No face, text on screen",
    icon: "✍️",
    sub: "Faceless, text animates over video",
  },
  {
    id: "tutorial_demo",
    label: "Tutorial or step-by-step",
    icon: "📋",
    sub: "Whiteboard, demo, or screen recording",
  },
  {
    id: "before_after",
    label: "Before and After",
    icon: "⚡",
    sub: "Show the transformation or result",
  },
] as const;

type IdeaStatus = "queued" | "validating" | "awaiting_approval" | "processing" | "completed" | "failed";

const STATUS_CONFIG: Record<IdeaStatus, { icon: typeof Clock; color: string; label: string; bg: string }> = {
  queued: { icon: Clock, color: "text-yellow-400", label: "In Queue", bg: "bg-yellow-400/10" },
  validating: { icon: Sparkles, color: "text-purple-400", label: "AI Reviewing...", bg: "bg-purple-400/10" },
  awaiting_approval: { icon: AlertTriangle, color: "text-amber-400", label: "Needs Your Approval", bg: "bg-amber-400/10" },
  processing: { icon: Loader2, color: "text-blue-400", label: "Generating Script...", bg: "bg-blue-400/10" },
  completed: { icon: CheckCircle2, color: "text-green-400", label: "Ready", bg: "bg-green-400/10" },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed", bg: "bg-red-400/10" },
};

function IdeaScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? "text-sky-300 border-sky-400/30 bg-sky-400/10"
      : score >= 5 ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
      : "text-red-400 border-red-400/30 bg-red-400/10";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color}`} title="AI score for your raw idea (before scripting)">
      Idea {score}/10
    </span>
  );
}

function ScriptJudgeBadge(props: {
  score: number;
  decision?: string | null;
  attempts?: number;
}) {
  const { score, decision, attempts } = props;
  const color =
    score >= 8 ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
      : score >= 7 ? "text-green-400/90 border-green-400/25 bg-green-400/10"
      : score >= 5 ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
      : "text-orange-300 border-orange-400/35 bg-orange-400/10";
  const flagged = decision === "accepted_after_max_attempts";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color}`}
      title={
        flagged
          ? "Script judge kept the final pass after retries. Review manually if needed."
          : "Automated QC score on the drafted script."
      }
    >
      Script {score}/10{attempts && attempts > 1 ? ` · ${attempts} passes` : ""}{flagged ? " · review" : ""}
    </span>
  );
}

function creatorGoalSlugFromListedIdea(idea: { viralStructure?: unknown }): string | undefined {
  const vs = idea.viralStructure;
  if (!vs || typeof vs !== "object") return undefined;
  const m = (vs as Record<string, unknown>).ideaMeta;
  if (!m || typeof m !== "object") return undefined;
  const slug = (m as Record<string, unknown>).creatorGoal;
  return typeof slug === "string" ? slug : undefined;
}

function getPendingQuestion(idea: { viralStructure?: unknown }): string | null {
  const vs = idea.viralStructure;
  if (!vs || typeof vs !== "object" || vs === null) return null;
  const q = (vs as Record<string, unknown>).pendingQuestion;
  return typeof q === "string" && q.trim() ? q.trim() : null;
}

function viralStructureJudge(idea: { viralStructure?: unknown }): {
  finalScore: number | null;
  attempts: number;
  decision?: string | null;
} {
  const vs = idea.viralStructure as Record<string, unknown> | null | undefined;
  const jq = vs?.ideaScriptJudge as Record<string, unknown> | undefined;
  if (!jq) return { finalScore: null, attempts: 0 };
  const att = jq.attempts;
  const n = Array.isArray(att) ? att.length : 0;
  const raw = jq.finalOverallScore;
  const finalScore =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseFloat(raw) : null;
  return {
    finalScore: Number.isFinite(finalScore) ? finalScore : null,
    attempts: n || 1,
    decision: typeof jq.finalDecision === "string" ? jq.finalDecision : null,
  };
}

export default function IdeaToScript() {
  const posthog = usePostHog();
  const { user } = useAuth();

  const [ideaText, setIdeaText] = useState("");
  const [filmingFormat, setFilmingFormat] = useState<string>("");
  const [customFormat, setCustomFormat] = useState<string>("");
  const [formatOpen, setFormatOpen] = useState(false);
  const [formatError, setFormatError] = useState(false);
  const [expandedIdea, setExpandedIdea] = useState<number | null>(null);
  const [editingIdeaId, setEditingIdeaId] = useState<number | null>(null);
  const [editedIdeaText, setEditedIdeaText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();
  const ideasQuery = trpc.ideas.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasPending = data.some((i: any) =>
        i.status === "queued" || i.status === "processing" || i.status === "validating"
      );
      return hasPending ? 3000 : false;
    },
  });

  const submitMutation = trpc.ideas.submit.useMutation({
    onSuccess: () => {
      toast.success("Idea submitted! AI is reviewing it now...");
      setIdeaText("");
      utils.ideas.list.invalidate();
      textareaRef.current?.focus();
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMutation = trpc.ideas.approve.useMutation({
    onSuccess: (data, variables) => {
      if (variables.action === "reject") {
        toast.info("Idea rejected.");
      } else if (variables.action === "edit") {
        toast.success("Idea updated! AI is re-evaluating your version...");
      } else {
        toast.success("Approved! Script generation started.");
      }
      setEditingIdeaId(null);
      setEditedIdeaText("");
      utils.ideas.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.ideas.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.ideas.list.cancel();
      const prev = utils.ideas.list.getData();
      utils.ideas.list.setData(undefined, (old) => old?.filter((i) => i.id !== id));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) utils.ideas.list.setData(undefined, context.prev);
    },
    onSettled: () => utils.ideas.list.invalidate(),
  });

  const retryMutation = trpc.ideas.retry.useMutation({
    onSuccess: () => {
      toast.success("Retrying...");
      utils.ideas.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const saveToScriptsMutation = trpc.ideas.saveToScripts.useMutation({
    onSuccess: (data) => {
      if (data.alreadySaved) {
        toast.info("This script is already in My Scripts.");
      } else {
        toast.success("Saved to My Scripts!");
      }
      utils.ideas.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!formatOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-format-dropdown]")) setFormatOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [formatOpen]);

  const handleSubmit = () => {
    if (!ideaText.trim()) return;
    if (!filmingFormat && !customFormat.trim()) {
      setFormatError(true);
      setFormatOpen(true);
      setTimeout(() => setFormatError(false), 1000);
      return;
    }
    const resolvedFormat =
      filmingFormat === "custom"
        ? customFormat.trim()
        : FILMING_FORMATS.find((f) => f.id === filmingFormat)?.label ?? "";
    submitMutation.mutate({
      idea: ideaText.trim(),
      niche: undefined,
      tone: "engaging" as any,
      creatorGoal: "balanced" as any,
      gradeLevel: "auto" as any,
      inputMethod: "text",
      filmingFormat: resolvedFormat || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const ideas = ideasQuery.data || [];
  const stats = {
    total: ideas.length,
    validating: ideas.filter((i) => i.status === "validating").length,
    processing: ideas.filter((i) => i.status === "queued" || i.status === "processing").length,
    completed: ideas.filter((i) => i.status === "completed").length,
    failed: ideas.filter((i) => i.status === "failed").length,
  };

  // Sort: awaiting_approval first, then validating, processing, queued, completed, failed
  const sortedIdeas = [...ideas].sort((a, b) => {
    const order: Record<string, number> = {
      awaiting_approval: 0, validating: 1, processing: 2, queued: 3, completed: 4, failed: 5,
    };
    return (order[a.status] ?? 6) - (order[b.status] ?? 6);
  });

  return (
    <div className="container max-w-4xl py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20">
            <Lightbulb className="h-6 w-6 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold">Idea to Script</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Turn any idea into a script that&apos;s built to go viral.
        </p>
      </div>

      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
        <CardContent className="p-6 space-y-0">

          <Textarea
            ref={textareaRef}
            value={ideaText}
            onChange={(e) => setIdeaText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's your reel idea?"
            className="min-h-[100px] text-base resize-none bg-background/50 border-border/50 focus:border-violet-500/50"
            autoFocus
          />

          <div className="border-t border-border/40 my-4" />

          <div className="flex items-center justify-between gap-3 flex-wrap">

            <div className={`flex items-center gap-2 ${formatError ? "animate-shake" : ""}`}>
              <span className="text-xs text-muted-foreground whitespace-nowrap">How will you film this?</span>
              <div className="relative" data-format-dropdown>
                <button
                  type="button"
                  onClick={() => setFormatOpen((v) => !v)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                    filmingFormat || customFormat.trim()
                      ? "border-violet-500 bg-violet-500/10 text-foreground"
                      : formatError
                      ? "border-amber-400/60 text-amber-400"
                      : "border-border bg-card text-muted-foreground hover:border-violet-500/50 hover:text-foreground"
                  }`}
                >
                  <span>
                    {filmingFormat === "custom" && customFormat.trim()
                      ? `🎬 ${customFormat.trim()}`
                      : filmingFormat
                      ? `${FILMING_FORMATS.find((f) => f.id === filmingFormat)?.icon} ${FILMING_FORMATS.find((f) => f.id === filmingFormat)?.label}`
                      : formatError
                      ? "Select a format first"
                      : "Pick a format"}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${formatOpen ? "rotate-180" : ""}`} />
                </button>

                {formatOpen && (
                  <div className="absolute top-[calc(100%+6px)] left-0 z-50 min-w-[240px] rounded-xl border border-border bg-card shadow-xl p-1.5">
                    {FILMING_FORMATS.map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => {
                          setFilmingFormat(fmt.id);
                          setCustomFormat("");
                          setFormatOpen(false);
                          setFormatError(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                          filmingFormat === fmt.id
                            ? "bg-violet-500/15 text-violet-300"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <span className="text-base flex-shrink-0">{fmt.icon}</span>
                        <div>
                          <div className="font-medium text-sm">{fmt.label}</div>
                          <div className="text-xs text-muted-foreground">{fmt.sub}</div>
                        </div>
                      </button>
                    ))}
                    <div className="border-t border-border/40 my-1" />
                    <div className="px-2 pb-1">
                      <input
                        type="text"
                        value={customFormat}
                        placeholder="🎬  My own format..."
                        className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500/50 focus:outline-none"
                        onChange={(e) => {
                          setCustomFormat(e.target.value);
                          if (e.target.value.trim()) {
                            setFilmingFormat("custom");
                            setFormatError(false);
                          } else if (filmingFormat === "custom") {
                            setFilmingFormat("");
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!ideaText.trim() || submitMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Generate Script
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">Ctrl</kbd>
            {" + "}
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">Enter</kbd>
            {" to generate"}
          </p>

        </CardContent>
      </Card>

      {/* Stats Bar */}
      {ideas.length > 0 && (
        <div className="flex items-center gap-6 text-sm flex-wrap">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{stats.total}</span> ideas
          </span>
          {stats.validating > 0 && (
            <span className="flex items-center gap-1.5 text-purple-400">
              <Sparkles className="h-3.5 w-3.5" /> {stats.validating} reviewing
            </span>
          )}
          {stats.processing > 0 && (
            <span className="flex items-center gap-1.5 text-blue-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {stats.processing} generating
            </span>
          )}
          {stats.completed > 0 && (
            <span className="flex items-center gap-1.5 text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> {stats.completed} ready
            </span>
          )}
          {stats.failed > 0 && (
            <span className="flex items-center gap-1.5 text-red-400">
              <XCircle className="h-3.5 w-3.5" /> {stats.failed} failed
            </span>
          )}
        </div>
      )}

      {/* Ideas Queue */}
      <div className="space-y-3">
        {ideasQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading your ideas...
          </div>
        ) : ideas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-full bg-violet-500/10 mb-4">
                <Zap className="h-8 w-8 text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Your Script Factory is Empty</h3>
              <p className="text-muted-foreground max-w-md">
                Drop your first idea above. We score the concept, help you tighten it, draft for your chosen creator goal,
                and auto-rewrite weak scripts before they land here.
              </p>
            </CardContent>
          </Card>
        ) : (
          sortedIdeas.map((idea) => {
            const statusConfig = STATUS_CONFIG[idea.status as IdeaStatus] || STATUS_CONFIG.queued;
            const StatusIcon = statusConfig.icon;
            const isExpanded = expandedIdea === idea.id;
            const isEditing = editingIdeaId === idea.id;
            const isAwaitingApproval = idea.status === "awaiting_approval";

            return (
              <Card
                key={idea.id}
                className={`transition-all hover:border-border/60 ${
                  isAwaitingApproval ? "border-amber-400/30 bg-amber-400/[0.02]" :
                  idea.status === "completed" ? "border-green-500/20" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded-md mt-0.5 ${statusConfig.bg}`}>
                      <StatusIcon
                        className={`h-4 w-4 ${statusConfig.color} ${
                          idea.status === "processing" || idea.status === "validating" ? "animate-spin" : ""
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {idea.generatedTitle && idea.status === "completed" ? (
                            <h3 className="font-semibold text-sm truncate">{idea.generatedTitle}</h3>
                          ) : null}
                          <p className={`text-sm ${idea.generatedTitle ? "text-muted-foreground" : "text-foreground"} ${!isExpanded && !isAwaitingApproval ? "line-clamp-2" : ""}`}>
                            {idea.idea}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {(idea as any).viralScore != null && idea.status !== "completed" && (
                            <IdeaScoreBadge score={Number((idea as any).viralScore)} />
                          )}
                          {idea.status === "completed" && (
                            <>
                              {(idea as any).viralScore != null && (
                                <IdeaScoreBadge score={Number((idea as any).viralScore)} />
                              )}
                              {(() => {
                                const jq = viralStructureJudge(idea as any);
                                return jq.finalScore != null ? (
                                  <ScriptJudgeBadge
                                    score={jq.finalScore}
                                    decision={jq.decision}
                                    attempts={jq.attempts}
                                  />
                                ) : null;
                              })()}
                            </>
                          )}
                          <Badge variant="outline" className={`text-[10px] ${statusConfig.color} border-current/20`}>
                            {statusConfig.label}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{new Date(idea.createdAt).toLocaleDateString()}</span>
                        {(idea as any).inputMethod && (idea as any).inputMethod !== "text" && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <Mic className="h-2.5 w-2.5" /> Voice
                          </Badge>
                        )}
                        {(() => {
                          const g = creatorGoalSlugFromListedIdea(idea);
                          const gl = g ? CREATOR_GOALS.find((x) => x.value === g) : null;
                          return gl && g !== "balanced" ? (
                            <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-200">
                              Goal: {gl.label}
                            </Badge>
                          ) : null;
                        })()}
                        {idea.niche && <Badge variant="secondary" className="text-[10px]">{idea.niche}</Badge>}
                        {idea.tone && idea.tone !== "engaging" && (
                          <Badge variant="secondary" className="text-[10px]">
                            {TONE_OPTIONS.find((t) => t.value === idea.tone)?.emoji} {idea.tone}
                          </Badge>
                        )}
                      </div>

                      {/* AI Validation / Approval Section */}
                      {isAwaitingApproval && (() => {
                        const pendingQuestion = getPendingQuestion(idea as any);

                        if (pendingQuestion) {
                          return (
                            <div className="mt-3 space-y-3">
                              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-400/20">
                                <p className="text-xs font-medium text-amber-300 mb-1 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Quick question before we write your script
                                </p>
                                <p className="text-sm text-foreground font-medium">{pendingQuestion}</p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="flex-1 h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                                  disabled={approveMutation.isPending}
                                  onClick={() => {
                                    const answer = "My customers / audience / viewers";
                                    approveMutation.mutate({
                                      ideaId: idea.id,
                                      action: "edit",
                                      editedIdea: `${idea.idea}\n\nTarget audience: ${answer}`,
                                    });
                                  }}
                                >
                                  {approveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                  My customers / viewers
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 h-8 text-xs border-white/10 hover:bg-white/5"
                                  disabled={approveMutation.isPending}
                                  onClick={() => {
                                    const answer = "Other professionals / business owners in my industry";
                                    approveMutation.mutate({
                                      ideaId: idea.id,
                                      action: "edit",
                                      editedIdea: `${idea.idea}\n\nTarget audience: ${answer}`,
                                    });
                                  }}
                                >
                                  Other business owners
                                </Button>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-red-400 hover:text-red-300 gap-1.5 w-full"
                                onClick={() => approveMutation.mutate({ ideaId: idea.id, action: "reject" })}
                                disabled={approveMutation.isPending}
                              >
                                <ThumbsDown className="h-3.5 w-3.5" /> Cancel
                              </Button>
                            </div>
                          );
                        }

                        return (
                          <div className="mt-3 space-y-3">
                            {(idea as any).aiReasoning && (
                              <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                                <p className="text-xs font-medium text-purple-300 mb-1 flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5" /> AI Assessment
                                </p>
                                <p className="text-sm text-muted-foreground">{(idea as any).aiReasoning}</p>
                              </div>
                            )}
                            {(idea as any).aiSuggestion && (
                              <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                                <p className="text-xs font-medium text-green-300 mb-1">Suggested Improvement:</p>
                                <p className="text-sm text-foreground font-medium">{(idea as any).aiSuggestion}</p>
                              </div>
                            )}
                            {isEditing ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editedIdeaText}
                                  onChange={(e) => setEditedIdeaText(e.target.value)}
                                  className="min-h-[80px] text-sm bg-background/50"
                                  placeholder="Edit your idea..."
                                  autoFocus
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white gap-1"
                                    onClick={() => approveMutation.mutate({
                                      ideaId: idea.id,
                                      action: "edit",
                                      editedIdea: editedIdeaText.trim(),
                                    })}
                                    disabled={!editedIdeaText.trim() || approveMutation.isPending}
                                  >
                                    {approveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                    Re-validate Idea
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => { setEditingIdeaId(null); setEditedIdeaText(""); }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1.5"
                                  onClick={() => approveMutation.mutate({ ideaId: idea.id, action: "accept" })}
                                  disabled={approveMutation.isPending}
                                >
                                  {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                                  Accept & Generate
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs gap-1.5 border-violet-500/30 hover:bg-violet-500/10"
                                  onClick={() => {
                                    setEditingIdeaId(idea.id);
                                    setEditedIdeaText((idea as any).aiSuggestion || idea.idea);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Edit Idea
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-xs text-red-400 hover:text-red-300 gap-1.5"
                                  onClick={() => approveMutation.mutate({ ideaId: idea.id, action: "reject" })}
                                  disabled={approveMutation.isPending}
                                >
                                  <ThumbsDown className="h-3.5 w-3.5" /> Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {idea.status === "failed" && idea.errorMessage && (
                        <p className="text-xs text-red-400 mt-2 bg-red-400/5 rounded px-2 py-1">
                          {idea.errorMessage}
                        </p>
                      )}

                      {isExpanded && idea.status === "completed" && idea.generatedScript && (
                        <div className="mt-3 rounded-lg bg-muted/30 border border-border/30">
                          <p className="text-xs font-medium text-muted-foreground px-3 pt-3 mb-2">Your Script:</p>
                          <div className="px-3 pb-3 max-h-[500px] overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                              {idea.generatedScript}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        {idea.status === "completed" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setExpandedIdea(isExpanded ? null : idea.id)}
                            >
                              {isExpanded ? "Hide Script" : "Read Script"}
                            </Button>
                            {idea.savedScriptId ? (
                              <Link href={`/scripts/${idea.savedScriptId}`}>
                                <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white gap-1">
                                  <FileText className="h-3 w-3" /> Edit Script
                                </Button>
                              </Link>
                            ) : (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white gap-1"
                                onClick={() => saveToScriptsMutation.mutate({ ideaId: idea.id })}
                                disabled={saveToScriptsMutation.isPending}
                              >
                                {saveToScriptsMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Plus className="h-3 w-3" />
                                )}
                                Use This Script
                              </Button>
                            )}
                          </>
                        )}
                        {idea.status === "failed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-blue-400 hover:text-blue-300 gap-1"
                            onClick={() => retryMutation.mutate({ id: idea.id })}
                            disabled={retryMutation.isPending}
                          >
                            <RotateCcw className="h-3 w-3" /> Retry
                          </Button>
                        )}
                        {!isAwaitingApproval && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-red-400 gap-1 ml-auto"
                            onClick={() => {
                              if (confirm("Delete this idea?")) {
                                deleteMutation.mutate({ id: idea.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
