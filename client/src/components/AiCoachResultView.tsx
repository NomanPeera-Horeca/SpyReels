import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  flattenCoachScriptForCopy,
  parseProductionNotes,
  type CoachHookVariation,
  type CoachScriptSections,
} from "@shared/coachScriptSections";
import { hookOptionsArrivalPlan, hookOptionsSheetShowsLoader } from "@shared/coachHookOptionsUi";
import { formatCoachHookTypeLabel } from "@shared/hookTypes";
import { VIRAL_SCRIPT_SECTION_LABELS } from "@shared/studioCoachUi";
import type { CoachScriptSchedulePanelProps } from "@/components/CoachScriptSchedulePanel";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { AiCoachScriptHealthPanel } from "@/components/AiCoachScriptHealthPanel";
import {
  deriveSectionScores,
  findWeakestSection,
  mapCoachJudgeToHealth,
} from "@shared/coachScriptHealth";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CoachScriptFeedback } from "@/components/CoachScriptFeedback";
import { buildCarouselGenerateHref } from "@/components/carousel-studio/carouselsHub";

export type CoachResultScript = {
  id: number;
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  explain: string;
  illustrate: string;
  teach: string;
  cta: string;
  platform: string;
  estimatedDuration: string | null;
  contentFormat: string | null;
  formatLabel: string | null;
  productionNotes: string | null;
  productionNotesStatus?: "pending" | "processing" | "completed" | "failed" | null;
};

export type AiCoachEditDraft = CoachScriptSections & {
  hook: string;
  hookVisualBeat: string;
  hookOnScreenText: string;
};

type AiCoachResultViewProps = {
  result: CoachResultScript;
  editMode: boolean;
  editDraft: AiCoachEditDraft;
  onEditDraftChange: (draft: AiCoachEditDraft) => void;
  refineInput: string;
  onRefineInputChange: (value: string) => void;
  onRefine: () => void;
  onReset: () => void;
  onToggleEdit: () => void;
  onSaveEdits: () => void;
  onCancelEdit: () => void;
  hookVariations: CoachHookVariation[] | null;
  onRequestHookVariations: () => void;
  hookVariationsPending: boolean;
  onApplyHookVariation: (variation: CoachHookVariation) => void;
  refinePending: boolean;
  savePending?: boolean;
  scheduleSave?: Omit<CoachScriptSchedulePanelProps, "className">;
  onSaveToMyScripts?: () => void;
  saveToMyScriptsPending?: boolean;
  savedScriptId?: number | null;
  onOpenMyScripts?: () => void;
  onFilmNow?: () => void;
  filmNowPending?: boolean;
  previewMode?: boolean;
  onFixWeakest?: () => void;
  onRefineWithInstruction?: (instruction: string) => void;
};

type SectionKey = "hook" | "explain" | "illustrate" | "teach" | "cta";

type SelectedText = {
  section: SectionKey;
  text: string;
  start: number;
  end: number;
  left: number;
  top: number;
};

type InlineProposal = {
  section: SectionKey;
  beforeSection: string;
  afterSection: string;
  previousDraft: AiCoachEditDraft;
};

type AgentTurn = {
  id: number;
  role: "user" | "agent";
  kind: "text" | "action";
  text: string;
  detail?: string;
};

type ScheduleResolution =
  | { ok: true; date: Date; time: string; label: string }
  | { ok: false; question: string };

function platformLabel(platform: string): string {
  if (platform === "both") return "Instagram Reels + TikTok";
  if (platform === "instagram") return "Instagram Reels";
  if (platform === "tiktok") return "TikTok";
  if (platform === "youtube" || platform === "youtube_shorts") return "YouTube Shorts";
  return platform || "Short-form video";
}

function hookOptionReason(type: string): string {
  switch (type) {
    case "story": return "Credibility + curiosity";
    case "contrarian": return "Pattern interruption";
    case "specific_outcome": return "Clear promise";
    case "pain_point": return "Pain + tension";
    case "curiosity_gap": return "Open loop";
    case "question": return "Viewer engagement";
    case "shock_data": return "Proof + surprise";
    case "pov": return "Immersion";
    case "show_end_first": return "Result first";
    default: return "Strong angle";
  }
}

function textOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function diffText(before: string, after: string) {
  let prefixLength = 0;
  while (
    prefixLength < before.length &&
    prefixLength < after.length &&
    before[prefixLength] === after[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength &&
    suffixLength < after.length - prefixLength &&
    before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    prefix: before.slice(0, prefixLength),
    oldText: before.slice(prefixLength, before.length - suffixLength),
    newText: after.slice(prefixLength, after.length - suffixLength),
    suffix: before.slice(before.length - suffixLength),
  };
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

function safeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "reel-script";
}

export function AiCoachResultView({
  result,
  editMode,
  editDraft,
  onEditDraftChange,
  refineInput,
  onRefineInputChange,
  onRefine,
  onReset,
  onToggleEdit,
  onSaveEdits,
  onCancelEdit,
  hookVariations,
  onRequestHookVariations,
  hookVariationsPending,
  onApplyHookVariation,
  refinePending,
  savePending,
  scheduleSave,
  onSaveToMyScripts,
  saveToMyScriptsPending,
  savedScriptId,
  onOpenMyScripts,
  onFilmNow,
  filmNowPending,
  previewMode = false,
  onFixWeakest,
  onRefineWithInstruction,
}: AiCoachResultViewProps) {
  const [, setLocation] = useLocation();
  const artifactRef = useRef<HTMLDivElement>(null);
  const selectionEditorRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scheduleSaveRef = useRef(scheduleSave);
  scheduleSaveRef.current = scheduleSave;
  const turnIdRef = useRef(1);
  const pendingInlineRef = useRef<{
    selection: SelectedText;
    beforeSection: string;
    previousDraft: AiCoachEditDraft;
    sawPending: boolean;
  } | null>(null);
  const pendingAgentRefineRef = useRef<{ label: string; signature: string; sawPending: boolean } | null>(null);
  const pendingSaveRef = useRef(false);
  const sawSavePendingRef = useRef(false);
  const pendingScheduleRef = useRef<string | null>(null);
  const sawSchedulePendingRef = useRef(false);

  const [filmHelpOpen, setFilmHelpOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [hookOptionsOpen, setHookOptionsOpen] = useState(false);
  const [selectedHookOptionIndex, setSelectedHookOptionIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
  const [selectionCopied, setSelectionCopied] = useState(false);
  const [selectionEditing, setSelectionEditing] = useState(false);
  const [selectionInstruction, setSelectionInstruction] = useState("");
  const [inlineProposal, setInlineProposal] = useState<InlineProposal | null>(null);
  const [undoDraft, setUndoDraft] = useState<AiCoachEditDraft | null>(null);
  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [turns, setTurns] = useState<AgentTurn[]>([]);

  const production = parseProductionNotes(result.productionNotes);
  const health = mapCoachJudgeToHealth(production?.coachJudge);
  const sectionScores = health ? deriveSectionScores(health) : null;
  const weakest = sectionScores ? findWeakestSection(sectionScores) : null;
  const isGeneratingProduction = result.productionNotesStatus === "processing" || result.productionNotesStatus === "pending";
  const hookOnScreenText = editMode
    ? editDraft.hookOnScreenText
    : production?.hookOnScreenText?.trim() || production?.textOverlay?.trim() || "";
  const hookVisualBeat = editMode ? editDraft.hookVisualBeat : production?.hookVisualBeat?.trim() || "";
  const bRollShots = (production?.bRoll ?? []).filter((shot) => shot?.shot?.trim());
  const signature = [result.hook, result.explain, result.illustrate, result.teach, result.cta].join("\n");

  const currentDraft = useMemo<AiCoachEditDraft>(() => ({
    hook: result.hook,
    explain: result.explain,
    illustrate: result.illustrate,
    teach: result.teach,
    cta: result.cta,
    hookVisualBeat,
    hookOnScreenText,
  }), [result.hook, result.explain, result.illustrate, result.teach, result.cta, hookVisualBeat, hookOnScreenText]);

  const sectionValue = (section: SectionKey): string => {
    if (section === "hook") return result.hook;
    return result[section];
  };

  const appendTurn = (role: "user" | "agent", text: string) => {
    setTurns((prev) => [...prev, { id: turnIdRef.current++, role, kind: "text", text }]);
  };

  const appendAction = (text: string, detail?: string) => {
    setTurns((prev) => [...prev, { id: turnIdRef.current++, role: "agent", kind: "action", text, detail }]);
  };

  useEffect(() => {
    const plan = hookOptionsArrivalPlan(hookVariations);
    setSelectedHookOptionIndex(plan.selectedIndex);
  }, [hookVariations]);

  useEffect(() => {
    if (hookVariationsPending) setHookOptionsOpen(true);
  }, [hookVariationsPending]);

  useEffect(() => {
    const pending = pendingInlineRef.current;
    if (!pending) return;
    if (refinePending) {
      pending.sawPending = true;
      return;
    }
    if (!pending.sawPending) return;

    const afterSection = sectionValue(pending.selection.section);
    pendingInlineRef.current = null;
    setAgentBusy(false);
    setSelectionEditing(false);
    setSelectedText(null);
    setSelectionInstruction("");

    if (afterSection !== pending.beforeSection) {
      setInlineProposal({
        section: pending.selection.section,
        beforeSection: pending.beforeSection,
        afterSection,
        previousDraft: pending.previousDraft,
      });
    }
  }, [refinePending, signature]);

  useEffect(() => {
    const pending = pendingAgentRefineRef.current;
    if (!pending) return;
    if (refinePending) {
      pending.sawPending = true;
      return;
    }
    if (!pending.sawPending) return;
    pendingAgentRefineRef.current = null;
    setAgentBusy(false);
    if (signature !== pending.signature) appendAction(pending.label, "The current Reel has been updated.");
  }, [refinePending, signature]);

  useEffect(() => {
    if (!pendingSaveRef.current) return;
    if (saveToMyScriptsPending) {
      sawSavePendingRef.current = true;
      return;
    }
    if (!sawSavePendingRef.current) return;
    pendingSaveRef.current = false;
    sawSavePendingRef.current = false;
    setAgentBusy(false);
    if (savedScriptId != null) appendAction("Saved to My Scripts", "This Reel is now in your script library.");
  }, [saveToMyScriptsPending, savedScriptId]);

  useEffect(() => {
    if (!pendingScheduleRef.current || !scheduleSave) return;
    if (scheduleSave.isSaving) {
      sawSchedulePendingRef.current = true;
      return;
    }
    if (!sawSchedulePendingRef.current) return;
    const label = pendingScheduleRef.current;
    pendingScheduleRef.current = null;
    sawSchedulePendingRef.current = false;
    setAgentBusy(false);
    appendAction("Filming reminder set", label);
  }, [scheduleSave?.isSaving, savedScriptId]);

  useEffect(() => {
    if (!undoDraft) return;
    const matches =
      editDraft.hook === undoDraft.hook &&
      editDraft.explain === undoDraft.explain &&
      editDraft.illustrate === undoDraft.illustrate &&
      editDraft.teach === undoDraft.teach &&
      editDraft.cta === undoDraft.cta &&
      editDraft.hookVisualBeat === undoDraft.hookVisualBeat &&
      editDraft.hookOnScreenText === undoDraft.hookOnScreenText;
    if (!matches) return;
    setUndoDraft(null);
    setInlineProposal(null);
    onSaveEdits();
  }, [editDraft, undoDraft, onSaveEdits]);

  useEffect(() => {
    if (!selectionEditing) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node | null;
      if (node && selectionEditorRef.current?.contains(node)) return;
      setSelectionEditing(false);
      setSelectionInstruction("");
      setSelectedText(null);
      window.getSelection()?.removeAllRanges();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectionEditing(false);
      setSelectionInstruction("");
      setSelectedText(null);
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selectionEditing]);

  const copyScript = async () => {
    const text = flattenCoachScriptForCopy({
      title: result.title,
      hook: result.hook,
      sections: { explain: result.explain, illustrate: result.illustrate, teach: result.teach, cta: result.cta },
      userFriendly: true,
      hookVisualBeat,
      hookOnScreenText,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Could not copy script");
    }
  };

  const downloadBrandedScript = async () => {
    if (downloadPending) return;
    setDownloadPending(true);
    try {
      const docx = await import("docx");
      const { saveAs } = await import("file-saver");
      const body = [result.explain, result.illustrate, result.teach, result.cta].filter((part) => part.trim());
      const filmChildren = [
        hookVisualBeat ? new docx.Paragraph({ children: [new docx.TextRun({ text: "Opening visual: ", bold: true }), new docx.TextRun(hookVisualBeat)] }) : null,
        hookOnScreenText ? new docx.Paragraph({ children: [new docx.TextRun({ text: "On-screen text: ", bold: true }), new docx.TextRun(hookOnScreenText)] }) : null,
        bRollShots.length > 0 ? new docx.Paragraph({ children: [new docx.TextRun({ text: "B-roll: ", bold: true }), new docx.TextRun(bRollShots.map((shot) => shot.shot?.trim()).filter(Boolean).join("; "))] }) : null,
        production?.voiceTone ? new docx.Paragraph({ children: [new docx.TextRun({ text: "Delivery: ", bold: true }), new docx.TextRun(production.voiceTone)] }) : null,
      ].filter((item): item is InstanceType<typeof docx.Paragraph> => item != null);

      const document = new docx.Document({
        sections: [{
          headers: {
            default: new docx.Header({
              children: [new docx.Paragraph({
                children: [
                  new docx.TextRun({ text: "SpyReels", bold: true, size: 24 }),
                  new docx.TextRun({ text: `   ${platformLabel(result.platform)}`, color: "777777", size: 18 }),
                ],
              })],
            }),
          },
          footers: {
            default: new docx.Footer({
              children: [new docx.Paragraph({
                alignment: docx.AlignmentType.CENTER,
                children: [new docx.TextRun({ text: "Created with SpyReels", color: "888888", size: 18 })],
              })],
            }),
          },
          children: [
            new docx.Paragraph({ text: "Your Reel script", heading: docx.HeadingLevel.HEADING_1, spacing: { after: 280 } }),
            new docx.Paragraph({ children: [new docx.TextRun({ text: "HOOK · 0-4 SEC", bold: true, color: "777777", size: 18 })] }),
            new docx.Paragraph({ children: [new docx.TextRun({ text: result.hook, bold: true, size: 28 })], spacing: { after: 320 } }),
            new docx.Paragraph({ children: [new docx.TextRun({ text: "WHAT TO SAY", bold: true, color: "777777", size: 18 })] }),
            ...body.map((paragraph) => new docx.Paragraph({ text: paragraph, spacing: { after: 220 }, style: "Normal" })),
            ...(filmChildren.length > 0 ? [
              new docx.Paragraph({ text: "How to film", heading: docx.HeadingLevel.HEADING_2, spacing: { before: 300, after: 160 } }),
              ...filmChildren,
            ] : []),
          ],
        }],
      });
      const blob = await docx.Packer.toBlob(document);
      saveAs(blob, `${safeFileName(result.title)}-spyreels.docx`);
      appendAction("Downloaded branded script", "SpyReels header, clean script layout, filming notes, and a subtle footer.");
    } catch (error) {
      console.error(error);
      toast.error("Could not download script");
    } finally {
      setDownloadPending(false);
    }
  };

  const handleTextSelection = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (editMode || inlineProposal || refinePending) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      if (!selectionEditing) setSelectedText(null);
      return;
    }
    const anchorElement = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
    const focusElement = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
    const anchorRoot = anchorElement?.closest<HTMLElement>("[data-agent-section]");
    const focusRoot = focusElement?.closest<HTMLElement>("[data-agent-section]");
    if (!anchorRoot || !focusRoot || anchorRoot !== focusRoot) return;

    const section = anchorRoot.dataset.agentSection as SectionKey | undefined;
    if (!section) return;
    const range = selection.getRangeAt(0);
    const text = selection.toString();
    if (!text.trim()) return;
    const start = textOffset(anchorRoot, range.startContainer, range.startOffset);
    const end = textOffset(anchorRoot, range.endContainer, range.endOffset);
    const rootRect = artifactRef.current?.getBoundingClientRect();
    const rangeRect = range.getBoundingClientRect();
    if (!rootRect) return;

    setSelectedText({
      section,
      text,
      start: Math.min(start, end),
      end: Math.max(start, end),
      left: Math.max(14, Math.min(rootRect.width - 190, rangeRect.left - rootRect.left)),
      top: Math.max(62, rangeRect.top - rootRect.top - 48),
    });
    setSelectionEditing(false);
    setSelectionCopied(false);
    event.stopPropagation();
  };

  const copySelectedText = async () => {
    if (!selectedText) return;
    try {
      await navigator.clipboard.writeText(selectedText.text);
      setSelectionCopied(true);
      window.setTimeout(() => {
        setSelectionCopied(false);
        setSelectedText(null);
        window.getSelection()?.removeAllRanges();
      }, 900);
    } catch {
      toast.error("Could not copy selected text");
    }
  };

  const startInlineChange = () => {
    if (!selectedText) return;
    setSelectionEditing(true);
    setSelectionInstruction("");
    window.getSelection()?.removeAllRanges();
    window.setTimeout(() => selectionEditorRef.current?.querySelector("input")?.focus(), 0);
  };

  const submitInlineChange = () => {
    if (!selectedText || !selectionInstruction.trim() || !onRefineWithInstruction || refinePending) return;
    const beforeSection = sectionValue(selectedText.section);
    pendingInlineRef.current = {
      selection: selectedText,
      beforeSection,
      previousDraft: currentDraft,
      sawPending: false,
    };
    setAgentBusy(true);
    const sectionLabel = selectedText.section === "hook" ? "hook" : "spoken script";
    onRefineWithInstruction(
      `Change only this exact selected text in the ${sectionLabel}: "${selectedText.text}". Instruction: ${selectionInstruction.trim()}. Keep every other word in every other section unchanged.`
    );
  };

  const acceptInlineProposal = () => {
    setInlineProposal(null);
    appendAction("Selected text updated", "Only the requested wording changed.");
  };

  const undoInlineProposal = () => {
    if (!inlineProposal) return;
    setUndoDraft(inlineProposal.previousDraft);
    onEditDraftChange(inlineProposal.previousDraft);
    appendAction("Change undone", "The previous wording was restored.");
  };

  const runRefine = (instruction: string, label: string) => {
    if (!onRefineWithInstruction || refinePending) return;
    pendingAgentRefineRef.current = { label, signature, sawPending: false };
    setAgentBusy(true);
    onRefineWithInstruction(instruction);
  };

  const saveScript = () => {
    if (savedScriptId != null) {
      appendAction("Already saved", "This Reel is already in My Scripts.");
      return;
    }
    if (!onSaveToMyScripts || saveToMyScriptsPending) return;
    pendingSaveRef.current = true;
    sawSavePendingRef.current = false;
    setAgentBusy(true);
    onSaveToMyScripts();
  };

  const scheduleFilming = (input: string) => {
    if (!scheduleSave) {
      appendTurn("agent", "Filming reminders are not available for this Reel yet.");
      return;
    }
    const resolution = resolveFilmingSchedule(input);
    if (!resolution.ok) {
      appendTurn("agent", resolution.question);
      setScheduleMode(true);
      window.setTimeout(() => composerRef.current?.focus(), 0);
      return;
    }
    scheduleSave.onPostDateChange(resolution.date);
    scheduleSave.onPostTimeChange(resolution.time);
    pendingScheduleRef.current = resolution.label;
    sawSchedulePendingRef.current = false;
    setAgentBusy(true);
    setScheduleMode(false);
    window.setTimeout(() => {
      scheduleSaveRef.current?.onSave(true, { caption: "", hashtags: [] });
    }, 0);
  };

  const turnIntoCarousel = () => {
    const text = flattenCoachScriptForCopy({
      title: result.title,
      hook: result.hook,
      sections: { explain: result.explain, illustrate: result.illustrate, teach: result.teach, cta: result.cta },
      userFriendly: true,
      hookVisualBeat,
      hookOnScreenText,
    });
    setLocation(buildCarouselGenerateHref(text));
  };

  const routeAgentInput = (raw: string) => {
    const input = raw.trim();
    if (!input || agentBusy) return;
    appendTurn("user", input);
    setAgentInput("");

    if (scheduleMode) {
      scheduleFilming(input);
      return;
    }

    const lower = input.toLowerCase();
    if (/\bsave\b/.test(lower)) {
      saveScript();
      return;
    }
    if (/\b(download|export)\b/.test(lower)) {
      void downloadBrandedScript();
      return;
    }
    if (/\b(schedule|remind)\b/.test(lower) || /\bfilm\b/.test(lower) && /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|morning|afternoon|evening)\b/.test(lower)) {
      scheduleFilming(input);
      return;
    }
    if (/\bcarousel\b/.test(lower)) {
      appendAction("Opening Carousel Studio", "Your current Reel is being carried over as the source.");
      window.setTimeout(turnIntoCarousel, 250);
      return;
    }
    if (/\bhook options?\b/.test(lower)) {
      setHookOptionsOpen(true);
      if (!hookVariations?.length && !hookVariationsPending) onRequestHookVariations();
      return;
    }
    if (/\bscript health\b/.test(lower)) {
      setHealthOpen(true);
      return;
    }
    if (/\bshort(er|en)?\b/.test(lower)) {
      runRefine("Shorten the full script while keeping the same idea, strongest proof, and ending. Cut filler only.", "Reel shortened");
      return;
    }
    if (/\b(fun(ny|nier)|humor)\b/.test(lower)) {
      runRefine("Make the script funnier without changing the core point, facts, or useful takeaway.", "Tone updated");
      return;
    }
    if (/\b(viral|stronger hook|strong hook)\b/.test(lower)) {
      runRefine("Make this more viral with a stronger hook, tighter pacing, and clearer payoff. Keep the same idea and facts.", "Reel strengthened");
      return;
    }
    if (/\bsimpl(if|ify|er)\b/.test(lower)) {
      runRefine("Simplify the language. Use shorter sentences and easier words without removing the useful detail.", "Reel simplified");
      return;
    }
    if (/\bchange niche\b/.test(lower) || /\badapt (this )?(for|to)\b/.test(lower)) {
      runRefine(input, "Niche adapted");
      return;
    }
    if (onRefineWithInstruction) {
      runRefine(input, "Reel updated");
      return;
    }
    onRefineInputChange(input);
    window.setTimeout(onRefine, 0);
  };

  const openHookOptions = () => {
    setHookOptionsOpen(true);
    if (!hookVariations?.length && !hookVariationsPending) onRequestHookVariations();
  };

  const renderSectionText = (section: SectionKey, value: string, className: string) => {
    const proposal = inlineProposal?.section === section ? inlineProposal : null;
    if (proposal) {
      const diff = diffText(proposal.beforeSection, proposal.afterSection);
      return (
        <div className={className} data-agent-section={section}>
          <div className="mb-3 flex justify-end gap-1.5">
            <button type="button" onClick={undoInlineProposal} className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Undo</button>
            <button type="button" onClick={acceptInlineProposal} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">Accept</button>
          </div>
          <span>{diff.prefix}</span>
          {diff.oldText ? <span className="text-muted-foreground line-through decoration-red-400/70">{diff.oldText}</span> : null}
          {diff.oldText && diff.newText ? <span> </span> : null}
          {diff.newText ? <span className="text-violet-400">{diff.newText}</span> : null}
          <span>{diff.suffix}</span>
        </div>
      );
    }

    if (selectionEditing && selectedText?.section === section) {
      return (
        <div className={className} data-agent-section={section}>
          <span>{value.slice(0, selectedText.start)}</span>
          <span className="rounded-sm bg-blue-500/25 ring-1 ring-blue-400/20">{value.slice(selectedText.start, selectedText.end)}</span>
          <span>{value.slice(selectedText.end)}</span>
        </div>
      );
    }

    return <div className={className} data-agent-section={section}>{value}</div>;
  };

  const workItems = [
    production?.sourceDescription ? "Kept the original idea as the source of truth" : null,
    "Compared creative directions before writing",
    production?.coachJudge ? "Checked the finished script for quality and fit" : null,
    hookVisualBeat || hookOnScreenText || bRollShots.length > 0 || production?.voiceTone ? "Prepared filming direction" : null,
  ].filter(Boolean) as string[];

  return (
    <div className={cn("min-h-full bg-[#fafafa] dark:bg-[#09090c] -mx-2 sm:-mx-4", expanded && "fixed inset-0 z-50 m-0 overflow-y-auto bg-background") }>
      <div className="mx-auto w-full max-w-[860px] px-4 pb-36 pt-8 sm:px-6">
        <div className="mb-6">
          <button type="button" onClick={() => setWorkOpen((open) => !open)} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <span className="font-medium">Agent work</span>
            <span>·</span>
            <span>Compared directions</span>
            {production?.coachJudge ? <><span>·</span><span>Quality checked</span></> : null}
            {hookVisualBeat || hookOnScreenText || bRollShots.length > 0 ? <><span>·</span><span>Ready to film</span></> : null}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", workOpen && "rotate-180")} />
          </button>
          {workOpen ? (
            <div className="mt-4 space-y-3 border-l border-border pl-4 text-sm text-muted-foreground">
              {workItems.map((item) => <p key={item}>{item}</p>)}
            </div>
          ) : null}
        </div>

        <div
          ref={artifactRef}
          onMouseUp={handleTextSelection}
          className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_18px_70px_rgba(0,0,0,0.12)]"
        >
          {!previewMode ? (
            <div className="flex min-h-14 items-center gap-2 border-b border-border/70 px-3 sm:px-4">
              {editMode ? (
                <>
                  <button type="button" onClick={onSaveEdits} disabled={savePending} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                    {savePending ? "Saving..." : "Save edits"}
                  </button>
                  <button type="button" onClick={onCancelEdit} className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                </>
              ) : (
                <button type="button" onClick={onToggleEdit} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}

              <span className="text-xs text-muted-foreground">
                {savedScriptId ? "Saved" : scheduleSave?.isSaving ? "Saving reminder..." : "Ready to film"}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => void copyScript()} title="Copy script" aria-label="Copy script" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => void downloadBrandedScript()} disabled={downloadPending} title="Download branded script" aria-label="Download branded script" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                  {downloadPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "Exit expanded view" : "Expand script"} aria-label={expanded ? "Exit expanded view" : "Expand script"} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="More actions" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={saveScript}>Save to My Scripts</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => scheduleFilming("")}>Schedule filming</DropdownMenuItem>
                    <DropdownMenuItem onSelect={turnIntoCarousel}>Turn into carousel</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={openHookOptions}>Hook options</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setHealthOpen(true)}>Script health</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onReset}>New script</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ) : null}

          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <h1 className="text-[1.8rem] font-semibold tracking-tight text-foreground sm:text-[2rem]">Your Reel script</h1>
            <p className="mt-2 text-xs text-muted-foreground">{[platformLabel(result.platform), result.estimatedDuration].filter(Boolean).join(" · ")}</p>

            <div className="mt-9">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hook · 0-4 sec</p>
              {editMode ? (
                <Textarea value={editDraft.hook} onChange={(e) => onEditDraftChange({ ...editDraft, hook: e.target.value })} className="mt-3 min-h-[76px] resize-none text-lg font-semibold" />
              ) : (
                renderSectionText("hook", result.hook, "mt-3 border-l-2 border-violet-500 pl-4 text-[1.35rem] font-semibold leading-snug tracking-tight text-foreground")
              )}
            </div>

            <div className="mt-9">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">What to say</p>
              {editMode ? (
                <div className="mt-3 space-y-4">
                  {(["explain", "illustrate", "teach", "cta"] as const).map((section) => (
                    <div key={section}>
                      <p className="mb-1.5 text-xs text-muted-foreground">{section === "explain" ? VIRAL_SCRIPT_SECTION_LABELS.problem : section === "illustrate" ? VIRAL_SCRIPT_SECTION_LABELS.story : section === "teach" ? VIRAL_SCRIPT_SECTION_LABELS.takeaway : VIRAL_SCRIPT_SECTION_LABELS.cta}</p>
                      <Textarea value={editDraft[section]} onChange={(e) => onEditDraftChange({ ...editDraft, [section]: e.target.value })} className="min-h-[80px] resize-none text-sm" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 max-w-[44rem] space-y-5 text-[16px] leading-8 text-foreground/90">
                  {result.explain ? renderSectionText("explain", result.explain, "whitespace-pre-line") : null}
                  {result.illustrate ? renderSectionText("illustrate", result.illustrate, "whitespace-pre-line") : null}
                  {result.teach ? renderSectionText("teach", result.teach, "whitespace-pre-line") : null}
                  {result.cta ? renderSectionText("cta", result.cta, "whitespace-pre-line") : null}
                </div>
              )}
            </div>

            <div className="mt-10 border-t border-border/70 pt-2">
              <button type="button" onClick={() => setFilmHelpOpen((open) => !open)} className="flex w-full items-center justify-between gap-3 py-4 text-left">
                <div>
                  <p className="text-sm font-semibold text-foreground">How to film</p>
                  <p className="mt-1 text-xs text-muted-foreground">Opening visual · on-screen text · B-roll · delivery</p>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", filmHelpOpen && "rotate-180")} />
              </button>

              {filmHelpOpen ? (
                <div className="grid gap-3 pb-3 sm:grid-cols-2">
                  {isGeneratingProduction ? (
                    <div className="col-span-full flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparing filming direction...</div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Opening visual</p>
                        {editMode ? <Textarea value={editDraft.hookVisualBeat} onChange={(e) => onEditDraftChange({ ...editDraft, hookVisualBeat: e.target.value })} className="mt-2 min-h-[70px] resize-none" /> : <p className="mt-2 text-sm leading-relaxed">{hookVisualBeat || production?.setup || "No opening visual yet."}</p>}
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">On-screen text</p>
                        {editMode ? <Textarea value={editDraft.hookOnScreenText} onChange={(e) => onEditDraftChange({ ...editDraft, hookOnScreenText: e.target.value })} className="mt-2 min-h-[70px] resize-none" /> : <p className="mt-2 text-sm font-medium leading-relaxed">{hookOnScreenText || "No on-screen text yet."}</p>}
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">B-roll</p>
                        <p className="mt-2 text-sm leading-relaxed">{bRollShots.length ? bRollShots.map((shot) => shot.shot?.trim()).filter(Boolean).join(" · ") : "No B-roll notes yet."}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery</p>
                        <p className="mt-2 text-sm leading-relaxed">{production?.voiceTone || production?.pacingNotes || "Use a natural delivery that matches the script."}</p>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {selectedText && !selectionEditing && !inlineProposal ? (
            <div
              onPointerDown={(event) => event.preventDefault()}
              className="absolute z-30 flex items-center gap-1 rounded-xl border border-border bg-popover p-1.5 shadow-xl"
              style={{ left: selectedText.left, top: selectedText.top }}
            >
              <button type="button" onClick={startInlineChange} className="rounded-lg px-3 py-2 text-xs font-medium hover:bg-muted">Ask for changes</button>
              <span className="h-5 w-px bg-border" />
              <button type="button" onClick={() => void copySelectedText()} aria-label="Copy selected text" className={cn("grid h-8 min-w-8 place-items-center rounded-lg px-2 text-muted-foreground hover:bg-muted hover:text-foreground", selectionCopied && "text-emerald-500")}>
                {selectionCopied ? <span className="text-xs font-medium">✓ Copied</span> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          ) : null}

          {selectedText && selectionEditing ? (
            <div ref={selectionEditorRef} className="absolute z-30 w-[min(340px,calc(100%-24px))] rounded-2xl border border-border bg-popover p-3 shadow-2xl" style={{ left: selectedText.left, top: selectedText.top }}>
              <div className="flex items-center gap-2">
                <input value={selectionInstruction} onChange={(e) => setSelectionInstruction(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitInlineChange(); }} placeholder="Describe changes" className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground" />
                <button type="button" onClick={submitInlineChange} disabled={!selectionInstruction.trim() || refinePending} className="grid h-9 w-9 place-items-center rounded-full bg-violet-600 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
              </div>
            </div>
          ) : null}
        </div>

        {!previewMode ? (
          <>
            <div className="mt-7 space-y-3">
              {turns.map((turn) => turn.role === "user" ? (
                <div key={turn.id} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md border border-violet-500/20 bg-violet-500/10 px-4 py-2.5 text-sm text-foreground">{turn.text}</div>
              ) : turn.kind === "action" ? (
                <div key={turn.id} className="max-w-[520px] rounded-xl border border-border/70 bg-card/50 px-4 py-3">
                  <p className="text-sm font-medium text-foreground"><span className="mr-2 text-emerald-500">✓</span>{turn.text}</p>
                  {turn.detail ? <p className="mt-1 text-xs text-muted-foreground">{turn.detail}</p> : null}
                </div>
              ) : (
                <p key={turn.id} className="max-w-[620px] text-sm leading-relaxed text-foreground/85">{turn.text}</p>
              ))}
              {agentBusy ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Agent is working...</div> : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => routeAgentInput("Make it 30% shorter")} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Shorter</button>
              <button type="button" onClick={() => routeAgentInput("Make the hook stronger") } className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Stronger hook</button>
              <button type="button" onClick={() => routeAgentInput("Make it funnier without changing the point") } className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Funnier</button>
              <button type="button" onClick={() => routeAgentInput("Simplify the language") } className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Simplify</button>
              <button type="button" onClick={() => { setAgentInput("Adapt this for "); window.setTimeout(() => composerRef.current?.focus(), 0); }} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Change niche</button>
            </div>

            <div className="sticky bottom-3 z-20 mt-4 rounded-2xl border border-border/90 bg-card/95 p-2 shadow-[0_18px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl">
              <Textarea
                ref={composerRef}
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  routeAgentInput(agentInput);
                }}
                placeholder={scheduleMode ? "Tell Agent when you want to film it..." : "Ask Agent anything: rewrite a section, change the niche, shorten it, or turn it into a carousel..."}
                className="min-h-[70px] resize-none border-0 bg-transparent px-3 py-3 text-sm shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-between gap-3 px-2 pb-1">
                <span className="text-[11px] text-muted-foreground">Agent keeps the current Reel and context.</span>
                <button type="button" onClick={() => routeAgentInput(agentInput)} disabled={!agentInput.trim() || agentBusy} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white disabled:opacity-40">Send <Send className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            <div className="mt-6"><CoachScriptFeedback coachScriptId={result.id} /></div>
          </>
        ) : null}
      </div>

      <Sheet open={hookOptionsOpen} onOpenChange={setHookOptionsOpen}>
        <SheetContent side="right" className="!w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-4 pt-10 sm:!w-full sm:!max-w-md">
          <SheetHeader>
            <SheetTitle>Hook options</SheetTitle>
            <SheetDescription>Choose an opening. The rest of the script stays the same.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid gap-2.5">
            {hookOptionsSheetShowsLoader(hookVariationsPending, hookVariations?.length ?? 0) ? (
              <div className="flex flex-col items-center py-12 text-center"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /><p className="mt-3 text-sm text-muted-foreground">Finding new hooks</p></div>
            ) : hookVariations?.length ? hookVariations.map((variation, index) => (
              <button key={`${variation.hookType}-${index}`} type="button" onClick={() => { setSelectedHookOptionIndex(index); onApplyHookVariation(variation); }} className={cn("rounded-xl border p-4 text-left transition", selectedHookOptionIndex === index ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-muted/40") }>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="font-semibold">Option {index + 1}</span><span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-500">{formatCoachHookTypeLabel(variation.hookType)}</span></div>
                <p className="mt-2 text-sm font-semibold leading-snug">{variation.spokenHook}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{hookOptionReason(variation.hookType)}</p>
              </button>
            )) : <p className="text-sm text-muted-foreground">No hook options yet.</p>}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={healthOpen} onOpenChange={setHealthOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 pt-10 sm:max-w-md">
          <SheetHeader><SheetTitle>Script health</SheetTitle><SheetDescription>Optional quality checks for this Reel.</SheetDescription></SheetHeader>
          <div className="mt-4">
            <AiCoachScriptHealthPanel
              health={health}
              weakest={weakest}
              onFixWeakest={onFixWeakest}
              fixPending={refinePending}
              onEditManually={onToggleEdit}
              onShorten={onRefineWithInstruction ? () => runRefine("Shorten the full script while keeping the same idea and strongest proof.", "Reel shortened") : undefined}
              onMakeViral={onRefineWithInstruction ? () => runRefine("Make this more viral with a stronger hook, tighter pacing, and clearer payoff. Keep the same idea and facts.", "Reel strengthened") : undefined}
              onCopy={() => void copyScript()}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
