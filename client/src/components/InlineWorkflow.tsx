import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Clock,
  FileText,
  Loader2,
  Copy,
  Download,
  Wand2,
  MonitorPlay,
  Check,
  Save,
  Tag,
  Pencil,
  RefreshCw,
  Timer,
  Mic,
  Calendar as CalendarIcon,
} from "lucide-react";
import { toast } from "sonner";
import { TeleprompterMode } from "@/pages/TeleprompterMode";

// ── Shared Types ──

export type Segment = { start: number; end: number; text: string };

// ── Shared Constants ──

export const GRADE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "2", label: "Grade 2" },
  { value: "3", label: "Grade 3" },
  { value: "4", label: "Grade 4" },
  { value: "5", label: "Grade 5" },
  { value: "6", label: "Grade 6" },
  { value: "7", label: "Grade 7" },
  { value: "8", label: "Grade 8" },
];

export const DURATION_OPTIONS = [
  { value: "any", label: "Any Length" },
  { value: "15", label: "15 seconds" },
  { value: "30", label: "30 seconds" },
  { value: "45", label: "45 seconds" },
  { value: "60", label: "60 seconds" },
  { value: "90", label: "90 seconds" },
];

export const TIME_OPTIONS = (() => {
  const times: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ["00", "30"]) {
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      const val = `${h.toString().padStart(2, "0")}:${m}`;
      times.push({ value: val, label: `${hour12}:${m} ${ampm}` });
    }
  }
  return times;
})();

