import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  flattenCoachScriptForCopy,
  parseProductionNotes,
  spokenWhatToSay,
  type CoachHookVariation,
  type CoachScriptSections,
} from "@shared/coachScriptSections";
import { hookOptionsArrivalPlan, hookOptionsSheetShowsLoader } from "@shared/coachHookOptionsUi";
import { formatCoachHookTypeLabel } from "@shared/hookTypes";
import { VIRAL_SCRIPT_SECTION_LABELS } from "@shared/studioCoachUi";
import {
  Clapperboard,
  Clock,
  Copy,
  MapPin,
  Check,
  Music2,
  ChevronDown,
  Loader2,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { stashBrollScriptForAfterAuth } from "@/lib/brollPendingScript";
import { CoachScriptFeedback } from "@/components/CoachScriptFeedback";
import {
  CoachScriptSchedulePanel,
  type CoachScriptSchedulePanelProps,
} from "@/components/CoachScriptSchedulePanel";
import { InstagramAudioPreviewList } from "@/components/InstagramAudioPreviewList";
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
  /** Remake import async production layer. Null for sync Studio paths. */
  productionNotesStatus?: "pending" | "processing" | "completed" | "failed" | null;
};

function hookOptionReason(type: string): string {
  switch (type) {
    case "story":
      return "Credibility + curiosity";
    case "contrarian":
      return "Pattern interruption";
    case "specific_outcome":
      return "Clear promise";
    case "pain_point":
      return "Pain + tension";
    case "curiosity_gap":
      return "Open loop";
    case "question":
      return "Viewer engagement";
    case "shock_data":
      return "Proof + surprise";
    case "pov":
      return "Immersion";
    case "show_end_first":
      return "Result first";
    default:
      return "Strong angle";
  }
}

function HookOptionCard({
  variation,
  optionLabel,
  selected,
  onSelect,
}: {
  variation: CoachHookVariation;
  optionLabel: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const typeLabel = formatCoachHookTypeLabel(variation.hookType);
  const preview =
    variation.spokenHook.trim().length > 90
      ? `${variation.spokenHook.trim().slice(0, 87)}...`
      : variation.spokenHook.trim();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "relative w-full min-w-0 rounded-xl border bg-white p-3.5 text-left transition dark:bg-gray-900",
        selected
          ? "border-violet-500 shadow-[0_0_0_1px_rgba(124,58,237,0.9)]"
          : "border-gray-200 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-500"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{optionLabel}</span>
        <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">
          {typeLabel}
        </span>
      </div>
      <h5 className="mt-2 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
        {preview || "Untitled hook"}
      </h5>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {hookOptionReason(variation.hookType)}
      </p>
    </button>
  );
}

type EditSectionProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function EditSection({ label, value, onChange }: EditSectionProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[80px] resize-none bg-white dark:bg-gray-900 text-sm"
      />
    </div>
  );
}

