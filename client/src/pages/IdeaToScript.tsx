import { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePostHog } from "@posthog/react";
import {
  Lightbulb, Send, Loader2, CheckCircle2, XCircle, Clock,
  Trash2, RotateCcw, FileText, Plus, ChevronDown, Zap,
  Mic, MicOff, Square, Sparkles, ThumbsUp, ThumbsDown, Pencil,
  AlertTriangle, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "wouter";

const TONE_OPTIONS = [
  { value: "engaging", label: "Engaging", emoji: "🎯" },
  { value: "casual", label: "Casual", emoji: "😎" },
  { value: "professional", label: "Professional", emoji: "💼" },
  { value: "humorous", label: "Humorous", emoji: "😂" },
  { value: "educational", label: "Educational", emoji: "📚" },
];

const GRADE_OPTIONS = [
  { value: "auto", label: "Auto (Best fit)" },
  { value: "2", label: "Grade 2 (Simple)" },
  { value: "3", label: "Grade 3" },
  { value: "4", label: "Grade 4" },
  { value: "5", label: "Grade 5" },
  { value: "6", label: "Grade 6 (Complex)" },
];

type IdeaStatus = "queued" | "validating" | "awaiting_approval" | "processing" | "completed" | "failed";

const STATUS_CONFIG: Record<IdeaStatus, { icon: typeof Clock; color: string; label: string; bg: string }> = {
  queued: { icon: Clock, color: "text-yellow-400", label: "In Queue", bg: "bg-yellow-400/10" },
  validating: { icon: Sparkles, color: "text-purple-400", label: "AI Reviewing...", bg: "bg-purple-400/10" },
  awaiting_approval: { icon: AlertTriangle, color: "text-amber-400", label: "Needs Your Approval", bg: "bg-amber-400/10" },
  processing: { icon: Loader2, color: "text-blue-400", label: "Generating Script...", bg: "bg-blue-400/10" },
  completed: { icon: CheckCircle2, color: "text-green-400", label: "Ready", bg: "bg-green-400/10" },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed", bg: "bg-red-400/10" },
};

function ViralScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "text-green-400 border-green-400/30 bg-green-400/10"
    : score >= 5 ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
    : "text-red-400 border-red-400/30 bg-red-400/10";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      <Star className="h-3 w-3 fill-current" /> {score}/10
    </span>
  );
}