// ── Shared Helper Functions ──

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatPostedTime(d: Date | string, timezone: string): string {
  const date = new Date(d);
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function segmentsToSRT(segments: Segment[]): string {
  return segments
    .map((seg, i) => {
      const startH = Math.floor(seg.start / 3600);
      const startM = Math.floor((seg.start % 3600) / 60);
      const startS = Math.floor(seg.start % 60);
      const startMs = Math.round((seg.start % 1) * 1000);
      const endH = Math.floor(seg.end / 3600);
      const endM = Math.floor((seg.end % 3600) / 60);
      const endS = Math.floor(seg.end % 60);
      const endMs = Math.round((seg.end % 1) * 1000);
      const fmt = (h: number, m: number, s: number, ms: number) =>
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
      return `${i + 1}\n${fmt(startH, startM, startS, startMs)} --> ${fmt(endH, endM, endS, endMs)}\n${seg.text}`;
    })
    .join("\n\n");
}

// ── Sub-components ──

export function StructureBlock({
  label,
  type,
  text,
  color,
}: {
  label: string;
  type: string;
  text: string;
  color: string;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/30 p-2">
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
        <Badge variant="outline" className="text-[10px] h-4">{type}</Badge>
      </div>
      <p className="text-xs text-foreground leading-relaxed">"{text}"</p>
    </div>
  );
}

const CUE_COLORS: Record<string, string> = {
  "PAUSE": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "LEAN IN": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "SPEED UP": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "SLOW DOWN": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "WHISPER": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "EMPHASIZE": "bg-red-500/20 text-red-300 border-red-500/30",
  "LOOK AT CAMERA": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "GESTURE": "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "RAISE VOICE": "bg-red-500/20 text-red-300 border-red-500/30",
  "SMILE": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "SERIOUS FACE": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "COUNT ON FINGERS": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "SHAKE HEAD": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "NOD": "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

const DEFAULT_CUE_COLOR = "bg-primary/20 text-primary border-primary/30";

/** Renders script text with [CUES] visually highlighted as inline badges */
export function ScriptWithCues({ text }: { text: string }) {
  if (!text) return null;

  const cueRegex = /\[([A-Z][A-Z\s]*[A-Z])\]/g;
  const parts: { type: "text" | "cue"; content: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = cueRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "cue", content: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  if (parts.length === 1 && parts[0].type === "text") {
    return <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{text}</p>;
  }

  return (
    <div className="text-sm text-foreground leading-relaxed">
      {parts.map((part, i) =>
        part.type === "cue" ? (
          <span
            key={i}
            className={`inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
              CUE_COLORS[part.content] || DEFAULT_CUE_COLOR
            }`}
            title={`Delivery cue: ${part.content}`}
          >
            {part.content}
          </span>
        ) : (
          <span key={i} className="whitespace-pre-wrap">{part.content}</span>
        )
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// InlineWorkflow - tRPC-based (Dashboard & Saved Reels)
// ══════════════════════════════════════════════════════════════

/**
 * Discriminated on `reelSource`. In `"user_job"` mode the component talks
 * to the scraped-reel tRPC inputs (`reelId`); in `"featured"` mode it
 * talks to the catalog-backed inputs (`featuredReelId`). `displayReelId`
 * is used purely for UI bookkeeping (SRT filename, React keys) and maps
 * to whichever id is populated for the current source.
 */
export type InlineWorkflowProps = {
  handle: string;
  hasTranscription: boolean;
  isProcessing: boolean;
  onTranscribe: () => void;
  userTimezone: string;
  postedAt: Date | string;
  /**
   * Commit 9 — monotonically-increasing nonce from the Dashboard's
   * "Make My Version" click handler. When this changes, the Re-create
   * section scrolls into view and plays a 2-second pulse. Passing
   * `undefined` is a no-op. Using a nonce (vs a boolean) lets a user
   * re-click the button on an already-expanded row and still get the
   * visual cue — the signal fires every click, not just the first.
   */
  scrollPulseSignal?: number;
} & (
  | { reelSource?: "user_job"; reelId: number; featuredReelId?: never }
  | { reelSource: "featured"; reelId?: never; featuredReelId: number }
);

export function InlineWorkflow(props: InlineWorkflowProps) {
  const {
    handle,
    hasTranscription,
    isProcessing,
    onTranscribe,
    userTimezone,
    postedAt,
  } = props;
  const reelSource: "user_job" | "featured" =
    props.reelSource === "featured" ? "featured" : "user_job";
  const reelId = reelSource === "user_job" ? props.reelId : undefined;
  const featuredReelId =
    reelSource === "featured" ? props.featuredReelId : undefined;
  const displayReelId: number = (reelId ?? featuredReelId ?? 0) as number;
  // Input shapes the `transcribe` / `recreate` routers accept; both
  // branches get enforced by Zod `refine` + runtime checks server-side.
  const transcribeIdInput =
    reelSource === "featured"
      ? { featuredReelId: featuredReelId! }
      : { reelId: reelId! };
  const recreateIdInput = transcribeIdInput;
  const [activeScriptId, setActiveScriptId] = useState<number | null>(null);
  const [gradeLevel, setGradeLevel] = useState("auto");
  const [customTopic, setCustomTopic] = useState("");
  const [showCustomTopic, setShowCustomTopic] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [targetDuration, setTargetDuration] = useState("any");
  const [addCues, setAddCues] = useState(true);
  const [isRewriting, setIsRewriting] = useState(false);

  // Save/Approve state
  const [editMode, setEditMode] = useState(false);
  const [editedScript, setEditedScript] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [saveDate, setSaveDate] = useState<Date | undefined>(undefined);
  const [saveTime, setSaveTime] = useState("09:00");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [saveStatus, setSaveStatus] = useState<"draft" | "approved">("draft");
  const [, navigate] = useLocation();
  const trpcUtils = trpc.useUtils();

  // Commit 9 — ref for the Re-create section so the Dashboard's
  // "Make My Version" click can scroll here + pulse. We respect
  // prefers-reduced-motion both for scroll behavior and animation.
  const recreateSectionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (props.scrollPulseSignal == null) return;
    // 50ms gives the parent's `setExpandedReelId` a frame to mount
    // this component before we try to scroll to a ref that wouldn't
    // exist yet on the first click of a collapsed row.
    const timer = window.setTimeout(() => {
      const node = recreateSectionRef.current;
      if (!node) return;
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      node.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      // Clear any stale pulse class before re-adding, so back-to-back
      // clicks restart the animation instead of it finishing silently.
      node.classList.remove("pulse-highlight");
      // Force reflow so the re-added class restarts the animation.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void node.offsetWidth;
      node.classList.add("pulse-highlight");
      const removeTimer = window.setTimeout(() => {
        node.classList.remove("pulse-highlight");
      }, 2100);
      return () => window.clearTimeout(removeTimer);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [props.scrollPulseSignal]);

  const tagsQuery = trpc.tags.list.useQuery();

  const transcriptionQuery = trpc.transcribe.status.useQuery(
    transcribeIdInput,
    {
      // Featured catalog reels now ship `reel.transcription` from
      // `getDashboardData`, but we still need to poll `transcribe.status`
      // while a run is in flight before the list row refreshes, and when
      // the user requested a transcript before the parent has flipped
      // `hasTranscription` to true.
      enabled: hasTranscription || isProcessing,
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.status === "processing" ? 2000 : false;
      },
    }
  );

  const generateMutation = trpc.recreate.generate.useMutation({
    onSuccess: (data) => {
      setActiveScriptId(data.scriptId);
      // Let Dashboard's `recreate.checkBatch` pick up the new script so
      // the grid/list action button flips to "Open My Script ✓" without
      // the user having to refresh.
      trpcUtils.recreate.checkBatch.invalidate();
    },
    onError: (error) => {
      toast.error("Script generation failed", { description: error.message });
    },
  });

  const rewriteMutation = trpc.recreate.rewrite.useMutation({
    onSuccess: (data) => {
      setActiveScriptId(data.scriptId);
      setIsRewriting(false);
    },
    onError: (error) => {
      toast.error("Rewrite failed", { description: error.message });
      setIsRewriting(false);
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

  const previousScriptsQuery = trpc.recreate.list.useQuery(recreateIdInput);

  const saveMutation = trpc.scripts.save.useMutation({
    onSuccess: (data) => {
      toast.success(saveStatus === "approved" ? "Script approved and saved!" : "Script saved as draft");
      navigate(`/scripts/${data.id}`);
    },
    onError: () => toast.error("Failed to save script"),
  });

  const t = transcriptionQuery.data;
  const segments: Segment[] = (t?.segments as any) || [];
  const transcript = t?.transcript || "";
  const transcriptionStatus = t?.status;
  const isTranscribing =
    transcriptionStatus === "processing" ||
    transcriptionStatus === "pending" ||
    (hasTranscription && transcriptionQuery.isLoading);

  const script = scriptQuery.data;
  const generatedScript = script?.generatedScript || "";
  const viralStructure = script?.viralStructure
    ? typeof script.viralStructure === "string"
      ? JSON.parse(script.viralStructure)
      : script.viralStructure
    : null;
  const readability = script?.readabilityAnalysis
    ? typeof script.readabilityAnalysis === "string"
      ? JSON.parse(script.readabilityAnalysis)
      : script.readabilityAnalysis
    : null;

  const displayScript = editMode ? editedScript : generatedScript;
  const wordCount = displayScript.split(/\s+/).filter(Boolean).length;
  const timing = {
    slow: { duration: wordCount / 2.5 },
    average: { duration: wordCount / 3.0 },
    fast: { duration: wordCount / 3.5 },
  };

  useEffect(() => {
    if (generatedScript && !editedScript) {
      setEditedScript(generatedScript);
    }
  }, [generatedScript]);

  useEffect(() => {
    if (script?.topic && !saveTitle) {
      setSaveTitle(script.topic === "SAME_TOPIC" ? `Script from @${handle}` : script.topic);
    }
  }, [script?.topic, handle]);

  const handleGenerate = () => {
    generateMutation.mutate({
      ...recreateIdInput,
      topic: showCustomTopic ? customTopic : "",
      gradeLevel: gradeLevel as "auto" | "2" | "3" | "4" | "5" | "6",
    });
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(displayScript).then(() => {
      toast.success("Script copied to clipboard");
    });
  };

  const handleCopyTranscript = useCallback(() => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript).then(() => {
      toast.success("Transcript copied to clipboard");
    });
  }, [transcript]);

  const handleCopyTimestamped = useCallback(() => {
    if (!segments.length) return;
    const text = segments.map((s) => `${formatTimestamp(s.start)} ${s.text}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Timestamped transcript copied to clipboard");
    });
  }, [segments]);

  const handleExportSRT = useCallback(() => {
    if (!segments.length) return;
    const srt = segmentsToSRT(segments);
    const blob = new Blob([srt], { type: "text/srt" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${displayReelId}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("SRT file downloaded");
  }, [segments, displayReelId]);

  const handleSave = () => {
    const content = editMode ? editedScript : generatedScript;
    if (!content.trim()) {
      toast.error("No script content to save");
      return;
    }
    // `scripts.save` only indexes by user-scrape reelId today; featured
    // saves simply omit it (the source handle + recreatedScriptId still
    // give us enough provenance in the library).
    saveMutation.mutate({
      reelId: reelSource === "user_job" ? reelId : undefined,
      recreatedScriptId: activeScriptId || undefined,
      title: saveTitle.trim() || `Script from @${handle}`,
      content,
      sourceHandle: handle || undefined,
      gradeLevel: readability?.gradeLevel?.toString() || gradeLevel,
      postDate: saveDate ? saveDate.toISOString() : undefined,
      postTime: saveTime || undefined,
      notes: saveNotes || undefined,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      status: saveStatus,
    } as any);
  };

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // ── Not transcribed yet ──
  if (!hasTranscription) {
    return (
      <div className="bg-muted/20 border-t border-border/30 p-6">
        <div className="flex flex-col items-center gap-3">
          <FileText className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Transcribe this reel to unlock Make My Version and workflow features</p>
          <Button onClick={onTranscribe} disabled={isProcessing}>
            {isProcessing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Transcribing...</>
            ) : (
              <><FileText className="mr-2 h-4 w-4" /> Transcribe Now</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Main workflow panel ──
  return (
    <div className="bg-muted/20 border-t border-border/30">
      {/* Competitor posting info bar */}
      <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-2 text-xs">
        <Clock className="h-3 w-3 text-amber-400" />
        <span className="text-amber-400/80">
          Competitor posted: <strong className="text-amber-300">{formatPostedTime(postedAt, userTimezone)}</strong>
        </span>
        <span className="text-muted-foreground ml-1">
          (Timezone: {userTimezone.split("/").pop()?.replace("_", " ")})
        </span>
      </div>

      <div className="p-4">
        {/* ── Section 1: Transcript ── */}
        {isTranscribing ? (
          <div className="flex flex-col items-center gap-3 py-8 mb-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Transcribing...</p>
          </div>
        ) : transcriptionStatus === "failed" ? (
          <div className="flex flex-col items-center gap-3 py-8 mb-4">
            <p className="text-sm text-destructive">Transcription failed. Please retry.</p>
          </div>
        ) : !transcript && !segments.length && transcriptionStatus === "completed" ? (
          <div className="flex flex-col items-center gap-3 py-8 mb-4">
            <p className="text-sm text-muted-foreground text-center px-4">
              Looks like this one&apos;s all vibes, no voice. Try a reel with narration to unlock scripts and hooks.
            </p>
          </div>
        ) : (
          <TranscriptSection
            segments={segments}
            transcript={transcript}
            onCopyTranscript={handleCopyTranscript}
            onCopyTimestamped={handleCopyTimestamped}
            onExportSRT={handleExportSRT}
          />
        )}

        <Separator className="my-4" />

        {/* ── Section 2: Re-Create ── */}
        {!activeScriptId || !script || script.status !== "completed" ? (
          <RecreateSection
            sectionRef={recreateSectionRef}
            activeScriptId={activeScriptId}
            scriptStatus={script?.status}
            errorMessage={script?.errorMessage ?? undefined}
            gradeLevel={gradeLevel}
            setGradeLevel={setGradeLevel}
            showCustomTopic={showCustomTopic}
            setShowCustomTopic={setShowCustomTopic}
            customTopic={customTopic}
            setCustomTopic={setCustomTopic}
            onGenerate={handleGenerate}
            isGenerating={generateMutation.isPending}
            onReset={() => setActiveScriptId(null)}
            previousScripts={previousScriptsQuery.data}
            onSelectScript={setActiveScriptId}
          />
        ) : (
          /* ── Section 3: Completed script - Edit, Save, Approve ── */
          <CompletedScriptSection
            sectionRef={recreateSectionRef}
            displayScript={displayScript}
            generatedScript={generatedScript}
            editMode={editMode}
            editedScript={editedScript}
            setEditedScript={setEditedScript}
            setEditMode={setEditMode}
            wordCount={wordCount}
            readability={readability}
            viralStructure={viralStructure}
            timing={timing}
            gradeLevel={gradeLevel}
            setGradeLevel={setGradeLevel}
            targetDuration={targetDuration}
            setTargetDuration={setTargetDuration}
            addCues={addCues}
            setAddCues={setAddCues}
            isRewriting={isRewriting}
            onRewrite={() => {
              if (!activeScriptId) return;
              setIsRewriting(true);
              rewriteMutation.mutate({
                scriptId: activeScriptId,
                gradeLevel: gradeLevel as any,
                targetDuration: targetDuration as any,
                addCues,
              });
            }}
            onReset={() => setActiveScriptId(null)}
            onCopyScript={handleCopyScript}
            showTeleprompter={showTeleprompter}
            setShowTeleprompter={setShowTeleprompter}
            // Save section
            saveTitle={saveTitle}
            setSaveTitle={setSaveTitle}
            saveNotes={saveNotes}
            setSaveNotes={setSaveNotes}
            saveDate={saveDate}
            setSaveDate={setSaveDate}
            saveTime={saveTime}
            setSaveTime={setSaveTime}
            selectedTagIds={selectedTagIds}
            toggleTag={toggleTag}
            tags={tagsQuery.data}
            saveStatus={saveStatus}
            setSaveStatus={setSaveStatus}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
            userTimezone={userTimezone}
          />
        )}
      </div>

      {/* Teleprompter */}
      {showTeleprompter && displayScript && (
        <TeleprompterMode script={displayScript} onClose={() => setShowTeleprompter(false)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SearchInlineWorkflow - For Search Reels (no reelId, local state)
// ══════════════════════════════════════════════════════════════

export interface SearchInlineWorkflowProps {
  reel: {
    shortcode: string;
    caption: string;
    postedAt: string;
    ownerUsername: string;
  };
  hasTranscript: boolean;
  isTranscribing: boolean;
  transcript?: { text: string; segments: Segment[] };
  onTranscribe: () => void;
  userTimezone: string;
  recreateMutation: any;
}

export function SearchInlineWorkflow({
  reel,
  hasTranscript,
  isTranscribing,
  transcript,
  onTranscribe,
  userTimezone,
  recreateMutation,
}: SearchInlineWorkflowProps) {
  const [, navigate] = useLocation();
  const [gradeLevel, setGradeLevel] = useState("auto");
  const [customTopic, setCustomTopic] = useState("");
  const [showCustomTopic, setShowCustomTopic] = useState(false);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [targetDuration, setTargetDuration] = useState("any");
  const [addCues, setAddCues] = useState(true);

  // Script state
  const [generatedScript, setGeneratedScript] = useState("");
  const [viralStructure, setViralStructure] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editedScript, setEditedScript] = useState("");

  // Save/Approve state
  const [saveTitle, setSaveTitle] = useState(`Script from @${reel.ownerUsername}`);
  const [saveNotes, setSaveNotes] = useState("");
  const [saveDate, setSaveDate] = useState<Date | undefined>(undefined);
  const [saveTime, setSaveTime] = useState("09:00");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [saveStatus, setSaveStatus] = useState<"draft" | "approved">("draft");

  const tagsQuery = trpc.tags.list.useQuery();

  const saveMutation = trpc.scripts.save.useMutation({
    onSuccess: (data) => {
      toast.success(saveStatus === "approved" ? "Script approved and saved!" : "Script saved as draft");
      navigate(`/scripts/${data.id}`);
    },
    onError: () => toast.error("Failed to save script"),
  });

  const segments: Segment[] = transcript?.segments || [];
  const transcriptText = transcript?.text || "";

  const displayScript = editMode ? editedScript : generatedScript;
  const wordCount = displayScript.split(/\s+/).filter(Boolean).length;
  const timing = {
    slow: { duration: wordCount / 2.5 },
    average: { duration: wordCount / 3.0 },
    fast: { duration: wordCount / 3.5 },
  };

  useEffect(() => {
    if (generatedScript && !editedScript) {
      setEditedScript(generatedScript);
    }
  }, [generatedScript]);

  const handleGenerate = () => {
    if (!transcriptText) {
      toast.error("Please transcribe this reel first.");
      return;
    }
    setIsGenerating(true);
    recreateMutation.mutate(
      {
        transcript: transcriptText,
        caption: reel.caption,
        topic: showCustomTopic ? customTopic : "",
        gradeLevel: gradeLevel as any,
      },
      {
        onSuccess: (data: any) => {
          setGeneratedScript(data.generatedScript);
          setViralStructure(data.viralStructure);
          setIsGenerating(false);
          toast.success("Script generated!");
        },
        onError: (err: any) => {
          setIsGenerating(false);
          toast.error(`Generation failed: ${err.message}`);
        },
      }
    );
  };

  const handleRewrite = () => {
    if (!generatedScript) return;
    setIsRewriting(true);
    recreateMutation.mutate(
      {
        transcript: transcriptText,
        caption: reel.caption,
        topic: showCustomTopic ? customTopic : "",
        gradeLevel: gradeLevel as any,
      },
      {
        onSuccess: (data: any) => {
          setGeneratedScript(data.generatedScript);
          setViralStructure(data.viralStructure);
          setEditedScript(data.generatedScript);
          setIsRewriting(false);
          toast.success("Script rewritten!");
        },
        onError: (err: any) => {
          setIsRewriting(false);
          toast.error(`Rewrite failed: ${err.message}`);
        },
      }
    );
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(displayScript).then(() => {
      toast.success("Script copied to clipboard");
    });
  };

  const handleCopyTranscript = useCallback(() => {
    if (!transcriptText) return;
    navigator.clipboard.writeText(transcriptText).then(() => {
      toast.success("Transcript copied to clipboard");
    });
  }, [transcriptText]);

  const handleCopyTimestamped = useCallback(() => {
    if (!segments.length) return;
    const text = segments.map((s) => `${formatTimestamp(s.start)} ${s.text}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Timestamped transcript copied to clipboard");
    });
  }, [segments]);

  const handleExportSRT = useCallback(() => {
    if (!segments.length) return;
    const srt = segmentsToSRT(segments);
    const blob = new Blob([srt], { type: "text/srt" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${reel.shortcode}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("SRT file downloaded");
  }, [segments, reel.shortcode]);

  const handleSave = () => {
    const content = editMode ? editedScript : generatedScript;
    if (!content.trim()) {
      toast.error("No script content to save");
      return;
    }
    saveMutation.mutate({
      title: saveTitle.trim() || `Script from @${reel.ownerUsername}`,
      content,
      sourceHandle: reel.ownerUsername || undefined,
      gradeLevel: gradeLevel,
      postDate: saveDate ? saveDate.toISOString() : undefined,
      postTime: saveTime || undefined,
      notes: saveNotes || undefined,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      status: saveStatus,
    } as any);
  };

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // ── Not transcribed yet ──
  if (!hasTranscript && !isTranscribing) {
    return (
      <div className="bg-muted/20 border-t border-border/30 p-6">
        <div className="flex flex-col items-center gap-3">
          <FileText className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Transcribe this reel to unlock Make My Version and workflow features</p>
          <Button onClick={onTranscribe}>
            <FileText className="mr-2 h-4 w-4" /> Transcribe Now
          </Button>
        </div>
      </div>
    );
  }

  // ── Transcribing ──
  if (isTranscribing && !hasTranscript) {
    return (
      <div className="bg-muted/20 border-t border-border/30 p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Transcribing... This may take a moment.</p>
        </div>
      </div>
    );
  }

  // ── Main workflow panel ──
  return (
    <div className="bg-muted/20 border-t border-border/30">
      {/* Competitor posting info bar */}
      <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-2 text-xs">
        <Clock className="h-3 w-3 text-amber-400" />
        <span className="text-amber-400/80">
          Competitor posted: <strong className="text-amber-300">{formatPostedTime(reel.postedAt, userTimezone)}</strong>
        </span>
        <span className="text-muted-foreground ml-1">
          (Timezone: {userTimezone.split("/").pop()?.replace("_", " ")})
        </span>
      </div>

      <div className="p-4">
        {/* ── Section 1: Transcript ── */}
        <TranscriptSection
          segments={segments}
          transcript={transcriptText}
          onCopyTranscript={handleCopyTranscript}
          onCopyTimestamped={handleCopyTimestamped}
          onExportSRT={handleExportSRT}
        />

        <Separator className="my-4" />

        {/* ── Section 2: Re-Create ── */}
        {!generatedScript ? (
          <RecreateSection
            activeScriptId={null}
            scriptStatus={isGenerating ? "processing" : undefined}
            errorMessage={undefined}
            gradeLevel={gradeLevel}
            setGradeLevel={setGradeLevel}
            showCustomTopic={showCustomTopic}
            setShowCustomTopic={setShowCustomTopic}
            customTopic={customTopic}
            setCustomTopic={setCustomTopic}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            onReset={() => {}}
            previousScripts={undefined}
            onSelectScript={() => {}}
          />
        ) : (
          /* ── Section 3: Completed script - Edit, Save, Approve ── */
          <CompletedScriptSection
            displayScript={displayScript}
            generatedScript={generatedScript}
            editMode={editMode}
            editedScript={editedScript}
            setEditedScript={setEditedScript}
            setEditMode={setEditMode}
            wordCount={wordCount}
            readability={null}
            viralStructure={viralStructure}
            timing={timing}
            gradeLevel={gradeLevel}
            setGradeLevel={setGradeLevel}
            targetDuration={targetDuration}
            setTargetDuration={setTargetDuration}
            addCues={addCues}
            setAddCues={setAddCues}
            isRewriting={isRewriting}
            onRewrite={handleRewrite}
            onReset={() => { setGeneratedScript(""); setEditedScript(""); setViralStructure(null); }}
            onCopyScript={handleCopyScript}
            showTeleprompter={showTeleprompter}
            setShowTeleprompter={setShowTeleprompter}
            // Save section
            saveTitle={saveTitle}
            setSaveTitle={setSaveTitle}
            saveNotes={saveNotes}
            setSaveNotes={setSaveNotes}
            saveDate={saveDate}
            setSaveDate={setSaveDate}
            saveTime={saveTime}
            setSaveTime={setSaveTime}
            selectedTagIds={selectedTagIds}
            toggleTag={toggleTag}
            tags={tagsQuery.data}
            saveStatus={saveStatus}
            setSaveStatus={setSaveStatus}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
            userTimezone={userTimezone}
          />
        )}
      </div>

      {/* Teleprompter */}
      {showTeleprompter && displayScript && (
        <TeleprompterMode script={displayScript} onClose={() => setShowTeleprompter(false)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Shared Sub-Sections (used by both InlineWorkflow variants)
// ══════════════════════════════════════════════════════════════

function TranscriptSection({
  segments,
  transcript,
  onCopyTranscript,
  onCopyTimestamped,
  onExportSRT,
}: {
  segments: Segment[];
  transcript: string;
  onCopyTranscript: () => void;
  onCopyTimestamped: () => void;
  onExportSRT: () => void;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transcript</h4>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={onCopyTranscript}>
            <Copy className="mr-1 h-2.5 w-2.5" /> Copy
          </Button>
          {segments.length > 0 && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={onCopyTimestamped}>
              <Copy className="mr-1 h-2.5 w-2.5" /> Timestamped
            </Button>
          )}
          {segments.length > 0 && (
            <Button size="sm" className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onExportSRT}>
              <Download className="mr-1 h-2.5 w-2.5" /> SRT
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-border/50 bg-card/50 max-h-[200px] overflow-y-auto p-3">
        {segments.length > 0 ? (
          <div className="space-y-1.5">
            {segments.map((seg, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-primary font-mono text-xs shrink-0 pt-0.5 w-10">
                  {formatTimestamp(seg.start)}
                </span>
                <p className="text-sm text-foreground leading-relaxed">{seg.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-foreground leading-relaxed">{transcript || "No speech detected"}</p>
        )}
      </div>
    </div>
  );
}

function RecreateSection({
  sectionRef,
  activeScriptId,
  scriptStatus,
  errorMessage,
  gradeLevel,
  setGradeLevel,
  showCustomTopic,
  setShowCustomTopic,
  customTopic,
  setCustomTopic,
  onGenerate,
  isGenerating,
  onReset,
  previousScripts,
  onSelectScript,
}: {
  sectionRef?: React.Ref<HTMLDivElement>;
  activeScriptId: number | null;
  scriptStatus?: string;
  errorMessage?: string;
  gradeLevel: string;
  setGradeLevel: (v: string) => void;
  showCustomTopic: boolean;
  setShowCustomTopic: (v: boolean) => void;
  customTopic: string;
  setCustomTopic: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  onReset: () => void;
  previousScripts?: { id: number; topic: string; status: string }[];
  onSelectScript: (id: number) => void;
}) {
  return (
    <div ref={sectionRef}>
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-foreground">
          Make this viral hit YOURS
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generate a new script in your voice, inspired by this reel's viral hook and structure.
        </p>
      </div>

      {/* Processing state */}
      {((activeScriptId && scriptStatus === "processing") || isGenerating) && (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing viral structure and generating script...</p>
        </div>
      )}

      {/* Failed state */}
      {activeScriptId && scriptStatus === "failed" && (
        <div className="py-4 text-center">
          <p className="text-destructive text-sm mb-3">Generation failed: {errorMessage}</p>
          <Button variant="outline" size="sm" onClick={onReset}>
            Try Again
          </Button>
        </div>
      )}

      {/* Generation form */}
      {(!activeScriptId || (!scriptStatus || scriptStatus === "failed")) && !isGenerating && (
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="shrink-0">
            <label className="text-xs text-muted-foreground mb-1 block">Grade Level</label>
            <Select value={gradeLevel} onValueChange={setGradeLevel}>
              <SelectTrigger className="w-[130px] h-9 bg-card text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showCustomTopic ? (
            <div className="flex-1 min-w-0 w-full">
              <label className="text-xs text-muted-foreground mb-1 block">
                Custom Topic
                <button className="ml-2 text-primary text-[10px] underline" onClick={() => { setShowCustomTopic(false); setCustomTopic(""); }}>
                  use same topic
                </button>
              </label>
              <Input
                placeholder="Enter a different topic/angle..."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                className="h-9 bg-card"
              />
            </div>
          ) : (
            <div className="shrink-0">
              <label className="text-xs text-muted-foreground mb-1 block">Topic</label>
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setShowCustomTopic(true)}>
                Same topic (click to change)
              </Button>
            </div>
          )}

          <Button
            size="sm"
            className="h-9 shrink-0"
            onClick={onGenerate}
            disabled={isGenerating}
            title="Write your own viral script using this reel's hook and structure"
          >
            {isGenerating ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating...</>
            ) : (
              <><Wand2 className="mr-1.5 h-3.5 w-3.5" /> Make My Version</>
            )}
          </Button>
        </div>
      )}

      {/* Previous scripts */}
      {previousScripts && previousScripts.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Previous scripts:</p>
          <div className="flex flex-wrap gap-2">
            {previousScripts.map((prev) => (
              <Button
                key={prev.id}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => onSelectScript(prev.id)}
              >
                {prev.topic === "SAME_TOPIC" ? "Same topic" : (typeof prev.topic === "string" ? prev.topic.slice(0, 30) : "Script")}
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
  );
}

function CompletedScriptSection({
  sectionRef,
  displayScript,
  generatedScript,
  editMode,
  editedScript,
  setEditedScript,
  setEditMode,
  wordCount,
  readability,
  viralStructure,
  timing,
  gradeLevel,
  setGradeLevel,
  targetDuration,
  setTargetDuration,
  addCues,
  setAddCues,
  isRewriting,
  onRewrite,
  onReset,
  onCopyScript,
  showTeleprompter,
  setShowTeleprompter,
  // Save section
  saveTitle,
  setSaveTitle,
  saveNotes,
  setSaveNotes,
  saveDate,
  setSaveDate,
  saveTime,
  setSaveTime,
  selectedTagIds,
  toggleTag,
  tags,
  saveStatus,
  setSaveStatus,
  onSave,
  isSaving,
  userTimezone,
}: {
  displayScript: string;
  generatedScript: string;
  editMode: boolean;
  editedScript: string;
  setEditedScript: (v: string) => void;
  setEditMode: (v: boolean) => void;
  wordCount: number;
  readability: any;
  viralStructure: any;
  timing: { slow: { duration: number }; average: { duration: number }; fast: { duration: number } };
  gradeLevel: string;
  setGradeLevel: (v: string) => void;
  targetDuration: string;
  setTargetDuration: (v: string) => void;
  addCues: boolean;
  setAddCues: (v: boolean) => void;
  isRewriting: boolean;
  onRewrite: () => void;
  onReset: () => void;
  onCopyScript: () => void;
  showTeleprompter: boolean;
  setShowTeleprompter: (v: boolean) => void;
  saveTitle: string;
  setSaveTitle: (v: string) => void;
  saveNotes: string;
  setSaveNotes: (v: string) => void;
  saveDate: Date | undefined;
  setSaveDate: (v: Date | undefined) => void;
  saveTime: string;
  setSaveTime: (v: string) => void;
  selectedTagIds: number[];
  toggleTag: (id: number) => void;
  tags?: { id: number; name: string; color: string }[];
  saveStatus: "draft" | "approved";
  setSaveStatus: (v: "draft" | "approved") => void;
  onSave: () => void;
  isSaving: boolean;
  userTimezone: string;
  sectionRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={sectionRef}>
      {/* Script header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Script</h4>
          {readability && (
            <Badge variant="outline" className="text-[10px] h-5">
              Grade {readability.gradeLevel?.toFixed(1)}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] h-5">
            {wordCount} words
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
            &larr; New
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCopyScript}>
            <Copy className="mr-1 h-3 w-3" /> Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setShowTeleprompter(true)}
          >
            <MonitorPlay className="mr-1 h-3 w-3" /> Teleprompter
          </Button>
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              if (!editMode) {
                setEditedScript(generatedScript);
              }
              setEditMode(!editMode);
            }}
          >
            <Pencil className="mr-1 h-3 w-3" /> {editMode ? "Done Editing" : "Edit"}
          </Button>
        </div>
      </div>

      {/* ── Rewrite Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 rounded-lg border border-border/50 bg-muted/20">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Grade:</label>
          <Select value={gradeLevel} onValueChange={setGradeLevel}>
            <SelectTrigger className="h-7 w-[100px] text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRADE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            <Timer className="inline h-3 w-3 mr-0.5" />
            Duration:
          </label>
          <Select value={targetDuration} onValueChange={setTargetDuration}>
            <SelectTrigger className="h-7 w-[120px] text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            <Mic className="inline h-3 w-3 mr-0.5" />
            Cues:
          </label>
          <button
            onClick={() => setAddCues(!addCues)}
            className={`h-7 px-2.5 text-xs rounded-md border transition-colors ${
              addCues
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border"
            }`}
          >
            {addCues ? "On" : "Off"}
          </button>
        </div>

        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs ml-auto bg-primary hover:bg-primary/90"
          disabled={isRewriting}
          onClick={onRewrite}
        >
          {isRewriting ? (
            <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Rewriting...</>
          ) : (
            <><RefreshCw className="mr-1 h-3 w-3" /> Rewrite</>
          )}
        </Button>
      </div>

      {/* Script content - editable or read-only */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Left: Script */}
        <div className="rounded-lg border border-border/50 bg-card/50">
          {editMode ? (
            <Textarea
              value={editedScript}
              onChange={(e) => setEditedScript(e.target.value)}
              className="min-h-[250px] border-0 bg-transparent text-sm leading-relaxed resize-none focus-visible:ring-0"
              placeholder="Edit your script..."
            />
          ) : (
            <div className="p-3 max-h-[300px] overflow-y-auto">
              <ScriptWithCues text={displayScript} />
            </div>
          )}
        </div>

        {/* Right: Viral Structure + Timing */}
        <div className="rounded-lg border border-border/50 bg-card/50 max-h-[300px] overflow-y-auto p-3">
          {viralStructure && (
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Viral Structure</h4>
              <div className="space-y-2">
                {viralStructure.hook && (
                  <StructureBlock label="Hook" type={viralStructure.hook.type} text={viralStructure.hook.text} color="text-red-400" />
                )}
                {viralStructure.body && (
                  <StructureBlock label="Body" type={viralStructure.body.pacing} text={viralStructure.body.structure} color="text-blue-400" />
                )}
                {viralStructure.transition && (
                  <StructureBlock label="Transition" type={viralStructure.transition.type} text={viralStructure.transition.text} color="text-yellow-400" />
                )}
                {viralStructure.cta && (
                  <StructureBlock label="CTA" type={viralStructure.cta.type} text={viralStructure.cta.text} color="text-emerald-400" />
                )}
              </div>
            </div>
          )}

          <Separator className="my-3" />

          {/* Timing */}
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Delivery Timing</h4>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border/50 bg-muted/30 p-2 text-center">
              <p className="text-sm font-bold text-blue-400">{formatDuration(timing.slow.duration)}</p>
              <p className="text-[10px] text-muted-foreground">Slow</p>
            </div>
            <div className="rounded-md border border-border/50 bg-muted/30 p-2 text-center">
              <p className="text-sm font-bold text-emerald-400">{formatDuration(timing.average.duration)}</p>
              <p className="text-[10px] text-muted-foreground">Average</p>
            </div>
            <div className="rounded-md border border-border/50 bg-muted/30 p-2 text-center">
              <p className="text-sm font-bold text-orange-400">{formatDuration(timing.fast.duration)}</p>
              <p className="text-[10px] text-muted-foreground">Fast</p>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* ── Save / Approve Section ── */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Save & Schedule</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Left column: Title + Notes */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Title</label>
              <Input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="Script title..."
                className="h-9 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
              <Input
                value={saveNotes}
                onChange={(e) => setSaveNotes(e.target.value)}
                placeholder="Any notes about this script..."
                className="h-9 bg-card"
              />
            </div>
          </div>

          {/* Right column: Date + Time */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Post Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-start text-left font-normal bg-card">
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    {saveDate ? (
                      saveDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                    ) : (
                      <span className="text-muted-foreground">Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={saveDate}
                    onSelect={setSaveDate}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Preferred Time
                <span className="text-muted-foreground/60 ml-1">
                  ({userTimezone.split("/").pop()?.replace("_", " ")})
                </span>
              </label>
              <Select value={saveTime} onValueChange={setSaveTime}>
                <SelectTrigger className="h-9 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="mb-4">
            <label className="text-xs text-muted-foreground mb-2 block">
              <Tag className="inline h-3 w-3 mr-1" />
              Tags / Stage
            </label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      isSelected
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-muted/30 border-border/50 text-muted-foreground hover:border-border"
                    }`}
                  >
                    {isSelected && <Check className="inline h-3 w-3 mr-1" />}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1 h-10"
            onClick={() => {
              setSaveStatus("draft");
              onSave();
            }}
            disabled={isSaving}
          >
            {isSaving && saveStatus === "draft" ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Save as Draft</>
            )}
          </Button>
          <Button
            className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => {
              setSaveStatus("approved");
              onSave();
            }}
            disabled={isSaving}
          >
            {isSaving && saveStatus === "approved" ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving...</>
            ) : (
              <><Check className="mr-2 h-4 w-4" /> Approve & Save</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
