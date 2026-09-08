import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  Scissors,
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
import { trpc } from "@/lib/trpc";
import type { LibraryRemakeState } from "@/lib/libraryRemakeChainCore";
import { AgentProgressPanel } from "@/components/AgentProgressPanel";
import { BrollBeatsView } from "@/components/BrollResultsPanel";
import type { AgentProgressStep } from "@shared/agentProgress";
import type { SuggestBrollResult } from "@shared/broll";
import {
  formatSchedulePostButtonSubtitle,
  pickNextOpenPostSchedule,
  postDateToOccupiedYmd,
  toLocalYmd,
} from "@shared/coachScriptSave";

type WorkspaceTab = "script" | "visuals" | "preview";
type EditorTab = "script" | "caption";
type ClarifyTarget = "script" | "caption" | "both";

type AgentTurn = {
  id: number;
  role: "user" | "agent";
  kind: "text" | "action";
  text: string;
  detail?: string;
  chips?: string[];
};

type SelectedScriptText = {
  start: number;
  end: number;
  text: string;
};

type ScheduleResolution =
  | { ok: true; date: Date; time: string; label: string }
  | { ok: false; question: string };

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
  previewSeed?: { script: string; caption: string };
};

function firstHookLine(script: string): string {
  const line = script
    .split(/\n+/)
    .map((value) => value.trim())
    .find(Boolean);
  if (!line) return "Your hook will show here";
  return line.replace(/^\[.*?\]\s*/, "").slice(0, 110);
}

function scriptsNearlyIdentical(a: string, b: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(a) === normalize(b);
}

function nextWeekday(base: Date, weekday: number): Date {
  const next = new Date(base);
  const delta = (weekday - base.getDay() + 7) % 7 || 7;
  next.setDate(base.getDate() + delta);
  return next;
}

function resolveFilmingSchedule(input: string): ScheduleResolution {
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
  } else if (/\bmorning\b/.test(text)) {
    hour = 9;
  } else if (/\bafter lunch\b/.test(text)) {
    hour = 13;
  } else if (/\blunch\b/.test(text)) {
    hour = 12;
  } else if (/\bafternoon\b/.test(text)) {
    hour = 15;
  } else if (/\bevening\b/.test(text)) {
    hour = 19;
  } else {
    const ambiguous = text.match(/\bat\s+(1[0-2]|0?[1-9])(?::([0-5]\d))?\b/);
    if (ambiguous) {
      return { ok: false, question: `Do you mean ${ambiguous[1]} AM or ${ambiguous[1]} PM?` };
    }
  }

  if (!date && hour == null) return { ok: false, question: "When do you want to film this Reel?" };
  if (!date) return { ok: false, question: "Which day do you want to film it?" };
  if (hour == null) return { ok: false, question: "What time should I remind you to film it?" };

  date.setHours(hour, minute, 0, 0);
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const label = date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return { ok: true, date, time, label };
}

function agentDoneMessage(prompt: string, selected: boolean): { text: string; chips: string[] } {
  const lower = prompt.toLowerCase();
  if (selected) {
    return {
      text: "Done. I changed only the selected wording. Check it on the right.",
      chips: ["Punchier", "Simpler", "More natural"],
    };
  }
  if (/short|tight|cut/.test(lower)) {
    return {
      text: "Done. I tightened the script and removed repetition. Check the live script on the right.",
      chips: ["Punchier", "More viral", "More casual"],
    };
  }
  if (/hook|opening|viral|punch/.test(lower)) {
    return {
      text: "Done. I strengthened the opening while keeping the main point intact.",
      chips: ["Shorter", "More curiosity", "More casual"],
    };
  }
  if (/grammar|spelling|typo/.test(lower)) {
    return {
      text: "Done. I cleaned up the wording without changing the message.",
      chips: ["Easier to say", "Shorter"],
    };
  }
  return {
    text: "Done. I updated the live script on the right.",
    chips: ["Punchier", "Shorter", "More viral"],
  };
}

