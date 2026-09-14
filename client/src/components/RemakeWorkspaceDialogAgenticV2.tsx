import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentProgressPanel } from "@/components/AgentProgressPanel";
import { BrollBeatsView } from "@/components/BrollResultsPanel";
import { Frame0TextPreview } from "@/components/Frame0TextPreview";
import { RemakeSourceDrawer } from "@/components/RemakeSourceDrawer";
import { trpc } from "@/lib/trpc";
import type {
  LibraryRemakeSource,
  LibraryRemakeState,
} from "@/lib/libraryRemakeChainCore";
import type { AgentProgressStep } from "@shared/agentProgress";
import type { SuggestBrollResult } from "@shared/broll";
import {
  formatSchedulePostButtonSubtitle,
  pickNextOpenPostSchedule,
  postDateToOccupiedYmd,
  toLocalYmd,
} from "@shared/coachScriptSave";

type WorkspaceTab = "script" | "visuals" | "preview";
type AgentTurn = {
  id: number;
  role: "user" | "agent";
  kind: "text" | "action";
  text: string;
  detail?: string;
  chips?: string[];
};
type SelectedText = { start: number; end: number; text: string };
type ScheduleResolution =
  | { ok: true; date: Date; time: string; label: string }
  | { ok: false; question: string };

type CaptionStyle =
  | "educational"
  | "storytelling"
  | "curiosity"
  | "bold"
  | "relatable"
  | "cta"
  | "question";
type CaptionLength = "auto" | "short" | "medium" | "long";

const CAPTION_STYLES: CaptionStyle[] = [
  "educational",
  "storytelling",
  "curiosity",
  "bold",
  "relatable",
  "cta",
  "question",
];

const CAPTION_LENGTHS: CaptionLength[] = ["auto", "short", "medium", "long"];

function isCaptionStyle(value: string | null | undefined): value is CaptionStyle {
  return Boolean(value && CAPTION_STYLES.includes(value as CaptionStyle));
}