function platformLabel(platform: string): string {
  if (platform === "both") return "Instagram + TikTok";
  if (platform === "instagram") return "Instagram Reels";
  if (platform === "tiktok") return "TikTok";
  return platform;
}

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
  /** Read-only embed (onboarding aha): hides edit, refine, hook tools, and top actions. */
  previewMode?: boolean;
  /** Fix weakest section via targeted refine. */
  onFixWeakest?: () => void;
  /** Run refine with an explicit instruction (quick actions). */
  onRefineWithInstruction?: (instruction: string) => void;
};

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
  onFilmNow,
  filmNowPending,
  previewMode = false,
  onFixWeakest,
  onRefineWithInstruction,
}: AiCoachResultViewProps) {
  const [, setLocation] = useLocation();
  const refineInputRef = useRef<HTMLInputElement>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [originalIdeaOpen, setOriginalIdeaOpen] = useState(false);
  const [filmHelpOpen, setFilmHelpOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [selectedHookOptionIndex, setSelectedHookOptionIndex] = useState<number | null>(null);
  const [hookOptionsOpen, setHookOptionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wasSavingRef = useRef(false);
  const production = parseProductionNotes(result.productionNotes);
  const health = mapCoachJudgeToHealth(production?.coachJudge);
  const sectionScores = health ? deriveSectionScores(health) : null;
  const weakest = sectionScores ? findWeakestSection(sectionScores) : null;
  const isGeneratingProduction =
    result.productionNotesStatus === "processing" ||
    result.productionNotesStatus === "pending";
  const originalIdea = production?.sourceDescription?.trim() || "";
  const savedOnScreenText =
    production?.hookOnScreenText?.trim() ||
    production?.textOverlay?.trim() ||
    "";
  const savedVisualBeat = production?.hookVisualBeat?.trim() ?? "";
  const hookOnScreenText = editMode ? editDraft.hookOnScreenText : savedOnScreenText;
  const hookVisualBeat = editMode ? editDraft.hookVisualBeat : savedVisualBeat;
  const bRollShots = (production?.bRoll ?? []).filter(
    (shot) => typeof shot?.shot === "string" && shot.shot.trim()
  );
  const musicNote = production?.music?.trim() ?? "";

  useEffect(() => {
    const plan = hookOptionsArrivalPlan(hookVariations);
    setSelectedHookOptionIndex(plan.selectedIndex);
  }, [hookVariations]);

  useEffect(() => {
    if (hookVariationsPending) {
      setHookOptionsOpen(true);
    }
  }, [hookVariationsPending]);

  useEffect(() => {
    if (saveToMyScriptsPending) {
      wasSavingRef.current = true;
      return;
    }
    if (wasSavingRef.current) {
      wasSavingRef.current = false;
      if (savedScriptId != null) {
        setScheduleOpen(false);
      }
    }
  }, [saveToMyScriptsPending, savedScriptId]);

  const openScheduleSave = () => {
    if (scheduleSave) {
      setScheduleOpen(true);
      return;
    }
    onSaveToMyScripts?.();
  };

  const sections: CoachScriptSections = {
    explain: result.explain,
    illustrate: result.illustrate,
    teach: result.teach,
    cta: result.cta,
  };

  const whatToSay = spokenWhatToSay({
    explain: editMode ? editDraft.explain : result.explain,
    illustrate: editMode ? editDraft.illustrate : result.illustrate,
    teach: editMode ? editDraft.teach : result.teach,
    cta: editMode ? editDraft.cta : result.cta,
  });

  const copyScript = async () => {
    const text = flattenCoachScriptForCopy({
      title: result.title,
      hook: result.hook,
      sections,
      userFriendly: true,
      hookVisualBeat,
      hookOnScreenText,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy script");
    }
  };

  const goGenerateBroll = () => {
    const text = flattenCoachScriptForCopy({
      title: result.title,
      hook: result.hook,
      sections,
      userFriendly: true,
      hookVisualBeat,
      hookOnScreenText,
    });
    stashBrollScriptForAfterAuth(text, true);
    setLocation("/broll-library");
  };

  const openHookOptions = () => {
    setHookOptionsOpen(true);
    if (hookVariations && hookVariations.length > 0) return;
    if (hookVariationsPending) return;
    onRequestHookVariations();
  };

  return (
    <div className="min-h-full bg-[#fafafa] dark:bg-gray-950/40 -mx-2 sm:-mx-4 px-2 sm:px-4 py-6">
      <div className="max-w-[720px] mx-auto px-2 sm:px-4">
        <header className="mb-8">
          <h1 className="text-[1.65rem] font-semibold text-gray-900 dark:text-gray-50 leading-tight tracking-tight">
            {result.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {[platformLabel(result.platform), result.estimatedDuration].filter(Boolean).join(" · ")}
          </p>
        </header>

        {originalIdea ? (
          <div className="mb-5">
            <button
              type="button"
              className="inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-800 dark:hover:text-gray-200"
              onClick={() => setOriginalIdeaOpen((open) => !open)}
              aria-expanded={originalIdeaOpen}
            >
              <span>Your idea</span>
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", originalIdeaOpen && "rotate-180")} />
            </button>
            {originalIdeaOpen ? (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {originalIdea}
              </p>
            ) : (
              <p className="mt-1 truncate text-sm text-muted-foreground">{originalIdea}</p>
            )}
          </div>
        ) : null}

        <section className="space-y-8">
          <div className="border-l-2 border-violet-400/70 pl-4 dark:border-violet-500/50">
            <p className="text-xs text-muted-foreground">Hook</p>
            {editMode ? (
              <Textarea
                value={editDraft.hook}
                onChange={(e) => onEditDraftChange({ ...editDraft, hook: e.target.value })}
                className="mt-2 min-h-[72px] resize-none bg-white dark:bg-gray-900 text-lg font-semibold leading-snug"
              />
            ) : (
              <p className="mt-2 text-[1.35rem] font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-50">
                {result.hook}
              </p>
            )}
          </div>

          {editMode ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">What to say</p>
              <EditSection
                label={VIRAL_SCRIPT_SECTION_LABELS.problem}
                value={editDraft.explain}
                onChange={(explain) => onEditDraftChange({ ...editDraft, explain })}
              />
              <EditSection
                label={VIRAL_SCRIPT_SECTION_LABELS.story}
                value={editDraft.illustrate}
                onChange={(illustrate) => onEditDraftChange({ ...editDraft, illustrate })}
              />
              <EditSection
                label={VIRAL_SCRIPT_SECTION_LABELS.takeaway}
                value={editDraft.teach}
                onChange={(teach) => onEditDraftChange({ ...editDraft, teach })}
              />
              <EditSection
                label={VIRAL_SCRIPT_SECTION_LABELS.cta}
                value={editDraft.cta}
                onChange={(cta) => onEditDraftChange({ ...editDraft, cta })}
              />
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground">What to say</p>
              <p className="mt-3 max-w-[38rem] whitespace-pre-line text-[16px] leading-8 text-gray-800 dark:text-gray-100">
                {whatToSay || "This script is missing spoken lines. Use Refine to fill them in."}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setFilmHelpOpen((open) => !open)}
              aria-expanded={filmHelpOpen}
            >
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                How to film this
              </span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", filmHelpOpen && "rotate-180")} />
            </button>
            {filmHelpOpen ? (
              <div className="space-y-6 border-t border-gray-100 px-4 py-5 dark:border-gray-800">
                {isGeneratingProduction ? (
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                    <span>Adding filming notes...</span>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Opening</p>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">Visual opening</p>
                        {editMode ? (
                          <Textarea
                            value={editDraft.hookVisualBeat}
                            onChange={(e) =>
                              onEditDraftChange({ ...editDraft, hookVisualBeat: e.target.value })
                            }
                            placeholder="What the viewer sees in the first second."
                            className="min-h-[52px] resize-none text-sm"
                          />
                        ) : (
                          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                            {hookVisualBeat || "No visual opening yet."}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">On-screen text</p>
                        {editMode ? (
                          <Textarea
                            value={editDraft.hookOnScreenText}
                            onChange={(e) =>
                              onEditDraftChange({
                                ...editDraft,
                                hookOnScreenText: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="BOLD TEXT FOR MUTED VIEWERS"
                            maxLength={60}
                            className="min-h-[44px] resize-none text-sm font-semibold uppercase"
                          />
                        ) : (
                          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                            {hookOnScreenText || "No on-screen text yet."}
                          </p>
                        )}
                      </div>
                    </div>

                    {production?.setup || result.estimatedDuration || production?.voiceTone ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Delivery</p>
                        {production?.setup ? (
                          <div>
                            <p className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              Setup
                            </p>
                            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                              {production.setup}
                            </p>
                          </div>
                        ) : null}
                        {production?.voiceTone ? (
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">Delivery</p>
                            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                              {production.voiceTone}
                            </p>
                          </div>
                        ) : null}
                        {result.estimatedDuration ? (
                          <div>
                            <p className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              Duration
                            </p>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{result.estimatedDuration}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {bRollShots.length > 0 || !previewMode ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">B-roll</p>
                        {bRollShots.length > 0 ? (
                          <ul className="space-y-2">
                            {bRollShots.map((shot, index) => (
                              <li
                                key={`${shot.shot}-${index}`}
                                className="text-sm leading-relaxed text-gray-700 dark:text-gray-300"
                              >
                                {shot.shot}
                                {shot.example?.trim() ? (
                                  <span className="block text-muted-foreground">{shot.example}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {!previewMode ? (
                          <button
                            type="button"
                            onClick={goGenerateBroll}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Clapperboard className="h-4 w-4 shrink-0" aria-hidden />
                            Generate B-roll
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {production?.instagramAudio && production.instagramAudio.length > 0 ? (
                      <div className="space-y-3">
                        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Audio
                        </p>
                        <InstagramAudioPreviewList picks={production.instagramAudio.slice(0, 2)} />
                      </div>
                    ) : musicNote ? (
                      <div className="space-y-3">
                        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Audio
                        </p>
                        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                          {musicNote}
                        </p>
                      </div>
                    ) : null}
                    {!production?.setup &&
                    !production?.voiceTone &&
                    !hookVisualBeat &&
                    !hookOnScreenText &&
                    !production?.instagramAudio?.length &&
                    !musicNote &&
                    bRollShots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Filming notes will appear here after generation.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </section>

        {!previewMode ? (
          <div className="mt-8 space-y-4">
            {editMode ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                  onClick={onSaveEdits}
                  disabled={savePending}
                >
                  {savePending ? "Saving..." : "Save script"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                  onClick={onCancelEdit}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={copyScript}
                  className="inline-flex min-h-11 w-full min-w-[9.5rem] items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 sm:w-auto"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy script"}
                </button>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  {onFilmNow ? (
                    <button
                      type="button"
                      onClick={onFilmNow}
                      disabled={filmNowPending}
                      className="text-gray-600 hover:text-gray-950 disabled:opacity-60 dark:text-gray-300 dark:hover:text-white"
                    >
                      {filmNowPending ? "Opening teleprompter..." : "Film now"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onToggleEdit}
                    className="text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRefineOpen(true);
                      window.setTimeout(() => refineInputRef.current?.focus(), 0);
                    }}
                    disabled={refinePending}
                    className="text-gray-600 hover:text-gray-950 disabled:opacity-60 dark:text-gray-300 dark:hover:text-white"
                  >
                    Refine
                  </button>
                  {onSaveToMyScripts ? (
                    savedScriptId ? (
                      <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        Saved
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={onSaveToMyScripts}
                        disabled={saveToMyScriptsPending}
                        className="text-gray-600 hover:text-gray-950 disabled:opacity-60 dark:text-gray-300 dark:hover:text-white"
                      >
                        {saveToMyScriptsPending ? "Saving..." : "Save"}
                      </button>
                    )
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-gray-900 dark:hover:text-white"
                      >
                        More
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                      {scheduleSave ? (
                        <DropdownMenuItem onSelect={openScheduleSave}>
                          Schedule
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onSelect={openHookOptions}>
                        Hook options
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setHealthOpen(true)}>
                        Script health
                      </DropdownMenuItem>
                      {onRefineWithInstruction ? (
                        <DropdownMenuItem
                          onSelect={() =>
                            onRefineWithInstruction(
                              "Shorten the full script to about 30 seconds of spoken words. Keep the same idea. Cut filler only."
                            )
                          }
                        >
                          Shorten
                        </DropdownMenuItem>
                      ) : null}
                      {onRefineWithInstruction ? (
                        <DropdownMenuItem
                          onSelect={() =>
                            onRefineWithInstruction(
                              "Make this more viral: stronger hook, tighter pacing, clearer takeaway. Keep the same idea."
                            )
                          }
                        >
                          Make more viral
                        </DropdownMenuItem>
                      ) : null}
                      {onFixWeakest ? (
                        <DropdownMenuItem onSelect={() => onFixWeakest()}>
                          Fix weakest section
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={onReset}>New script</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}

            {!editMode && refineOpen ? (
              <div className="flex gap-2">
                <input
                  ref={refineInputRef}
                  value={refineInput}
                  onChange={(e) => onRefineInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && refineInput.trim() && !refinePending) onRefine();
                  }}
                  placeholder='e.g. "Make the hook more contrarian"'
                  disabled={refinePending}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm placeholder:italic placeholder:text-gray-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900"
                />
                <button
                  type="button"
                  onClick={onRefine}
                  disabled={refinePending || !refineInput.trim()}
                  className="shrink-0 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {refinePending ? "Improving..." : "Improve"}
                </button>
              </div>
            ) : null}

            <CoachScriptFeedback coachScriptId={result.id} />
          </div>
        ) : null}
      </div>

      <Sheet open={hookOptionsOpen} onOpenChange={setHookOptionsOpen}>
        <SheetContent
          side="right"
          className="!w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-4 pt-10 sm:!w-full sm:!max-w-md"
        >
          <SheetHeader>
            <SheetTitle>Hook options</SheetTitle>
            <SheetDescription>Choose an opening. The rest of the script stays the same.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-1 gap-2.5">
            {hookOptionsSheetShowsLoader(hookVariationsPending, hookVariations?.length ?? 0) ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-violet-600 dark:text-violet-400" aria-hidden />
                <p className="mt-3 text-sm text-muted-foreground">Finding new hooks</p>
              </div>
            ) : hookVariations && hookVariations.length > 0 ? (
              hookVariations.map((variation, index) => (
                <HookOptionCard
                  key={`${variation.hookType}-${index}`}
                  variation={variation}
                  optionLabel={`Option ${index + 1}`}
                  selected={selectedHookOptionIndex === index}
                  onSelect={() => {
                    setSelectedHookOptionIndex(index);
                    onApplyHookVariation(variation);
                  }}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No hook options yet.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={healthOpen} onOpenChange={setHealthOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 pt-10 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Script health</SheetTitle>
            <SheetDescription>Optional scores from the quality check.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <AiCoachScriptHealthPanel
              health={health}
              weakest={weakest}
              onFixWeakest={onFixWeakest}
              fixPending={refinePending}
              onShorten={
                previewMode || !onRefineWithInstruction
                  ? undefined
                  : () =>
                      onRefineWithInstruction(
                        "Shorten the full script to about 30 seconds of spoken words. Keep the same idea. Cut filler only."
                      )
              }
              onMakeViral={
                previewMode || !onRefineWithInstruction
                  ? undefined
                  : () =>
                      onRefineWithInstruction(
                        "Make this more viral: stronger hook, tighter pacing, clearer takeaway. Keep the same idea."
                      )
              }
              previewMode={previewMode}
            />
          </div>
        </SheetContent>
      </Sheet>

      {!previewMode && scheduleSave ? (
        <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-4 pt-10">
            <SheetHeader className="sr-only">
              <SheetTitle>Schedule &amp; save</SheetTitle>
              <SheetDescription>
                Add this script to My Scripts with your filming date.
              </SheetDescription>
            </SheetHeader>
            <CoachScriptSchedulePanel {...scheduleSave} />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