function promptForChip(chip: string): string {
  switch (chip) {
    case "Punchier":
      return "Make the wording punchier without changing the point";
    case "More viral":
      return "Make the hook more viral and curiosity-driven without changing the core message";
    case "More casual":
      return "Make it more casual and natural to say on camera";
    case "More curiosity":
      return "Increase curiosity in the opening without becoming clickbait";
    case "Simpler":
      return "Simplify the language";
    case "More natural":
      return "Make this sound more natural when spoken out loud";
    case "Easier to say":
      return "Make it easier to say out loud with shorter sentences and natural rhythm";
    case "Shorter":
      return "Make it 30% shorter while keeping the main point";
    default:
      return chip;
  }
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
  const isPreview = Boolean(previewSeed) && scriptId == null;
  const utils = trpc.useUtils();
  const turnIdRef = useRef(1);
  const hydratedIdRef = useRef<number | null>(null);
  const scriptEditorRef = useRef<HTMLTextAreaElement>(null);
  const agentComposerRef = useRef<HTMLTextAreaElement>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef({ script: "", caption: "" });

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("script");
  const [editorTab, setEditorTab] = useState<EditorTab>("script");
  const [captionOpen, setCaptionOpen] = useState(false);
  const [script, setScript] = useState("");
  const [caption, setCaption] = useState("");
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [selectedText, setSelectedText] = useState<SelectedScriptText | null>(null);
  const [undoTarget, setUndoTarget] = useState<{ script: string; caption: string } | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [scheduledLabel, setScheduledLabel] = useState<string | null>(null);
  const [brollResult, setBrollResult] = useState<SuggestBrollResult | null>(null);

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
    onError: (err) => {
      setSaveState("unsaved");
      toast.error(err.message || "Could not save changes");
    },
  });
  const aiRewriteMutation = trpc.scripts.aiRewrite.useMutation();
  const grammarMutation = trpc.scripts.grammarCheck.useMutation();
  const captionMutation = trpc.scripts.generateCaption.useMutation();
  const suggestBrollMutation = trpc.scripts.suggestBroll.useMutation();

  const voiceSummary = useMemo(() => {
    const audience = onboardingQuery.data?.targetAudience?.trim();
    const business = onboardingQuery.data?.businessDescription?.trim();
    if (business && audience) {
      return `${business.slice(0, 26)}${business.length > 26 ? "…" : ""} · ${audience.slice(0, 30)}`;
    }
    if (audience) return audience.slice(0, 52);
    if (business) return business.slice(0, 52);
    return "Creator profile applied";
  }, [onboardingQuery.data]);

  const scheduleSlot = useMemo(() => {
    const occupied = (scriptsListQuery.data ?? [])
      .filter((item) => item.id !== scriptId)
      .map((item) => postDateToOccupiedYmd(item.postDate))
      .filter((value): value is string => Boolean(value));
    return pickNextOpenPostSchedule(occupied);
  }, [scriptsListQuery.data, scriptId]);

  const isGenerating = remakeState?.stage === "transcribing" || remakeState?.stage === "generating";
  const progressPercent = remakeState?.progressPercent ?? 0;

  const generationSteps = useMemo<AgentProgressStep[]>(() => {
    const progress = Math.max(0, Math.min(100, progressPercent));
    const stepStatus = (start: number, finish: number): AgentProgressStep["status"] => {
      if (progress >= finish) return "done";
      if (progress >= start) return "active";
      return "pending";
    };
    return [
      { id: "source", label: "Understanding the source Reel", status: stepStatus(0, 18) },
      { id: "transcribe", label: "Transcribing the Reel", status: stepStatus(18, 50) },
      { id: "profile", label: "Adapting it to your creator profile", status: stepStatus(50, 72) },
      { id: "write", label: "Writing your remake", status: stepStatus(72, 94) },
      { id: "polish", label: "Final quality check", status: stepStatus(94, 100) },
    ];
  }, [progressPercent]);

  const versions = scriptQuery.data?.versions ?? [];

  const appendTurn = useCallback((turn: Omit<AgentTurn, "id">) => {
    setTurns((previous) => [...previous, { ...turn, id: turnIdRef.current++ }]);
  }, []);

  const persist = useCallback(
    async (nextScript: string, nextCaption: string, changeType: "manual_edit" | "ai_rewrite", description: string) => {
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
        lastSavedRef.current = { script: nextScript, caption: nextCaption };
        setSaveState("saved");
        return true;
      } catch {
        return false;
      }
    },
    [isPreview, scriptId, updateMutation]
  );

  useEffect(() => {
    if (!open) {
      hydratedIdRef.current = null;
      return;
    }
    hydratedIdRef.current = null;
    setWorkspaceTab("script");
    setEditorTab("script");
    setCaptionOpen(false);
    setScript("");
    setCaption("");
    setTurns([]);
    setAgentInput("");
    setAgentBusy(false);
    setScheduleMode(false);
    setSelectedText(null);
    setUndoTarget(null);
    setBrollResult(null);
    setScheduledLabel(null);
    setSaveState("saved");
  }, [open, target?.remakeKey]);

  useEffect(() => {
    if (!open || scriptId == null || remakeState?.stage !== "ready") return;
    hydratedIdRef.current = null;
    void utils.scripts.get.invalidate({ id: scriptId });
  }, [open, remakeState?.stage, scriptId, utils.scripts.get]);

  useEffect(() => {
    if (!open) return;
    if (previewSeed && scriptId == null) {
      setScript(previewSeed.script);
      setCaption(previewSeed.caption);
      lastSavedRef.current = { script: previewSeed.script, caption: previewSeed.caption };
      return;
    }
    if (scriptId == null || !scriptQuery.data) return;
    const content = scriptQuery.data.content ?? "";
    if (!content.trim() || hydratedIdRef.current === scriptId) return;
    hydratedIdRef.current = scriptId;
    const generatedCaption = (scriptQuery.data as { generatedCaption?: string | null }).generatedCaption?.trim() || "";
    setScript(content);
    setCaption(generatedCaption);
    lastSavedRef.current = { script: content, caption: generatedCaption };
    setSaveState("saved");

    const existing = scriptQuery.data as { postDate?: string | Date | null; postTime?: string | null; status?: string | null };
    if (existing.postDate) {
      const date = new Date(existing.postDate);
      const time = existing.postTime || "12:00";
      if (!Number.isNaN(date.getTime())) {
        setScheduleDate(toLocalYmd(date));
        setScheduleTime(time);
        setScheduledLabel(formatSchedulePostButtonSubtitle(date, time));
      }
    } else {
      setScheduleDate(toLocalYmd(scheduleSlot.postDate));
      setScheduleTime(scheduleSlot.postTime);
    }
  }, [open, previewSeed, scheduleSlot.postDate, scheduleSlot.postTime, scriptId, scriptQuery.data]);

  useEffect(() => {
    if (!open || isPreview || scriptId == null || hydratedIdRef.current !== scriptId) return;
    const changed = script !== lastSavedRef.current.script || caption !== lastSavedRef.current.caption;
    if (!changed) return;
    setSaveState("unsaved");
    if (autosaveTimerRef.current != null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void persist(script, caption, "manual_edit", "Autosaved Remake edit");
    }, 1600);
    return () => {
      if (autosaveTimerRef.current != null) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [caption, isPreview, open, persist, script, scriptId]);

  const closeWorkspace = useCallback(async () => {
    if (autosaveTimerRef.current != null) window.clearTimeout(autosaveTimerRef.current);
    const changed = script !== lastSavedRef.current.script || caption !== lastSavedRef.current.caption;
    if (changed && scriptId != null && !isPreview) {
      const saved = await persist(script, caption, "manual_edit", "Remake workspace close");
      if (!saved) return;
    }
    onOpenChange(false);
  }, [caption, isPreview, onOpenChange, persist, script, scriptId]);

  const undoLastAiChange = useCallback(async () => {
    if (!undoTarget) return;
    const previous = undoTarget;
    setScript(previous.script);
    setCaption(previous.caption);
    setUndoTarget(null);
    await persist(previous.script, previous.caption, "manual_edit", "Undid AI change");
    appendTurn({
      role: "agent",
      kind: "action",
      text: "Change undone",
      detail: "The previous wording is back on the right.",
    });
  }, [appendTurn, persist, undoTarget]);

  const scheduleAt = useCallback(
    async (date: Date, time: string, label: string) => {
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
        lastSavedRef.current = { script, caption };
        setSaveState("saved");
        setScheduleDate(toLocalYmd(date));
        setScheduleTime(time);
        setScheduledLabel(label);
        setScheduleMode(false);
        setScheduleOpen(false);
        void utils.scripts.list.invalidate();
        appendTurn({
          role: "agent",
          kind: "action",
          text: "Filming reminder set",
          detail: label,
        });
        toast.success(`Scheduled for ${label}`);
      } catch {
        setSaveState("unsaved");
      } finally {
        setAgentBusy(false);
      }
    },
    [appendTurn, caption, isPreview, script, scriptId, updateMutation, utils.scripts.list]
  );

  const scheduleFromComposer = useCallback(
    async (input: string) => {
      const resolution = resolveFilmingSchedule(input);
      if (!resolution.ok) {
        appendTurn({ role: "agent", kind: "text", text: resolution.question });
        setScheduleMode(true);
        window.setTimeout(() => agentComposerRef.current?.focus(), 0);
        return;
      }
      await scheduleAt(resolution.date, resolution.time, resolution.label);
    },
    [appendTurn, scheduleAt]
  );

  const runAgent = useCallback(
    async (raw: string, options?: { ignoreSelection?: boolean; forceTarget?: ClarifyTarget }) => {
      const prompt = raw.trim();
      if (!prompt || agentBusy) return;
      appendTurn({ role: "user", kind: "text", text: prompt });
      setAgentInput("");

      const lower = prompt.toLowerCase();
      if (
        scheduleMode ||
        /\b(schedule|remind)\b/.test(lower) ||
        (/\bfilm\b/.test(lower) && /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|morning|afternoon|evening)\b/.test(lower))
      ) {
        await scheduleFromComposer(prompt);
        return;
      }

      if (scriptId == null) {
        appendTurn({ role: "agent", kind: "text", text: "Your remake is still generating. I can edit it as soon as the script is ready." });
        return;
      }

      const selection = options?.ignoreSelection ? null : selectedText;
      const captionOnly = options?.forceTarget === "caption" || (/\b(caption|hashtag)\b/.test(lower) && !/\b(script|hook|spoken)\b/.test(lower));
      const targetField: ClarifyTarget = options?.forceTarget ?? (captionOnly ? "caption" : "script");

      setAgentBusy(true);
      setSaveState("saving");
      const beforeScript = script;
      const beforeCaption = caption;
      try {
        let nextScript = script;
        let nextCaption = caption;

        if (targetField === "script" || targetField === "both") {
          const instruction = selection
            ? `Change only this exact selected text in the script: "${selection.text}". Instruction: ${prompt}. Keep every other word unchanged.`
            : prompt;
          const useGrammar = /grammar|spelling|typo/.test(lower);
          const rewritten = useGrammar
            ? await grammarMutation.mutateAsync({ scriptId, content: script, persist: false })
            : await aiRewriteMutation.mutateAsync({ scriptId, content: script, instruction, persist: false });
          nextScript = rewritten.content;
          if (!useGrammar && !selection && scriptsNearlyIdentical(script, nextScript)) {
            const stronger = await aiRewriteMutation.mutateAsync({
              scriptId,
              content: script,
              instruction: `${instruction}. Make a meaningful improvement while preserving the creator's main point.`,
              persist: false,
            });
            nextScript = stronger.content;
          }
        }

        if (targetField === "caption" || targetField === "both") {
          if (/hashtag|rewrite the caption|caption|call to action|cta/.test(lower) || !caption.trim()) {
            const generated = await captionMutation.mutateAsync({
              scriptId,
              content: nextScript || script,
              style: "educational",
              captionLength: "medium",
              targetAudience: onboardingQuery.data?.targetAudience ?? undefined,
            });
            nextCaption = generated.caption;
            if (/hashtag/.test(lower) && generated.hashtags?.length) {
              nextCaption = `${generated.caption}\n\n${generated.hashtags
                .map((tag: string) => (tag.startsWith("#") ? tag : `#${tag}`))
                .join(" ")}`;
            }
          } else {
            const rewrittenCaption = await aiRewriteMutation.mutateAsync({
              scriptId,
              content: caption || script,
              instruction: `Rewrite this Reel caption only. ${prompt}. Return only the caption text.`,
              persist: false,
            });
            nextCaption = rewrittenCaption.content;
          }
        }

        setUndoTarget({ script: beforeScript, caption: beforeCaption });
        setScript(nextScript);
        setCaption(nextCaption);
        setSelectedText(null);
        if (targetField === "caption") {
          setCaptionOpen(true);
          setEditorTab("caption");
        } else {
          setEditorTab("script");
        }
        setWorkspaceTab("script");

        const persisted = await persist(nextScript, nextCaption, "ai_rewrite", selection ? `Selected text: ${prompt}` : prompt);
        if (!persisted) return;
        const response = agentDoneMessage(prompt, Boolean(selection));
        appendTurn({
          role: "agent",
          kind: "action",
          text: response.text,
          detail: "Undo is available if you want the previous version back.",
          chips: response.chips,
        });
      } catch (error) {
        setSaveState("saved");
        appendTurn({
          role: "agent",
          kind: "text",
          text: error instanceof Error ? error.message : "I could not make that change. Try a more specific instruction.",
        });
      } finally {
        setAgentBusy(false);
      }
    },
    [
      agentBusy,
      aiRewriteMutation,
      appendTurn,
      caption,
      captionMutation,
      grammarMutation,
      onboardingQuery.data?.targetAudience,
      persist,
      scheduleFromComposer,
      scheduleMode,
      script,
      scriptId,
      selectedText,
    ]
  );

  const matchBroll = useCallback(async () => {
    if (!script.trim()) return;
    if (scriptId == null) {
      toast.message("Wait for the remake script to finish generating");
      return;
    }
    try {
      const result = await suggestBrollMutation.mutateAsync({ scriptId, content: script });
      setBrollResult(result as SuggestBrollResult);
      appendTurn({
        role: "agent",
        kind: "action",
        text: "Stock B-roll matched",
        detail: "I matched real clips to the moments that need them. Review them on the right.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not match B-roll");
    }
  }, [appendTurn, script, scriptId, suggestBrollMutation]);

  const restoreVersion = useCallback(
    async (version: { content: string; versionNumber: number }) => {
      const next = version.content;
      setScript(next);
      setHistoryOpen(false);
      setWorkspaceTab("script");
      setSelectedText(null);
      await persist(next, caption, "manual_edit", `Restored v${version.versionNumber}`);
      appendTurn({
        role: "agent",
        kind: "action",
        text: `Restored version ${version.versionNumber}`,
        detail: "The restored script is live on the right.",
      });
    },
    [appendTurn, caption, persist]
  );

  const openSchedulePicker = useCallback(() => {
    if (!scheduleDate) setScheduleDate(toLocalYmd(scheduleSlot.postDate));
    if (!scheduleTime) setScheduleTime(scheduleSlot.postTime);
    setScheduleOpen(true);
  }, [scheduleDate, scheduleSlot.postDate, scheduleSlot.postTime, scheduleTime]);

  const saveSchedulePicker = useCallback(async () => {
    if (!scheduleDate || !scheduleTime) return;
    const date = new Date(`${scheduleDate}T${scheduleTime}:00`);
    if (Number.isNaN(date.getTime())) {
      toast.error("Choose a valid date and time");
      return;
    }
    await scheduleAt(
      date,
      scheduleTime,
      formatSchedulePostButtonSubtitle(date, scheduleTime)
    );
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
              {(["script", "visuals", "preview"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setWorkspaceTab(tab)}
                  className={`rounded-lg px-4 py-2 text-[13px] font-semibold capitalize transition ${workspaceTab === tab ? "bg-[#302a42] text-white" : "text-[#9b94aa] hover:text-white"}`}
                >
                  {tab === "preview" ? "Preview" : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#342f46] bg-[#211d2d] px-3 py-2 text-xs font-semibold text-[#b7b0c7] hover:text-white"
              >
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
                <div className="mb-4 flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-400"><Sparkles className="h-4 w-4" /></span>
                  <div>
                    <h3 className="text-sm font-bold text-white">SpyReels Agent</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#8f879f]">Tell me what to change. I work directly on the live result on the right.</p>
                  </div>
                </div>

                {turns.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#777083]">Improve</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["Make it 30% shorter while keeping the main point", "Shorter", Scissors],
                        ["Make the hook stronger", "Stronger hook", Wand2],
                        ["Make it easier to say out loud with shorter sentences and natural rhythm", "Easier to say", Mic],
                        ["Make it more casual and natural to say on camera", "More casual", Sparkles],
                      ].map(([prompt, label, Icon]) => (
                        <button
                          key={String(label)}
                          type="button"
                          disabled={agentBusy || isGenerating || !script.trim()}
                          onClick={() => { setSelectedText(null); void runAgent(String(prompt), { ignoreSelection: true }); }}
                          className="flex min-h-[76px] flex-col items-start gap-2 rounded-xl border border-[#302b40] bg-[#211d2b] p-3 text-left text-xs font-semibold text-[#c5bed2] transition hover:border-violet-500/40 hover:bg-[#252031] disabled:opacity-40"
                        >
                          {typeof Icon !== "string" ? <Icon className="h-4 w-4 text-violet-400" /> : null}
                          {String(label)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {turns.map((turn) =>
                      turn.role === "user" ? (
                        <div key={turn.id} className="ml-auto max-w-[88%] rounded-2xl rounded-br-md border border-violet-500/20 bg-violet-500/10 px-3 py-2.5 text-sm text-[#f5f2fa]">{turn.text}</div>
                      ) : turn.kind === "action" ? (
                        <div key={turn.id} className="rounded-xl border border-[#302b40] bg-[#211d2b] px-3 py-3">
                          <p className="text-sm font-medium leading-relaxed text-[#f1edf7]"><span className="mr-2 text-emerald-400">✓</span>{turn.text}</p>
                          {turn.detail ? <p className="mt-1 text-xs leading-relaxed text-[#8f879f]">{turn.detail}</p> : null}
                          {turn.chips?.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {turn.chips.map((chip) => (
                                <button key={chip} type="button" disabled={agentBusy} onClick={() => { setSelectedText(null); void runAgent(promptForChip(chip), { ignoreSelection: true }); }} className="rounded-full border border-[#3b354b] px-2.5 py-1 text-[11px] font-medium text-[#b9b2c5] hover:bg-[#2a2436] hover:text-white">{chip}</button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p key={turn.id} className="text-sm leading-relaxed text-[#b9b2c5]">{turn.text}</p>
                      )
                    )}
                    {agentBusy ? (
                      <div className="flex items-center gap-2 text-sm text-[#928aa3]"><Loader2 className="h-4 w-4 animate-spin text-violet-400" /> Agent is working...</div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="border-t border-[#2d2940] p-3">
                <p className="mb-2 truncate px-1 text-[11px] text-[#777083]">Writing as: <span className="text-[#a9a1b7]">{voiceSummary}</span></p>
                {selectedText ? (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-violet-500/25 bg-violet-500/10 px-2.5 py-2 text-[11px] text-violet-200">
                    <span className="min-w-0 flex-1 truncate">Selected: “{selectedText.text}”</span>
                    <button type="button" onClick={() => setSelectedText(null)} className="text-violet-300 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : null}
                <div className="rounded-xl border border-[#363048] bg-[#211d2b] p-2">
                  <textarea
                    ref={agentComposerRef}
                    value={agentInput}
                    disabled={agentBusy}
                    onChange={(event) => setAgentInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      void runAgent(agentInput);
                    }}
                    placeholder={scheduleMode ? "Tell Agent when you want to film it..." : selectedText ? "What should I change in this selection?" : "Ask SpyReels to change anything..."}
                    className="min-h-[62px] w-full resize-none bg-transparent px-1 py-1 text-sm text-white outline-none placeholder:text-[#6f687d]"
                  />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {undoTarget ? (
                      <button type="button" disabled={agentBusy} onClick={() => void undoLastAiChange()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#a9a1b7] hover:bg-[#2a2534] hover:text-white"><RotateCcw className="h-3.5 w-3.5" /> Undo</button>
                    ) : <span />}
                    <button type="button" disabled={agentBusy || !agentInput.trim()} onClick={() => void runAgent(agentInput)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40">Send <Send className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            </aside>

            <main className="min-h-0 min-w-0 bg-[#1c1926]">
              {workspaceTab === "script" ? (
                isGenerating && !script.trim() ? (
                  <div className="h-full overflow-y-auto">
                    <AgentProgressPanel
                      steps={generationSteps}
                      headline="Creating your remake"
                      subheadline="SpyReels is working through the source, your profile, and the final script."
                    />
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
                        >
                          <Play className="h-3.5 w-3.5" /> Open teleprompter
                        </button>
                      </div>

                      <div className="relative">
                        {selectedText ? (
                          <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-violet-500/25 bg-[#211d2b]/95 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur">
                            <span className="max-w-[210px] truncate text-[#bcb5c9]">“{selectedText.text}”</span>
                            <button type="button" onClick={() => { window.setTimeout(() => agentComposerRef.current?.focus(), 0); }} className="font-semibold text-violet-300 hover:text-white">Ask Agent</button>
                            <button type="button" onClick={() => setSelectedText(null)} className="text-[#847d91] hover:text-white"><X className="h-3 w-3" /></button>
                          </div>
                        ) : null}
                        <textarea
                          ref={scriptEditorRef}
                          value={script}
                          disabled={isGenerating && !script}
                          onFocus={() => setEditorTab("script")}
                          onSelect={(event) => {
                            const element = event.currentTarget;
                            const start = element.selectionStart;
                            const end = element.selectionEnd;
                            if (start === end) return;
                            const text = element.value.slice(start, end).trim();
                            if (text.length >= 2) setSelectedText({ start, end, text });
                          }}
                          onChange={(event) => {
                            setScript(event.target.value);
                            setEditorTab("script");
                            setSelectedText(null);
                          }}
                          placeholder="Your remake script will appear here..."
                          className="min-h-[390px] w-full resize-y rounded-2xl border border-[#332e45] bg-[#17141f] px-5 py-5 text-[15px] leading-7 text-[#f3eff8] outline-none transition focus:border-violet-500/45"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={agentBusy || !script.trim()} onClick={() => { setSelectedText(null); void runAgent("Improve this Reel script in my voice", { ignoreSelection: true }); }} className="rounded-lg bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/15">Improve script</button>
                        <button type="button" disabled={agentBusy || !script.trim()} onClick={() => { setSelectedText(null); void runAgent("Fix the grammar", { ignoreSelection: true }); }} className="rounded-lg border border-[#332e45] px-3 py-2 text-xs font-semibold text-[#aaa3b8] hover:text-white">Fix grammar</button>
                        <button type="button" disabled={agentBusy || !script.trim()} onClick={() => { setSelectedText(null); void runAgent("Make it 30% shorter while keeping the main point", { ignoreSelection: true }); }} className="rounded-lg border border-[#332e45] px-3 py-2 text-xs font-semibold text-[#aaa3b8] hover:text-white">Make shorter</button>
                      </div>

                      <div className="mt-5 overflow-hidden rounded-xl border border-[#332e45] bg-[#191620]">
                        <button type="button" onClick={() => setCaptionOpen((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                          <div><strong className="text-sm text-white">Caption</strong><p className="mt-0.5 text-[11px] text-[#7f788d]">Secondary publishing text</p></div>
                          {captionOpen ? <ChevronUp className="h-4 w-4 text-[#8d8599]" /> : <ChevronDown className="h-4 w-4 text-[#8d8599]" />}
                        </button>
                        {captionOpen ? (
                          <div className="border-t border-[#302b40] p-3">
                            <textarea value={caption} onFocus={() => setEditorTab("caption")} onChange={(event) => { setCaption(event.target.value); setEditorTab("caption"); }} placeholder="Write a caption, or ask Agent to create one..." className="min-h-[120px] w-full resize-y rounded-xl border border-[#332e45] bg-[#15121c] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-violet-500/45" />
                            <div className="mt-2 flex gap-2"><button type="button" onClick={() => void runAgent("Rewrite the caption", { forceTarget: "caption", ignoreSelection: true })} className="rounded-lg bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-300">Rewrite</button><button type="button" onClick={() => void runAgent("Add 3 hashtags to the caption", { forceTarget: "caption", ignoreSelection: true })} className="rounded-lg border border-[#332e45] px-3 py-1.5 text-[11px] font-semibold text-[#9f98ac]">Add hashtags</button></div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              ) : null}

              {workspaceTab === "visuals" ? (
                <div className="h-full overflow-y-auto px-7 py-6">
                  <div className="mx-auto max-w-[820px]">
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div><h3 className="text-base font-bold text-white">Recommended B-roll</h3><p className="mt-1 max-w-lg text-xs leading-relaxed text-[#8f879f]">Use real stock clips matched to the moments in your script. AI-generated visuals will only appear here once the Remake image-generation endpoint is connected, so we do not show a fake control.</p></div>
                      <button type="button" disabled={!script.trim() || suggestBrollMutation.isPending} onClick={() => void matchBroll()} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40">{suggestBrollMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{suggestBrollMutation.isPending ? "Matching..." : brollResult ? "Match again" : "Find stock clips"}</button>
                    </div>

                    {!brollResult ? (
                      <div className="rounded-2xl border border-[#332e45] bg-[#191620] px-6 py-10 text-center">
                        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><Sparkles className="h-5 w-5" /></div>
                        <h4 className="mt-4 text-sm font-bold text-white">Match visuals to your script</h4>
                        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#8f879f]">SpyReels will find real stock clips for the moments that benefit from B-roll. You can keep the rest as talking head.</p>
                        <button type="button" disabled={!script.trim() || suggestBrollMutation.isPending} onClick={() => void matchBroll()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"><Wand2 className="h-4 w-4" /> Find stock clips</button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[#332e45] bg-[#17141f] p-3"><BrollBeatsView result={brollResult} /></div>
                    )}
                  </div>
                </div>
              ) : null}

              {workspaceTab === "preview" ? (
                <div className="h-full overflow-y-auto px-7 py-6">
                  <div className="mx-auto max-w-[760px]">
                    <div className="mb-5"><h3 className="text-base font-bold text-white">Opening frame preview</h3><p className="mt-1 text-xs text-[#8f879f]">A simple check of what viewers may see on frame 0 before you film.</p></div>
                    <div className="flex justify-center">
                      <div className="relative aspect-[9/16] w-[300px] overflow-hidden rounded-[28px] border border-[#3a3450] bg-gradient-to-br from-violet-700 via-[#3b2858] to-[#121018] shadow-2xl">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
                        <div className="absolute left-5 top-5 text-xs font-semibold text-white/90">@you</div>
                        <div className="absolute inset-x-5 bottom-20 rounded-xl bg-black/20 p-3 text-[20px] font-bold leading-tight text-white backdrop-blur-sm">{firstHookLine(script)}</div>
                        <div className="absolute inset-x-5 bottom-8 h-1 overflow-hidden rounded-full bg-white/25"><span className="block h-full w-[24%] rounded-full bg-white" /></div>
                      </div>
                    </div>
                    {caption.trim() ? <div className="mx-auto mt-5 max-w-[520px] rounded-xl border border-[#332e45] bg-[#191620] p-4 text-xs leading-relaxed text-[#aaa3b8]">{caption}</div> : null}
                  </div>
                </div>
              ) : null}
            </main>
          </div>

          <footer className="flex items-center justify-between border-t border-[#2d2940] bg-[#1b1824] px-5 py-3">
            <div className="inline-flex items-center gap-2 text-xs text-[#8e879b]">
              {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" /> : <Check className="h-3.5 w-3.5 text-emerald-400" />}
              {saveState === "saving" ? "Saving..." : saveState === "unsaved" ? "Saving automatically..." : "Saved"}
            </div>
            <button type="button" disabled={isGenerating || !script.trim() || updateMutation.isPending} onClick={openSchedulePicker} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-40"><CalendarDays className="h-4 w-4" />{scheduledLabel ? `Scheduled · ${scheduledLabel}` : "Schedule"}</button>
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md border-[#2a2640] bg-[#1a1724] text-[#f3f0fa]">
          <DialogHeader><DialogTitle>History</DialogTitle><DialogDescription className="text-[#a39db8]">Every important version of this Remake script.</DialogDescription></DialogHeader>
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
          <DialogHeader><DialogTitle>Schedule filming</DialogTitle><DialogDescription className="text-[#a39db8]">Pick when you want this Reel on your content calendar. You can also tell Agent, “Schedule this Friday at 3 PM.”</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block text-xs font-semibold text-[#a9a1b7]">Date<input type="date" value={scheduleDate} min={toLocalYmd(new Date())} onChange={(event) => setScheduleDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#393349] bg-[#15121c] px-3 text-sm text-white outline-none focus:border-violet-500/50" /></label>
            <label className="block text-xs font-semibold text-[#a9a1b7]">Time<input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#393349] bg-[#15121c] px-3 text-sm text-white outline-none focus:border-violet-500/50" /></label>
            <button type="button" disabled={!scheduleDate || !scheduleTime || updateMutation.isPending} onClick={() => void saveSchedulePicker()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-40">{updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />} Schedule</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
