import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Wand2,
  Clock,
  BookOpen,
  AlertTriangle,
  Copy,
  RefreshCw,
  Zap,
  Gauge,
  Turtle,
  MonitorPlay,
} from "lucide-react";
import { toast } from "sonner";
import { TeleprompterMode } from "./TeleprompterMode";

// ── Types ──

interface ViralStructure {
  hook: { type: string; text: string; technique: string };
  body: { pacing: string; structure: string; keyPoints: string[] };
  transition: { type: string; text: string };
  cta: { type: string; text: string };
  overallTone: string;
  estimatedPace: string;
}

interface ReadabilityIssue {
  type: "passive_voice" | "complex_sentence" | "adverb" | "hard_to_read" | "very_hard_to_read";
  text: string;
  suggestion: string;
}

interface ReadabilityAnalysis {
  gradeLevel: number;
  readingEase: number;
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  issues: ReadabilityIssue[];
  passiveVoiceCount: number;
  adverbCount: number;
  hardSentenceCount: number;
  veryHardSentenceCount: number;
  overallAssessment: string;
}

type GradeLevel = "auto" | "2" | "3" | "4" | "5" | "6";

// ── Helpers ──

function getIssueColor(type: string): string {
  switch (type) {
    case "passive_voice": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "complex_sentence": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "adverb": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    case "hard_to_read": return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    case "very_hard_to_read": return "bg-red-500/20 text-red-300 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

function getIssueLabel(type: string): string {
  switch (type) {
    case "passive_voice": return "Passive Voice";
    case "complex_sentence": return "Complex Sentence";
    case "adverb": return "Adverb";
    case "hard_to_read": return "Hard to Read";
    case "very_hard_to_read": return "Very Hard to Read";
    default: return type;
  }
}

function getReadingEaseLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Very Easy", color: "text-emerald-400" };
  if (score >= 60) return { label: "Easy", color: "text-green-400" };
  if (score >= 40) return { label: "Moderate", color: "text-yellow-400" };
  if (score >= 20) return { label: "Difficult", color: "text-orange-400" };
  return { label: "Very Difficult", color: "text-red-400" };
}

function calculateTimingMetrics(wordCount: number) {
  return {
    slow: { wps: 2.5, duration: wordCount / 2.5, label: "Slow Delivery" },
    average: { wps: 3.0, duration: wordCount / 3.0, label: "Average Delivery" },
    fast: { wps: 3.5, duration: wordCount / 3.5, label: "Fast / High-Energy" },
  };
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

// ── Main Component ──

export function ReCreateScriptDialog({
  reelId,
  originalTranscript,
  onClose,
}: {
  reelId: number | null;
  originalTranscript: string;
  onClose: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [gradeLevel, setGradeLevel] = useState<GradeLevel>("auto");
  const [activeScriptId, setActiveScriptId] = useState<number | null>(null);
  const [showTeleprompter, setShowTeleprompter] = useState(false);

  const generateMutation = trpc.recreate.generate.useMutation({
    onSuccess: (data) => {
      setActiveScriptId(data.scriptId);
      toast.success("Script generation started!");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const scriptQuery = trpc.recreate.status.useQuery(
    { scriptId: activeScriptId! },
    {
      enabled: !!activeScriptId,
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.status === "processing" ? 2000 : false;
      },
    }
  );

  const previousScriptsQuery = trpc.recreate.list.useQuery(
    { reelId: reelId! },
    { enabled: !!reelId }
  );

  const script = scriptQuery.data;
  const viralStructure = script?.viralStructure as ViralStructure | null;
  const readability = script?.readabilityAnalysis as ReadabilityAnalysis | null;
  const generatedScript = script?.generatedScript || "";

  const wordCount = useMemo(() => {
    return generatedScript.split(/\s+/).filter(Boolean).length;
  }, [generatedScript]);

  const timing = useMemo(() => calculateTimingMetrics(wordCount), [wordCount]);

  const handleGenerate = useCallback(() => {
    if (!reelId || !topic.trim()) {
      toast.error("Please enter a topic or angle for your new script.");
      return;
    }
    generateMutation.mutate({ reelId, topic: topic.trim(), gradeLevel });
  }, [reelId, topic, gradeLevel, generateMutation]);

  const handleCopyScript = useCallback(() => {
    if (!generatedScript) return;
    navigator.clipboard.writeText(generatedScript).then(() => {
      toast.success("Script copied to clipboard");
    });
  }, [generatedScript]);

  const handleLoadPrevious = useCallback((prevScript: typeof script) => {
    if (!prevScript) return;
    setActiveScriptId(prevScript.id);
    setTopic(typeof prevScript.topic === "string" ? prevScript.topic : "");
    setGradeLevel((prevScript.gradeLevel as GradeLevel) || "auto");
  }, []);

  const isGenerating = generateMutation.isPending || script?.status === "processing";

  // Highlight script text with Hemingway issues
  const highlightedScript = useMemo(() => {
    if (!generatedScript || !readability?.issues?.length) return null;

    let result = generatedScript;
    const sortedIssues = [...readability.issues].sort(
      (a, b) => b.text.length - a.text.length
    );

    const markers: Array<{ start: number; end: number; type: string; suggestion: string }> = [];

    for (const issue of sortedIssues) {
      const idx = result.toLowerCase().indexOf(issue.text.toLowerCase());
      if (idx === -1) continue;
      const overlaps = markers.some(
        (m) => idx < m.end && idx + issue.text.length > m.start
      );
      if (overlaps) continue;
      markers.push({
        start: idx,
        end: idx + issue.text.length,
        type: issue.type,
        suggestion: issue.suggestion,
      });
    }

    markers.sort((a, b) => a.start - b.start);

    if (markers.length === 0) return null;

    const parts: Array<{ text: string; type?: string; suggestion?: string }> = [];
    let lastEnd = 0;

    for (const marker of markers) {
      if (marker.start > lastEnd) {
        parts.push({ text: result.slice(lastEnd, marker.start) });
      }
      parts.push({
        text: result.slice(marker.start, marker.end),
        type: marker.type,
        suggestion: marker.suggestion,
      });
      lastEnd = marker.end;
    }

    if (lastEnd < result.length) {
      parts.push({ text: result.slice(lastEnd) });
    }

    return parts;
  }, [generatedScript, readability]);

  return (
    <Dialog open={!!reelId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-card text-card-foreground">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Re-Create Script
          </DialogTitle>
        </DialogHeader>

        {/* Input Section */}
        {!activeScriptId && (
          <div className="space-y-4 shrink-0">
            <div>
              <Label htmlFor="topic" className="text-sm font-medium text-foreground">
                Your Topic / Angle
              </Label>
              <Textarea
                id="topic"
                placeholder="Enter your new topic or angle... e.g., 'How AI is changing the fitness industry' or 'Why most small businesses fail in the first year'"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="mt-1.5 min-h-[80px] bg-background text-foreground"
              />
            </div>

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label className="text-sm font-medium text-foreground">
                  Grade Level Readability
                </Label>
                <Select value={gradeLevel} onValueChange={(v) => setGradeLevel(v as GradeLevel)}>
                  <SelectTrigger className="mt-1.5 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Best fit)</SelectItem>
                    <SelectItem value="2">Grade 2 (Very Simple)</SelectItem>
                    <SelectItem value="3">Grade 3 (Simple)</SelectItem>
                    <SelectItem value="4">Grade 4 (Easy)</SelectItem>
                    <SelectItem value="5">Grade 5 (Moderate)</SelectItem>
                    <SelectItem value="6">Grade 6 (Standard)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!topic.trim() || isGenerating}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate Script
                  </>
                )}
              </Button>
            </div>

            {/* Previous scripts */}
            {previousScriptsQuery.data && previousScriptsQuery.data.length > 0 && (
              <div className="pt-2">
                <Separator className="mb-3" />
                <p className="text-xs text-muted-foreground mb-2">Previous scripts for this reel:</p>
                <div className="flex flex-wrap gap-2">
                  {previousScriptsQuery.data.map((prev) => (
                    <Button
                      key={prev.id}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => handleLoadPrevious(prev)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      {typeof prev.topic === "string" ? prev.topic.slice(0, 40) : "Script"}...
                      {prev.status === "completed" && (
                        <Badge variant="outline" className="ml-1 text-[10px] h-4 border-emerald-500/50 text-emerald-400">
                          Done
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing state */}
        {activeScriptId && script?.status === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Analyzing viral structure and generating your script...
            </p>
            <p className="text-xs text-muted-foreground">
              This may take 15-30 seconds.
            </p>
          </div>
        )}

        {/* Failed state */}
        {activeScriptId && script?.status === "failed" && (
          <div className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-destructive text-sm mb-4">
              Script generation failed: {script.errorMessage}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setActiveScriptId(null);
              }}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Completed: Split View */}
        {activeScriptId && script?.status === "completed" && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
            {/* Top bar: back + copy + timing */}
            <div className="flex items-center justify-between shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setActiveScriptId(null)}
              >
                ← New Script
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={handleCopyScript}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy Script
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => setShowTeleprompter(true)}
                >
                  <MonitorPlay className="mr-1 h-3 w-3" />
                  Teleprompter
                </Button>
              </div>
            </div>

            {/* Split View */}
            <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 overflow-hidden">
              {/* Left: Original Transcript */}
              <div className="flex flex-col min-h-0 overflow-hidden rounded-lg border border-border">
                <div className="px-4 py-2.5 bg-muted/50 border-b border-border shrink-0">
                  <h3 className="text-sm font-semibold text-foreground">Original Viral Transcript</h3>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {originalTranscript}
                  </p>

                  {/* Viral Structure Breakdown */}
                  {viralStructure && (
                    <div className="mt-6 space-y-3">
                      <Separator />
                      <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">
                        Viral Structure Analysis
                      </h4>

                      <div className="space-y-2.5">
                        <StructureBlock
                          label="Hook"
                          type={viralStructure.hook.type}
                          text={viralStructure.hook.text}
                          detail={viralStructure.hook.technique}
                          color="text-red-400"
                        />
                        <StructureBlock
                          label="Body"
                          type={viralStructure.body.pacing}
                          text={viralStructure.body.structure}
                          detail={viralStructure.body.keyPoints.join(" → ")}
                          color="text-blue-400"
                        />
                        <StructureBlock
                          label="Transition"
                          type={viralStructure.transition.type}
                          text={viralStructure.transition.text}
                          color="text-yellow-400"
                        />
                        <StructureBlock
                          label="CTA"
                          type={viralStructure.cta.type}
                          text={viralStructure.cta.text}
                          color="text-emerald-400"
                        />
                      </div>

                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px]">
                          Tone: {viralStructure.overallTone}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          Pace: {viralStructure.estimatedPace}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Generated Script */}
              <div className="flex flex-col min-h-0 overflow-hidden rounded-lg border border-border">
                <div className="px-4 py-2.5 bg-muted/50 border-b border-border shrink-0">
                  <h3 className="text-sm font-semibold text-foreground">Generated Script</h3>
                  {readability && (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] h-5">
                        <BookOpen className="mr-1 h-2.5 w-2.5" />
                        Grade {readability.gradeLevel.toFixed(1)}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] h-5 ${getReadingEaseLabel(readability.readingEase).color}`}>
                        {getReadingEaseLabel(readability.readingEase).label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {readability.wordCount} words
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  <Tabs defaultValue="script" className="h-full flex flex-col">
                    <TabsList className="w-full shrink-0 rounded-none border-b">
                      <TabsTrigger value="script" className="flex-1 text-xs">Script</TabsTrigger>
                      <TabsTrigger value="hemingway" className="flex-1 text-xs">Hemingway</TabsTrigger>
                      <TabsTrigger value="timer" className="flex-1 text-xs">Timer</TabsTrigger>
                    </TabsList>

                    {/* Script Tab */}
                    <TabsContent value="script" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0">
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {generatedScript}
                      </p>
                    </TabsContent>

                    {/* Hemingway Tab */}
                    <TabsContent value="hemingway" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0">
                      {/* Legend */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Passive Voice ({readability?.passiveVoiceCount || 0})
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Adverb ({readability?.adverbCount || 0})
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                          Complex ({readability?.hardSentenceCount || 0})
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                          Very Hard ({readability?.veryHardSentenceCount || 0})
                        </span>
                      </div>

                      {/* Highlighted text */}
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {highlightedScript ? (
                          highlightedScript.map((part, i) =>
                            part.type ? (
                              <span
                                key={i}
                                className={`inline rounded px-0.5 border ${getIssueColor(part.type)} cursor-help`}
                                title={`${getIssueLabel(part.type)}: ${part.suggestion}`}
                              >
                                {part.text}
                              </span>
                            ) : (
                              <span key={i} className="text-foreground">{part.text}</span>
                            )
                          )
                        ) : (
                          <p className="text-foreground">{generatedScript}</p>
                        )}
                      </div>

                      {/* Issues list */}
                      {readability?.issues && readability.issues.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <Separator />
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2">
                            Suggestions
                          </h4>
                          {readability.issues.map((issue, i) => (
                            <div
                              key={i}
                              className={`text-xs p-2 rounded border ${getIssueColor(issue.type)}`}
                            >
                              <span className="font-medium">{getIssueLabel(issue.type)}:</span>{" "}
                              <span className="opacity-80">"{issue.text}"</span>
                              <br />
                              <span className="text-[10px] opacity-70">→ {issue.suggestion}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {readability && (
                        <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">Overall Assessment</p>
                          <p>{readability.overallAssessment}</p>
                        </div>
                      )}
                    </TabsContent>

                    {/* Timer Tab */}
                    <TabsContent value="timer" className="flex-1 min-h-0 overflow-y-auto p-4 mt-0">
                      <div className="space-y-4">
                        <div className="text-center mb-6">
                          <Clock className="h-8 w-8 text-primary mx-auto mb-2" />
                          <p className="text-2xl font-bold text-foreground">{wordCount}</p>
                          <p className="text-xs text-muted-foreground">Total Words</p>
                        </div>

                        <div className="space-y-3">
                          <TimingRow
                            icon={<Turtle className="h-4 w-4 text-blue-400" />}
                            label={timing.slow.label}
                            wps={timing.slow.wps}
                            duration={timing.slow.duration}
                            color="text-blue-400"
                          />
                          <TimingRow
                            icon={<Gauge className="h-4 w-4 text-emerald-400" />}
                            label={timing.average.label}
                            wps={timing.average.wps}
                            duration={timing.average.duration}
                            color="text-emerald-400"
                          />
                          <TimingRow
                            icon={<Zap className="h-4 w-4 text-orange-400" />}
                            label={timing.fast.label}
                            wps={timing.fast.wps}
                            duration={timing.fast.duration}
                            color="text-orange-400"
                          />
                        </div>

                        <Separator />

                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>Timing is based on words-per-second delivery speed:</p>
                          <p>• <span className="text-blue-400">Slow:</span> ~2.5 words/sec (deliberate, dramatic)</p>
                          <p>• <span className="text-emerald-400">Average:</span> ~3.0 words/sec (conversational)</p>
                          <p>• <span className="text-orange-400">Fast:</span> ~3.5 words/sec (high-energy, rapid-fire)</p>
                        </div>

                        {readability && (
                          <>
                            <Separator />
                            <div className="grid grid-cols-2 gap-3">
                              <StatCard label="Sentences" value={readability.sentenceCount} />
                              <StatCard label="Avg Words/Sentence" value={readability.avgWordsPerSentence.toFixed(1)} />
                              <StatCard label="Reading Ease" value={readability.readingEase.toFixed(0)} />
                              <StatCard label="Grade Level" value={readability.gradeLevel.toFixed(1)} />
                            </div>
                          </>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Teleprompter Mode */}
      {showTeleprompter && generatedScript && (
        <TeleprompterMode
          script={generatedScript}
          onClose={() => setShowTeleprompter(false)}
        />
      )}
    </Dialog>
  );
}

// ── Sub-components ──

function StructureBlock({
  label,
  type,
  text,
  detail,
  color,
}: {
  label: string;
  type: string;
  text: string;
  detail?: string;
  color: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>
          {label}
        </span>
        <Badge variant="outline" className="text-[10px] h-4">
          {type}
        </Badge>
      </div>
      <p className="text-xs text-foreground leading-relaxed">"{text}"</p>
      {detail && (
        <p className="text-[10px] text-muted-foreground mt-1">{detail}</p>
      )}
    </div>
  );
}

function TimingRow({
  icon,
  label,
  wps,
  duration,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  wps: number;
  duration: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className={`text-sm font-medium ${color}`}>{label}</p>
          <p className="text-[10px] text-muted-foreground">{wps} words/sec</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-foreground">{formatDuration(duration)}</p>
        <p className="text-[10px] text-muted-foreground">{Math.round(duration)}s total</p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