export default function IdeaToScript() {
  const posthog = usePostHog();
  const { user } = useAuth();

  const [ideaText, setIdeaText] = useState("");
  const [niche, setNiche] = useState("");
  const [tone, setTone] = useState("engaging");
  const [gradeLevel, setGradeLevel] = useState("auto");
  const [showSettings, setShowSettings] = useState(false);
  const [expandedIdea, setExpandedIdea] = useState<number | null>(null);
  const [editingIdeaId, setEditingIdeaId] = useState<number | null>(null);
  const [editedIdeaText, setEditedIdeaText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  const transcribeMutation = trpc.ideas.transcribeVoice.useMutation({
    onSuccess: (data) => {
      setIdeaText(data.text);
      toast.success("Voice transcribed! Review and submit your idea.");
      setIsTranscribing(false);
    },
    onError: (err) => {
      toast.error("Transcription failed: " + err.message);
      setIsTranscribing(false);
    },
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

  // Voice recording handlers
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        if (blob.size < 1000) {
          toast.error("Recording too short. Please try again.");
          return;
        }

        // Convert to base64 and transcribe
        setIsTranscribing(true);
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          transcribeMutation.mutate({ audioBase64: base64, mimeType: "audio/webm" });
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast.error("Microphone access denied. Please allow microphone access and try again.");
    }
  }, [transcribeMutation]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleSubmit = () => {
    if (!ideaText.trim()) return;
    submitMutation.mutate({
      idea: ideaText.trim(),
      niche: niche.trim() || undefined,
      tone: tone as any,
      gradeLevel: gradeLevel as any,
      inputMethod: "text",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const ideas = ideasQuery.data || [];
  const awaitingCount = ideas.filter((i) => i.status === "awaiting_approval").length;
  const stats = {
    total: ideas.length,
    awaiting: awaitingCount,
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
        <p className="text-muted-foreground">
          Type or speak your ideas. AI validates them first, then generates scripts once you approve.
        </p>
      </div>

      {/* Awaiting Approval Alert */}
      {awaitingCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-400/10 border border-amber-400/20">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-200">
            <span className="font-semibold">{awaitingCount} idea{awaitingCount > 1 ? "s" : ""}</span> need{awaitingCount === 1 ? "s" : ""} your approval before script generation.
          </p>
        </div>
      )}

      {/* Quick Submit Form */}
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
        <CardContent className="p-6 space-y-4">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "Recording... speak your idea" : isTranscribing ? "Transcribing your voice..." : "What's your reel idea? Type it or click the mic to speak..."}
              className="min-h-[100px] pr-4 text-base resize-none bg-background/50 border-border/50 focus:border-violet-500/50"
              autoFocus
              disabled={isRecording || isTranscribing}
            />
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              {/* Voice Record Button */}
              {isRecording ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={stopRecording}
                  className="gap-2 animate-pulse"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop {formatTime(recordingTime)}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startRecording}
                  disabled={isTranscribing || submitMutation.isPending}
                  className="gap-2 border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-300"
                >
                  {isTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                  {isTranscribing ? "Transcribing..." : "Voice"}
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${showSettings ? "rotate-180" : ""}`} />
                Settings
              </Button>
              {niche && (
                <Badge variant="secondary" className="text-xs">{niche}</Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {TONE_OPTIONS.find((t) => t.value === tone)?.emoji} {TONE_OPTIONS.find((t) => t.value === tone)?.label}
              </Badge>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!ideaText.trim() || submitMutation.isPending || isRecording || isTranscribing}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Idea
            </Button>
          </div>

          {/* Collapsible Settings */}
          {showSettings && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border/30">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Niche (optional)</label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g., Fitness, Tech, Finance"
                  className="w-full px-3 py-2 text-sm rounded-md border border-border/50 bg-background/50 focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Tone</label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Reading Level</label>
                <Select value={gradeLevel} onValueChange={setGradeLevel}>
                  <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GRADE_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">Enter</kbd> to submit &middot; Click <Mic className="inline h-3 w-3" /> to speak your idea
          </p>
        </CardContent>
      </Card>

      {/* Stats Bar */}
      {ideas.length > 0 && (
        <div className="flex items-center gap-6 text-sm flex-wrap">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{stats.total}</span> ideas
          </span>
          {stats.awaiting > 0 && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {stats.awaiting} awaiting
            </span>
          )}
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
                Drop your first idea above — type it or speak it. AI will review it, then generate a ready-to-film script once you approve.
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
                        <div className="flex items-center gap-2 shrink-0">
                          {(idea as any).viralScore && (
                            <ViralScoreBadge score={(idea as any).viralScore} />
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
                        {idea.niche && <Badge variant="secondary" className="text-[10px]">{idea.niche}</Badge>}
                        {idea.tone && idea.tone !== "engaging" && (
                          <Badge variant="secondary" className="text-[10px]">
                            {TONE_OPTIONS.find((t) => t.value === idea.tone)?.emoji} {idea.tone}
                          </Badge>
                        )}
                      </div>

                      {/* AI Validation / Approval Section */}
                      {isAwaitingApproval && (
                        <div className="mt-3 space-y-3">
                          {/* AI Reasoning */}
                          {(idea as any).aiReasoning && (
                            <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                              <p className="text-xs font-medium text-purple-300 mb-1 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" /> AI Assessment
                              </p>
                              <p className="text-sm text-muted-foreground">{(idea as any).aiReasoning}</p>
                            </div>
                          )}

                          {/* AI Suggestion */}
                          {(idea as any).aiSuggestion && (
                            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                              <p className="text-xs font-medium text-green-300 mb-1">Suggested Improvement:</p>
                              <p className="text-sm text-foreground font-medium">{(idea as any).aiSuggestion}</p>
                            </div>
                          )}

                          {/* Edit mode */}
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
                            /* Accept / Edit / Reject buttons */
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
                      )}

                      {idea.status === "failed" && idea.errorMessage && (
                        <p className="text-xs text-red-400 mt-2 bg-red-400/5 rounded px-2 py-1">
                          {idea.errorMessage}
                        </p>
                      )}

                      {isExpanded && idea.status === "completed" && idea.generatedScript && (
                        <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Generated Script Preview:</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">
                            {idea.generatedScript.substring(0, 500)}
                            {idea.generatedScript.length > 500 && "..."}
                          </p>
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
                              {isExpanded ? "Collapse" : "Preview Script"}
                            </Button>
                            {idea.savedScriptId ? (
                              <Link href={`/scripts/${idea.savedScriptId}`}>
                                <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white gap-1">
                                  <FileText className="h-3 w-3" /> Open in Editor
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
                                Save to My Scripts
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