function parseSavedHashtags(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((tag) => String(tag ?? "").replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export type RemakeWorkspaceTarget = {
  scriptId: number | null;
  reelId: number | null;
  remakeKey: string;
  source: LibraryRemakeSource | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RemakeWorkspaceTarget | null;
  remakeState: LibraryRemakeState | null;
  onRetryRemake?: () => void;
  onOpenTeleprompter?: (reelId: number, scriptId: number) => void;
  previewSeed?: { script: string; caption: string };
};

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function nextWeekday(base: Date, weekday: number): Date {
  const next = new Date(base);
  const delta = (weekday - base.getDay() + 7) % 7 || 7;
  next.setDate(base.getDate() + delta);
  return next;
}

function resolveSchedule(input: string): ScheduleResolution {
  const text = input.trim().toLowerCase();
  const now = new Date();
  let date: Date | null = null;

  if (/\btoday\b/.test(text)) date = new Date(now);
  if (/\btomorrow\b/.test(text)) {
    date = new Date(now);
    date.setDate(date.getDate() + 1);
  }

  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  for (const [name, day] of Object.entries(weekdays)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) {
      date = nextWeekday(now, day);
      break;
    }
  }

  let hour: number | null = null;
  let minute = 0;
  const explicit = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/);
  if (explicit) {
    hour = Number(explicit[1]);
    minute = Number(explicit[2] ?? 0);
    if (explicit[3] === "pm" && hour !== 12) hour += 12;
    if (explicit[3] === "am" && hour === 12) hour = 0;
  } else if (/\bmorning\b/.test(text)) hour = 9;
  else if (/\bafter lunch\b/.test(text)) hour = 13;
  else if (/\blunch\b/.test(text)) hour = 12;
  else if (/\bafternoon\b/.test(text)) hour = 15;
  else if (/\bevening\b/.test(text)) hour = 19;
  else {
    const ambiguous = text.match(/\bat\s+(1[0-2]|0?[1-9])(?::([0-5]\d))?\b/);
    if (ambiguous) return { ok: false, question: `Do you mean ${ambiguous[1]} AM or ${ambiguous[1]} PM?` };
  }

  if (!date && hour == null) return { ok: false, question: "When do you want to film this Reel?" };
  if (!date) return { ok: false, question: "Which day do you want to film it?" };
  if (hour == null) return { ok: false, question: "What time should I remind you to film it?" };

  date.setHours(hour, minute, 0, 0);
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    ok: true,
    date,
    time,
    label: date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function chipPrompt(chip: string): string {
  const prompts: Record<string, string> = {
    Punchier: "Make the wording punchier without changing the point",
    "More viral": "Make the hook more viral and curiosity-driven without changing the core message",
    "More casual": "Make it more casual and natural to say on camera",
    "More curiosity": "Increase curiosity in the opening without becoming clickbait",
    Simpler: "Simplify the language",
    "More natural": "Make this sound more natural when spoken out loud",
    "Easier to say": "Make it easier to say out loud with shorter sentences and natural rhythm",
    Shorter: "Make it 30% shorter while keeping the main point",
  };
  return prompts[chip] || chip;
}

function agentResult(prompt: string, selected: boolean): { text: string; chips: string[] } {
  const lower = prompt.toLowerCase();
  if (selected) return { text: "Done. I changed only the selected wording. Check it on the right.", chips: ["Punchier", "Simpler", "More natural"] };
  if (/short|tight|cut/.test(lower)) return { text: "Done. I tightened the script and removed repetition. Check the live script on the right.", chips: ["Punchier", "More viral", "More casual"] };
  if (/hook|opening|viral|punch/.test(lower)) return { text: "Done. I strengthened the opening while keeping the main point intact.", chips: ["Shorter", "More curiosity", "More casual"] };
  if (/grammar|spelling|typo/.test(lower)) return { text: "Done. I cleaned up the wording without changing the message.", chips: ["Easier to say", "Shorter"] };
  return { text: "Done. I updated the live script on the right.", chips: ["Punchier", "Shorter", "More viral"] };
}

export function RemakeWorkspaceDialog({
  open,
  onOpenChange,
  target,
  remakeState,
  onRetryRemake,
  onOpenTeleprompter,
  previewSeed,
}: Props) {
  const scriptId = target?.scriptId ?? null;
  const isPreview = Boolean(previewSeed) && scriptId == null;
  const utils = trpc.useUtils();
  const turnId = useRef(1);
  const hydratedId = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const autosaveTimer = useRef<number | null>(null);
  const lastSaved = useRef({ script: "", caption: "" });

  const [tab, setTab] = useState<WorkspaceTab>("script");
  const [script, setScript] = useState("");
  const [caption, setCaption] = useState("");
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("educational");
  const [captionLength, setCaptionLength] = useState<CaptionLength>("auto");
  const [captionHashtags, setCaptionHashtags] = useState<string[]>([]);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [selection, setSelection] = useState<SelectedText | null>(null);
  const [undo, setUndo] = useState<{ script: string; caption: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "saving" | "unsaved">("idle");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [scheduledLabel, setScheduledLabel] = useState<string | null>(null);
  const [broll, setBroll] = useState<SuggestBrollResult | null>(null);

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
      if (scriptId != null) void utils.scripts.get.invalidate({ id: scriptId });
    },
    onError: (error) => {
      setSaveState("unsaved");
      toast.error(error.message || "Could not save changes");
    },
  });
  const aiRewrite = trpc.scripts.aiRewrite.useMutation();
  const grammar = trpc.scripts.grammarCheck.useMutation();
  const generateCaption = trpc.scripts.generateCaption.useMutation();
  const suggestBroll = trpc.scripts.suggestBroll.useMutation();

  const voiceSummary = useMemo(() => {
    const audience = onboardingQuery.data?.targetAudience?.trim();
    const business = onboardingQuery.data?.businessDescription?.trim();
    if (business && audience) return `${business.slice(0, 26)}${business.length > 26 ? "…" : ""} · ${audience.slice(0, 30)}`;
    if (audience) return audience.slice(0, 52);
    if (business) return business.slice(0, 52);
    return "Creator profile applied";
  }, [onboardingQuery.data]);

  const nextSchedule = useMemo(() => {
    const occupied = (scriptsListQuery.data ?? [])
      .filter((item) => item.id !== scriptId)
      .map((item) => postDateToOccupiedYmd(item.postDate))
      .filter((value): value is string => Boolean(value));
    return pickNextOpenPostSchedule(occupied);
  }, [scriptsListQuery.data, scriptId]);

  const isGenerating = remakeState?.stage === "transcribing" || remakeState?.stage === "generating";
  const initialGenerationError = remakeState?.stage === "error" && !script.trim();
  const progress = Math.max(0, Math.min(100, remakeState?.progressPercent ?? 0));
  const generationSteps = useMemo<AgentProgressStep[]>(() => {
    const status = (start: number, end: number): AgentProgressStep["status"] => progress >= end ? "done" : progress >= start ? "active" : "pending";
    return [
      { id: "source", label: "Understanding the source Reel", status: status(0, 18) },
      { id: "transcribe", label: "Transcribing the Reel", status: status(18, 50) },
      { id: "profile", label: "Adapting it to your creator profile", status: status(50, 72) },
      { id: "write", label: "Writing your remake", status: status(72, 94) },
      { id: "polish", label: "Final quality check", status: status(94, 100) },
    ];
  }, [progress]);

  const versions = scriptQuery.data?.versions ?? [];

  const addTurn = useCallback((turn: Omit<AgentTurn, "id">) => {
    setTurns((previous) => [...previous, { ...turn, id: turnId.current++ }]);
  }, []);

  const persist = useCallback(async (
    nextScript: string,
    nextCaption: string,
    changeType: "manual_edit" | "ai_rewrite",
    description: string
  ) => {
    if (scriptId == null || isPreview) return false;
    setSaveState("saving");
    try {
      await updateMutation.mutateAsync({
        id: scriptId,
        content: nextScript,
        generatedCaption: nextCaption || null,
        changeType,
        changeDescription: description.slice(0, 120),
      });
      lastSaved.current = { script: nextScript, caption: nextCaption };
      setSaveState("saved");
      return true;
    } catch {
      return false;
    }
  }, [isPreview, scriptId, updateMutation]);

  useEffect(() => {
    if (!open) {
      hydratedId.current = null;
      return;
    }
    hydratedId.current = null;
    setTab("script");
    setScript("");
    setCaption("");
    setCaptionOpen(false);
    setCaptionStyle("educational");
    setCaptionLength("auto");
    setCaptionHashtags([]);
    setCaptionError(null);
    setTurns([]);
    setAgentInput("");
    setAgentBusy(false);
    setScheduleMode(false);
    setSelection(null);
    setUndo(null);
    setBroll(null);
    setSourceOpen(false);
    setScheduledLabel(null);
    setSaveState("idle");
  }, [open, target?.remakeKey]);

  useEffect(() => {
    if (!open || scriptId == null || remakeState?.stage !== "ready") return;
    hydratedId.current = null;
    void utils.scripts.get.invalidate({ id: scriptId });
  }, [open, remakeState?.stage, scriptId, utils.scripts.get]);

  useEffect(() => {
    if (!open) return;
    if (previewSeed && scriptId == null) {
      setScript(previewSeed.script);
      setCaption(previewSeed.caption);
      setCaptionHashtags([]);
      lastSaved.current = { script: previewSeed.script, caption: previewSeed.caption };
      setSaveState("idle");
      return;
    }
    if (scriptId == null || !scriptQuery.data) return;
    const content = scriptQuery.data.content ?? "";
    if (!content.trim() || hydratedId.current === scriptId) return;

    hydratedId.current = scriptId;
    const captionMeta = scriptQuery.data as {
      generatedCaption?: string | null;
      generatedHashtags?: string | null;
      captionStyle?: string | null;
      postDate?: string | Date | null;
      postTime?: string | null;
    };
    const generatedCaption = captionMeta.generatedCaption?.trim() || "";
    setScript(content);
    setCaption(generatedCaption);
    setCaptionHashtags(parseSavedHashtags(captionMeta.generatedHashtags));
    if (isCaptionStyle(captionMeta.captionStyle)) setCaptionStyle(captionMeta.captionStyle);
    lastSaved.current = { script: content, caption: generatedCaption };
    setSaveState("saved");

    if (captionMeta.postDate) {
      const date = new Date(captionMeta.postDate);
      const time = captionMeta.postTime || "12:00";
      if (!Number.isNaN(date.getTime())) {
        setScheduleDate(toLocalYmd(date));
        setScheduleTime(time);
        setScheduledLabel(formatSchedulePostButtonSubtitle(date, time));
      }
    } else {
      setScheduleDate(toLocalYmd(nextSchedule.postDate));
      setScheduleTime(nextSchedule.postTime);
    }
  }, [nextSchedule.postDate, nextSchedule.postTime, open, previewSeed, scriptId, scriptQuery.data]);

  useEffect(() => {
    if (!open || isPreview || scriptId == null || hydratedId.current !== scriptId) return;
    if (script === lastSaved.current.script && caption === lastSaved.current.caption) return;
    setSaveState("unsaved");
    if (autosaveTimer.current != null) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void persist(script, caption, "manual_edit", "Autosaved Remake edit");
    }, 6000);
    return () => {
      if (autosaveTimer.current != null) window.clearTimeout(autosaveTimer.current);
    };
  }, [caption, isPreview, open, persist, script, scriptId]);

  const closeWorkspace = useCallback(async () => {
    if (autosaveTimer.current != null) window.clearTimeout(autosaveTimer.current);
    const changed = script !== lastSaved.current.script || caption !== lastSaved.current.caption;
    if (changed && scriptId != null && !isPreview) {
      const saved = await persist(script, caption, "manual_edit", "Remake workspace close");
      if (!saved) return;
    }
    setSourceOpen(false);
    onOpenChange(false);
  }, [caption, isPreview, onOpenChange, persist, script, scriptId]);

  const undoAi = useCallback(async () => {
    if (!undo) return;
    const previous = undo;
    setScript(previous.script);
    setCaption(previous.caption);
    setUndo(null);
    await persist(previous.script, previous.caption, "manual_edit", "Undid AI change");
    addTurn({ role: "agent", kind: "action", text: "Change undone", detail: "The previous wording is back on the right." });
  }, [addTurn, persist, undo]);

  const scheduleAt = useCallback(async (date: Date, time: string, label: string) => {
    if (scriptId == null || isPreview) {
      toast.message(`Preview: would schedule for ${label}`);
      return;
    }
    setAgentBusy(true);
    setSaveState("saving");
    try {
      await updateMutation.mutateAsync({
        id: scriptId,
        content: script,
        generatedCaption: caption || null,
        postDate: toLocalYmd(date),
        postTime: time,
        status: "approved",
        changeType: "manual_edit",
        changeDescription: `Scheduled for ${label}`,
      });
      lastSaved.current = { script, caption };
      setSaveState("saved");
      setScheduleDate(toLocalYmd(date));
      setScheduleTime(time);
      setScheduledLabel(label);
      setScheduleMode(false);
      setScheduleOpen(false);
      void utils.scripts.list.invalidate();
      addTurn({ role: "agent", kind: "action", text: "Filming reminder set", detail: label });
      toast.success(`Scheduled for ${label}`);
    } catch {
      setSaveState("unsaved");
    } finally {
      setAgentBusy(false);
    }
  }, [addTurn, caption, isPreview, script, scriptId, updateMutation, utils.scripts.list]);

  const scheduleFromAgent = useCallback(async (input: string) => {
    const result = resolveSchedule(input);
    if (!result.ok) {
      addTurn({ role: "agent", kind: "text", text: result.question });
      setScheduleMode(true);
      window.setTimeout(() => composerRef.current?.focus(), 0);
      return;
    }
    await scheduleAt(result.date, result.time, result.label);
  }, [addTurn, scheduleAt]);

  const generatePublishingCaption = useCallback(async (
    options?: { style?: CaptionStyle; length?: CaptionLength }
  ) => {
    if (scriptId == null || !script.trim() || generateCaption.isPending) return;
    const nextStyle = options?.style ?? captionStyle;
    const nextLength = options?.length ?? captionLength;
    setCaptionError(null);
    try {
      const generated = await generateCaption.mutateAsync({
        scriptId,
        content: script,
        style: nextStyle,
        captionLength: nextLength,
        targetAudience: onboardingQuery.data?.targetAudience ?? undefined,
      });
      const tags = (generated.hashtags ?? [])
        .map((tag: string) => tag.replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, 5);
      setCaption(generated.caption);
      setCaptionHashtags(tags);
      setCaptionStyle(nextStyle);
      setCaptionLength(nextLength);
      setCaptionOpen(true);
      lastSaved.current = { script, caption: generated.caption };
      setSaveState("saved");
      void utils.scripts.get.invalidate({ id: scriptId });
      void utils.scripts.list.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate caption";
      setCaptionError(message);
    }
  }, [
    captionLength,
    captionStyle,
    generateCaption,
    onboardingQuery.data?.targetAudience,
    script,
    scriptId,
    utils.scripts.get,
    utils.scripts.list,
  ]);

  const refreshCaptionHashtags = useCallback(async () => {
    if (scriptId == null || !script.trim() || generateCaption.isPending || updateMutation.isPending) return;
    if (!caption.trim()) {
      await generatePublishingCaption();
      return;
    }
    setCaptionError(null);
    try {
      const generated = await generateCaption.mutateAsync({
        scriptId,
        content: script,
        style: captionStyle,
        captionLength,
        targetAudience: onboardingQuery.data?.targetAudience ?? undefined,
      });
      const tags = (generated.hashtags ?? [])
        .map((tag: string) => tag.replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, 5);
      await updateMutation.mutateAsync({
        id: scriptId,
        generatedCaption: caption,
        generatedHashtags: JSON.stringify(tags),
        captionStyle,
      });
      setCaptionHashtags(tags);
      lastSaved.current = { script, caption };
      setSaveState("saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not refresh hashtags";
      setCaptionError(message);
    }
  }, [
    caption,
    captionLength,
    captionStyle,
    generateCaption,
    generatePublishingCaption,
    onboardingQuery.data?.targetAudience,
    script,
    scriptId,
    updateMutation,
  ]);

  const copyPublishingCaption = useCallback(async () => {
    const tags = captionHashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ");
    const text = [caption.trim(), tags].filter(Boolean).join("\n\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Caption copied");
    } catch {
      toast.error("Could not copy caption");
    }
  }, [caption, captionHashtags]);

  const runAgent = useCallback(async (
    raw: string,
    options?: { ignoreSelection?: boolean; captionOnly?: boolean }
  ) => {
    const prompt = raw.trim();
    if (!prompt || agentBusy) return;
    addTurn({ role: "user", kind: "text", text: prompt });
    setAgentInput("");

    const lower = prompt.toLowerCase();
    if (
      scheduleMode ||
      /\b(schedule|remind)\b/.test(lower) ||
      (/\bfilm\b/.test(lower) && /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|morning|afternoon|evening)\b/.test(lower))
    ) {
      await scheduleFromAgent(prompt);
      return;
    }

    if (scriptId == null) {
      addTurn({ role: "agent", kind: "text", text: "Your remake is still generating. I can edit it as soon as the script is ready." });
      return;
    }

    const selected = options?.ignoreSelection ? null : selection;
    const captionOnly = options?.captionOnly || (/\b(caption|hashtag)\b/.test(lower) && !/\b(script|hook|spoken)\b/.test(lower));
    const hashtagsOnly = captionOnly && Boolean(caption.trim()) && /\b(add|refresh|update|new)\b.*\bhashtags?\b/.test(lower) && !/\brewrite\b.*\bcaption\b/.test(lower);
    const before = { script, caption };
    setAgentBusy(true);
    setSaveState("saving");
    setCaptionError(null);

    try {
      let nextScript = script;
      let nextCaption = caption;

      if (!captionOnly) {
        const instruction = selected
          ? `Change only this exact selected text in the script: "${selected.text}". Instruction: ${prompt}. Keep every other word unchanged.`
          : prompt;
        const useGrammar = /grammar|spelling|typo/.test(lower);
        const rewritten = useGrammar
          ? await grammar.mutateAsync({ scriptId, content: script, persist: false })
          : await aiRewrite.mutateAsync({ scriptId, content: script, instruction, persist: false });
        nextScript = rewritten.content;

        if (!useGrammar && !selected && normalized(nextScript) === normalized(script)) {
          const stronger = await aiRewrite.mutateAsync({
            scriptId,
            content: script,
            instruction: `${instruction}. Make a meaningful improvement while preserving the creator's main point.`,
            persist: false,
          });
          nextScript = stronger.content;
        }
      } else {
        let requestedStyle = captionStyle;
        let requestedLength = captionLength;
        if (/\bstory|storytelling\b/.test(lower)) requestedStyle = "storytelling";
        else if (/\bcuriosity\b/.test(lower)) requestedStyle = "curiosity";
        else if (/\bbold|contrarian\b/.test(lower)) requestedStyle = "bold";
        else if (/\brelatable|casual\b/.test(lower)) requestedStyle = "relatable";
        else if (/\bcta|call to action\b/.test(lower)) requestedStyle = "cta";
        else if (/\bquestion\b/.test(lower)) requestedStyle = "question";
        else if (/\beducational|value\b/.test(lower)) requestedStyle = "educational";

        if (/\bshorter|short caption\b/.test(lower)) requestedLength = "short";
        else if (/\blonger|long caption\b/.test(lower)) requestedLength = "long";

        const generated = await generateCaption.mutateAsync({
          scriptId,
          content: script,
          style: requestedStyle,
          captionLength: requestedLength,
          targetAudience: onboardingQuery.data?.targetAudience ?? undefined,
        });
        const tags = (generated.hashtags ?? [])
          .map((tag: string) => tag.replace(/^#/, "").trim())
          .filter(Boolean)
          .slice(0, 5);

        setCaptionStyle(requestedStyle);
        setCaptionLength(requestedLength);
        setCaptionHashtags(tags);

        if (hashtagsOnly) {
          await updateMutation.mutateAsync({
            id: scriptId,
            generatedCaption: caption,
            generatedHashtags: JSON.stringify(tags),
            captionStyle: requestedStyle,
          });
          nextCaption = caption;
        } else {
          nextCaption = generated.caption;
        }
      }

      setUndo(before);
      setScript(nextScript);
      setCaption(nextCaption);
      setSelection(null);
      if (captionOnly) setCaptionOpen(true);
      setTab("script");

      if (captionOnly) {
        lastSaved.current = { script: nextScript, caption: nextCaption };
        setSaveState("saved");
        void utils.scripts.get.invalidate({ id: scriptId });
        void utils.scripts.list.invalidate();
        addTurn({
          role: "agent",
          kind: "action",
          text: hashtagsOnly ? "Hashtags refreshed" : "Caption updated",
          detail: "Your publishing text is saved.",
        });
        return;
      }

      const saved = await persist(
        nextScript,
        nextCaption,
        "ai_rewrite",
        selected ? `Selected text: ${prompt}` : prompt
      );
      if (!saved) return;

      const response = agentResult(prompt, Boolean(selected));
      addTurn({
        role: "agent",
        kind: "action",
        text: response.text,
        detail: "Undo is available if you want the previous version back.",
        chips: response.chips,
      });
    } catch (error) {
      setSaveState(script.trim() ? "saved" : "idle");
      if (captionOnly) {
        setCaptionError(error instanceof Error ? error.message : "Could not update caption");
      }
      addTurn({
        role: "agent",
        kind: "text",
        text: error instanceof Error ? error.message : "I could not make that change. Try a more specific instruction.",
      });
    } finally {
      setAgentBusy(false);
    }
  }, [
    addTurn,
    agentBusy,
    aiRewrite,
    caption,
    captionLength,
    captionStyle,
    generateCaption,
    grammar,
    onboardingQuery.data?.targetAudience,
    persist,
    scheduleFromAgent,
    scheduleMode,
    script,
    scriptId,
    selection,
    updateMutation,
    utils.scripts.get,
    utils.scripts.list,
  ]);

  const matchStockBroll = useCallback(async () => {
    if (!script.trim()) return;
    if (scriptId == null) {
      toast.message("Wait for the remake script to finish generating");
      return;
    }
    try {
      const result = await suggestBroll.mutateAsync({ scriptId, content: script });
      setBroll(result as SuggestBrollResult);
      addTurn({
        role: "agent",
        kind: "action",
        text: "Stock B-roll matched",
        detail: "I matched real clips to the moments that benefit from B-roll. Review them on the right.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not match B-roll");
    }
  }, [addTurn, script, scriptId, suggestBroll]);

  const restoreVersion = useCallback(async (version: { content: string; versionNumber: number }) => {
    setScript(version.content);
    setHistoryOpen(false);
    setTab("script");
    setSelection(null);
    await persist(version.content, caption, "manual_edit", `Restored v${version.versionNumber}`);
    addTurn({ role: "agent", kind: "action", text: `Restored version ${version.versionNumber}`, detail: "The restored script is live on the right." });
  }, [addTurn, caption, persist]);

  const openSchedule = useCallback(() => {
    if (!scheduleDate) setScheduleDate(toLocalYmd(nextSchedule.postDate));
    if (!scheduleTime) setScheduleTime(nextSchedule.postTime);
    setScheduleOpen(true);
  }, [nextSchedule.postDate, nextSchedule.postTime, scheduleDate, scheduleTime]);

  const saveSchedule = useCallback(async () => {
    if (!scheduleDate || !scheduleTime) return;
    const date = new Date(`${scheduleDate}T${scheduleTime}:00`);
    if (Number.isNaN(date.getTime())) {
      toast.error("Choose a valid date and time");
      return;
    }
    await scheduleAt(date, scheduleTime, formatSchedulePostButtonSubtitle(date, scheduleTime));
  }, [scheduleAt, scheduleDate, scheduleTime]);

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) void closeWorkspace(); }}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(92vh,850px)] max-h-[92vh] w-[min(1180px,100%)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-[#2d2940] bg-[#1c1926] p-0 text-[#f5f2fa] sm:max-w-[min(1180px,calc(100%-1.5rem))]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Remake workspace</DialogTitle>
            <DialogDescription>Work with SpyReels Agent on your script, visuals, and opening-frame preview.</DialogDescription>
          </DialogHeader>

          <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-[#2d2940] bg-[#1b1824] px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <strong className="text-[15px] text-white">Remake</strong>
                <span className="rounded-full border border-[#3a3450] bg-[#242032] px-2 py-0.5 text-[10px] font-semibold text-[#aca4bd]">Based on a viral Reel</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[#827b92]">Turn the source into your version</p>
            </div>

            <nav className="flex gap-1 rounded-xl border border-[#332e45] bg-[#15121d] p-1" aria-label="Remake workspace">
              {(["script", "visuals", "preview"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`rounded-lg px-4 py-2 text-[13px] font-semibold capitalize transition ${tab === item ? "bg-[#302a42] text-white" : "text-[#9b94aa] hover:text-white"}`}
                >
                  {item === "preview" ? "Preview" : item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </nav>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={target?.source == null && target?.reelId == null}
                onClick={() => setSourceOpen((value) => !value)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${sourceOpen ? "border-violet-500/40 bg-violet-500/10 text-violet-200" : "border-[#342f46] bg-[#211d2d] text-[#b7b0c7] hover:text-white"}`}
                title="View the original transcript"
              >
                <FileText className="h-4 w-4" /> Source
              </button>
              <button type="button" onClick={() => setHistoryOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#211d2d] px-3 py-2 text-xs font-semibold text-[#b7b0c7] hover:text-white">
                <History className="h-4 w-4" /> History <span className="text-[#827b92]">{versions.length}</span>
              </button>
              <button type="button" aria-label="Close remake" onClick={() => void closeWorkspace()} className="grid h-9 w-9 place-items-center rounded-lg text-[#928aa3] hover:bg-[#292437] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-[330px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-r border-[#2d2940] bg-[#191620]">
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-400"><Sparkles className="h-4 w-4" /></span>
                  <h3 className="text-sm font-bold text-white">SpyReels Agent</h3>
                </div>

                {turns.length > 0 ? (
                  <div className="space-y-3">
                    {turns.map((turn) => turn.role === "user" ? (
                      <div key={turn.id} className="ml-auto max-w-[88%] rounded-2xl rounded-br-md border border-violet-500/20 bg-violet-500/10 px-3 py-2.5 text-sm text-[#f5f2fa]">{turn.text}</div>
                    ) : turn.kind === "action" ? (
                      <div key={turn.id} className="rounded-xl border border-[#302b40] bg-[#211d2b] px-3 py-3">
                        <p className="text-sm font-medium leading-relaxed text-[#f1edf7]"><span className="mr-2 text-emerald-400">✓</span>{turn.text}</p>
                        {turn.detail ? <p className="mt-1 text-xs leading-relaxed text-[#8f879f]">{turn.detail}</p> : null}
                        {turn.chips?.length ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {turn.chips.map((chip) => (
                              <button key={chip} type="button" disabled={agentBusy} onClick={() => { setSelection(null); void runAgent(chipPrompt(chip), { ignoreSelection: true }); }} className="rounded-full border border-[#3b354b] px-2.5 py-1 text-[11px] font-medium text-[#b9b2c5] hover:bg-[#2a2436] hover:text-white">{chip}</button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p key={turn.id} className="text-sm leading-relaxed text-[#b9b2c5]">{turn.text}</p>
                    ))}
                    {agentBusy ? <div className="flex items-center gap-2 text-sm text-[#928aa3]"><Loader2 className="h-4 w-4 animate-spin text-violet-400" /> Agent is working...</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-[#2d2940] p-3">
                <p className="mb-2 truncate px-1 text-[11px] text-[#777083]">Writing as: <span className="text-[#a9a1b7]">{voiceSummary}</span></p>
                {selection ? (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-2.5 py-2 text-[11px] text-violet-200">
                    <span className="min-w-0 flex-1 truncate">Selected: “{selection.text}”</span>
                    <button type="button" onClick={() => setSelection(null)} className="text-violet-300 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : null}
                <div className="rounded-xl border border-[#363048] bg-[#211d2b] p-2">
                  <textarea
                    ref={composerRef}
                    value={agentInput}
                    disabled={agentBusy}
                    onChange={(event) => setAgentInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      void runAgent(agentInput);
                    }}
                    placeholder={scheduleMode ? "Tell Agent when you want to film it..." : selection ? "What should I change in this selection?" : "Ask SpyReels to improve this script..."}
                    className="min-h-[62px] w-full resize-none bg-transparent px-1 py-1 text-sm text-white outline-none placeholder:text-[#6f687d]"
                  />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {undo ? <button type="button" disabled={agentBusy} onClick={() => void undoAi()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#a9a1b7] hover:bg-[#2a2534] hover:text-white"><RotateCcw className="h-3.5 w-3.5" /> Undo</button> : <span />}
                    <button type="button" disabled={agentBusy || !agentInput.trim()} onClick={() => void runAgent(agentInput)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40">Send <Send className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            </aside>

            <main className="relative min-h-0 min-w-0 overflow-hidden bg-[#1c1926]">
              <div className={`h-full min-w-0 transition-[padding] duration-200 ${sourceOpen ? "pr-[360px]" : ""}`}>
                {tab === "script" ? (
                  isGenerating && !script.trim() ? (
                    <div className="h-full overflow-y-auto">
                      <AgentProgressPanel steps={generationSteps} headline="Creating your remake" subheadline="SpyReels is working through the source, your profile, and the final script." />
                    </div>
                  ) : initialGenerationError ? (
                    <div className="flex h-full items-center justify-center overflow-y-auto px-8 py-10">
                      <div className="max-w-md text-center">
                        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-rose-500/10 text-rose-300">!</div>
                        <h3 className="mt-4 text-base font-bold text-white">We couldn't create this remake</h3>
                        <p className="mt-2 text-sm leading-relaxed text-[#91899f]">
                          {remakeState?.errorMessage?.trim() || "The remake did not finish. Try again, or open Source to work from the original transcript."}
                        </p>
                        <div className="mt-5 flex items-center justify-center gap-2">
                          {onRetryRemake ? (
                            <button type="button" onClick={onRetryRemake} className="rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500">Try again</button>
                          ) : null}
                          <button type="button" onClick={() => setSourceOpen(true)} className="rounded-lg border border-[#393349] bg-[#24202e] px-4 py-2.5 text-xs font-semibold text-[#c5bed2] hover:text-white">View source</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full overflow-y-auto px-7 py-6">
                      <div className="mx-auto max-w-[760px]">
                        <div className="mb-4 flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2"><h3 className="text-base font-bold text-white">Video script</h3>{script.trim() ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Draft</span> : null}</div>
                            <p className="mt-1 text-xs text-[#8f879f]">What you will say on camera</p>
                          </div>
                          <button
                            type="button"
                            disabled={scriptId == null || target?.reelId == null}
                            onClick={() => {
                              if (scriptId == null || target?.reelId == null) return;
                              onOpenTeleprompter?.(target.reelId, scriptId);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-[#393349] bg-[#24202e] px-3 py-2 text-xs font-semibold text-[#c5bed2] hover:text-white disabled:opacity-40"
                          ><Play className="h-3.5 w-3.5" /> Open teleprompter</button>
                        </div>

                        <div className="relative">
                          {selection ? (
                            <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-violet-500/25 bg-[#211d2b]/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur">
                              <span className="max-w-[210px] truncate text-[#bcb5c9]">“{selection.text}”</span>
                              <button type="button" onClick={() => window.setTimeout(() => composerRef.current?.focus(), 0)} className="font-semibold text-violet-300 hover:text-white">Ask Agent</button>
                              <button type="button" onClick={() => setSelection(null)} className="text-[#847d91] hover:text-white"><X className="h-3 w-3" /></button>
                            </div>
                          ) : null}
                          <textarea
                            value={script}
                            disabled={isGenerating && !script}
                            onSelect={(event) => {
                              const start = event.currentTarget.selectionStart;
                              const end = event.currentTarget.selectionEnd;
                              if (start === end) return;
                              const text = event.currentTarget.value.slice(start, end).trim();
                              if (text.length >= 2) setSelection({ start, end, text });
                            }}
                            onChange={(event) => { setScript(event.target.value); setSelection(null); }}
                            placeholder="Your remake script will appear here..."
                            className="min-h-[390px] w-full resize-y rounded-2xl border border-[#332e45] bg-[#17141f] px-5 py-5 text-[15px] leading-7 text-[#f3eff8] outline-none transition focus:border-violet-500/45"
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" disabled={agentBusy || !script.trim()} onClick={() => { setSelection(null); void runAgent("Improve this Reel script in my voice", { ignoreSelection: true }); }} className="rounded-lg bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/15">Improve script</button>
                          <button type="button" disabled={agentBusy || !script.trim()} onClick={() => { setSelection(null); void runAgent("Fix the grammar", { ignoreSelection: true }); }} className="rounded-lg border border-[#332e45] px-3 py-2 text-xs font-semibold text-[#aaa3b8] hover:text-white">Fix grammar</button>
                          <button type="button" disabled={agentBusy || !script.trim()} onClick={() => { setSelection(null); void runAgent("Make it 30% shorter while keeping the main point", { ignoreSelection: true }); }} className="rounded-lg border border-[#332e45] px-3 py-2 text-xs font-semibold text-[#aaa3b8] hover:text-white">Make shorter</button>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-xl border border-[#332e45] bg-[#191620]">
                          <button type="button" onClick={() => setCaptionOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <strong className="text-sm text-white">Caption</strong>
                                {caption.trim() ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Ready</span> : null}
                              </div>
                              <p className="mt-0.5 text-[11px] text-[#7f788d]">Publishing text and hashtags, generated from this script</p>
                            </div>
                            {captionOpen ? <ChevronUp className="h-4 w-4 text-[#8d8599]" /> : <ChevronDown className="h-4 w-4 text-[#8d8599]" />}
                          </button>
                          {captionOpen ? (
                            <div className="border-t border-[#302b40] p-3">
                              <div className="mb-3 flex flex-wrap items-end gap-2">
                                <label className="min-w-[150px] flex-1 text-[10px] font-semibold uppercase tracking-wide text-[#746d82]">
                                  Style
                                  <select
                                    value={captionStyle}
                                    disabled={generateCaption.isPending || agentBusy}
                                    onChange={(event) => setCaptionStyle(event.target.value as CaptionStyle)}
                                    className="mt-1 h-9 w-full rounded-lg border border-[#332e45] bg-[#15121c] px-2.5 text-xs font-medium capitalize text-[#d6d0df] outline-none focus:border-violet-500/45"
                                  >
                                    {CAPTION_STYLES.map((style) => (
                                      <option key={style} value={style}>{style === "cta" ? "CTA" : style[0].toUpperCase() + style.slice(1)}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="min-w-[130px] flex-1 text-[10px] font-semibold uppercase tracking-wide text-[#746d82]">
                                  Length
                                  <select
                                    value={captionLength}
                                    disabled={generateCaption.isPending || agentBusy}
                                    onChange={(event) => setCaptionLength(event.target.value as CaptionLength)}
                                    className="mt-1 h-9 w-full rounded-lg border border-[#332e45] bg-[#15121c] px-2.5 text-xs font-medium text-[#d6d0df] outline-none focus:border-violet-500/45"
                                  >
                                    {CAPTION_LENGTHS.map((length) => (
                                      <option key={length} value={length}>{length[0].toUpperCase() + length.slice(1)}</option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  disabled={scriptId == null || !script.trim() || generateCaption.isPending || agentBusy}
                                  onClick={() => void generatePublishingCaption()}
                                  className="inline-flex h-9 min-w-[120px] items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-40"
                                >
                                  {generateCaption.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                  {generateCaption.isPending ? "Generating..." : caption.trim() ? "Regenerate" : "Generate caption"}
                                </button>
                              </div>

                              <textarea
                                value={caption}
                                onChange={(event) => {
                                  setCaption(event.target.value);
                                  setCaptionError(null);
                                }}
                                placeholder="Generate a caption from your script, or write your own..."
                                className="min-h-[150px] w-full resize-y rounded-xl border border-[#332e45] bg-[#15121c] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-violet-500/45"
                              />

                              {captionHashtags.length > 0 ? (
                                <div className="mt-3 rounded-xl border border-[#2e293d] bg-[#15121c] p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#746d82]">Hashtags</span>
                                    <button
                                      type="button"
                                      disabled={generateCaption.isPending || updateMutation.isPending || agentBusy}
                                      onClick={() => void refreshCaptionHashtags()}
                                      className="text-[11px] font-semibold text-violet-300 hover:text-white disabled:opacity-40"
                                    >
                                      Refresh hashtags
                                    </button>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {captionHashtags.map((tag) => (
                                      <span key={tag} className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200">#{tag.replace(/^#/, "")}</span>
                                    ))}
                                  </div>
                                </div>
                              ) : caption.trim() ? (
                                <button
                                  type="button"
                                  disabled={generateCaption.isPending || updateMutation.isPending || agentBusy}
                                  onClick={() => void refreshCaptionHashtags()}
                                  className="mt-2 text-[11px] font-semibold text-violet-300 hover:text-white disabled:opacity-40"
                                >
                                  Generate hashtags
                                </button>
                              ) : null}

                              {captionError ? (
                                <p className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-300">{captionError}</p>
                              ) : null}

                              {caption.trim() ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={generateCaption.isPending || agentBusy}
                                    onClick={() => void generatePublishingCaption({ length: "short" })}
                                    className="rounded-lg border border-[#332e45] px-3 py-1.5 text-[11px] font-semibold text-[#aaa3b8] hover:text-white disabled:opacity-40"
                                  >
                                    Make shorter
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void copyPublishingCaption()}
                                    className="rounded-lg border border-[#332e45] px-3 py-1.5 text-[11px] font-semibold text-[#aaa3b8] hover:text-white"
                                  >
                                    Copy caption
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                ) : null}

                {tab === "visuals" ? (
                  <div className="h-full overflow-y-auto px-7 py-6">
                    <div className="mx-auto max-w-[820px]">
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-base font-bold text-white">Recommended B-roll</h3>
                          <p className="mt-1 max-w-lg text-xs leading-relaxed text-[#8f879f]">Match real stock clips to the moments that benefit from B-roll, then keep or regenerate the clips you want.</p>
                        </div>
                        <button type="button" disabled={!script.trim() || suggestBroll.isPending} onClick={() => void matchStockBroll()} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40">
                          {suggestBroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                          {suggestBroll.isPending ? "Matching..." : broll ? "Match again" : "Find stock clips"}
                        </button>
                      </div>

                      {!broll ? (
                        <div className="rounded-2xl border border-[#332e45] bg-[#191620] px-6 py-10 text-center">
                          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><Sparkles className="h-5 w-5" /></div>
                          <h4 className="mt-4 text-sm font-bold text-white">Match visuals to your script</h4>
                          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#8f879f]">SpyReels will find real stock clips for the moments that benefit from B-roll. You can keep the rest as talking head.</p>
                          <button type="button" disabled={!script.trim() || suggestBroll.isPending} onClick={() => void matchStockBroll()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"><Wand2 className="h-4 w-4" /> Find stock clips</button>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-[#332e45] bg-[#17141f] p-3"><BrollBeatsView result={broll} /></div>
                      )}
                    </div>
                  </div>
                ) : null}

                {tab === "preview" ? (
                  <Frame0TextPreview
                    script={script}
                    source={target?.source ?? null}
                    reelId={target?.reelId ?? null}
                  />
                ) : null}
              </div>

              <RemakeSourceDrawer
                open={sourceOpen}
                onClose={() => setSourceOpen(false)}
                source={target?.source ?? null}
                reelId={target?.reelId ?? null}
              />
            </main>
          </div>

          <footer className="flex items-center justify-between border-t border-[#2d2940] bg-[#1b1824] px-5 py-3">
            <div className="inline-flex min-h-[18px] items-center gap-2 text-xs text-[#8e879b]">
              {!isGenerating && !initialGenerationError && script.trim() && saveState !== "idle" ? (
                <>
                  {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" /> : <Check className="h-3.5 w-3.5 text-emerald-400" />}
                  {saveState === "saving" ? "Saving..." : saveState === "unsaved" ? "Saving automatically..." : "Saved"}
                </>
              ) : null}
            </div>
            <button type="button" disabled={isGenerating || initialGenerationError || !script.trim() || updateMutation.isPending} onClick={openSchedule} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-40">
              <CalendarDays className="h-4 w-4" />{scheduledLabel ? `Scheduled · ${scheduledLabel}` : "Schedule"}
            </button>
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md border-[#2a2640] bg-[#1a1724] text-[#f3f0fa]">
          <DialogHeader><DialogTitle>History</DialogTitle><DialogDescription className="text-[#a39db8]">Important versions of this Remake script.</DialogDescription></DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {versions.length === 0 ? <p className="text-sm text-[#8f879f]">No earlier versions yet.</p> : versions.slice().reverse().map((version) => (
              <div key={version.id} className="flex items-center gap-3 rounded-xl border border-[#302b40] bg-[#211d2b] p-3">
                <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{version.changeDescription?.trim() || `Version ${version.versionNumber}`}</strong><span className="mt-1 block text-[11px] text-[#8f879f]">v{version.versionNumber} · {version.changeType}</span></div>
                <button type="button" onClick={() => void restoreVersion(version)} className="rounded-lg border border-[#3a344a] px-2.5 py-1.5 text-[11px] font-semibold text-[#b9b2c5] hover:text-white">Restore</button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-sm border-[#2a2640] bg-[#1a1724] text-[#f3f0fa]">
          <DialogHeader><DialogTitle>Schedule filming</DialogTitle><DialogDescription className="text-[#a39db8]">Pick a date and time, or tell Agent something like “Schedule this Friday at 3 PM.”</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block text-xs font-semibold text-[#a9a1b7]">Date<input type="date" value={scheduleDate} min={toLocalYmd(new Date())} onChange={(event) => setScheduleDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#393349] bg-[#15121c] px-3 text-sm text-white outline-none focus:border-violet-500/50" /></label>
            <label className="block text-xs font-semibold text-[#a9a1b7]">Time<input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#393349] bg-[#15121c] px-3 text-sm text-white outline-none focus:border-violet-500/50" /></label>
            <button type="button" disabled={!scheduleDate || !scheduleTime || updateMutation.isPending} onClick={() => void saveSchedule()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-40">
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Schedule
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
