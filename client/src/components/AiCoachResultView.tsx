import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  flattenCoachScriptForCopy,
  parseCoachHookVariations,
  parseProductionNotes,
  type CoachHookVariation,
  type CoachScriptSections,
} from "@shared/coachScriptSections";
import { formatCoachHookTypeLabel } from "@shared/hookTypes";
import { VIRAL_SCRIPT_SECTION_LABELS } from "@shared/studioCoachUi";
import {
  ArrowLeft,
  Clock,
  Copy,
  MapPin,
  BookmarkPlus,
  Video,
  Music2,
  HelpCircle,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { ReelPreviewPhone } from "@/components/ReelPreviewPhone";
import { cn } from "@/lib/utils";
import { CoachScriptFeedback } from "@/components/CoachScriptFeedback";
import {
  CoachScriptSchedulePanel,
  type CoachScriptSchedulePanelProps,
} from "@/components/CoachScriptSchedulePanel";
import Tooltip from "@/components/Tooltip";

function truncateWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function formatInstagramAudioLine(title: string, artist?: string | null): string {
  const cleanTitle = title.trim();
  const cleanArtist = artist?.trim();
  if (!cleanTitle) return "";
  return cleanArtist ? `${cleanTitle} · ${cleanArtist}` : cleanTitle;
}

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
};

const VISUAL_HOOK_TOOLTIP =
  "Film this exact shot before you speak. What the viewer sees in the first second decides if they stay.";

function VisualHookLabel() {
  return (
    <div className="flex items-center gap-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Visual hook
      </p>
      <Tooltip content={VISUAL_HOOK_TOOLTIP}>
        <span className="inline-flex cursor-help text-muted-foreground" aria-label="Visual hook help">
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      </Tooltip>
    </div>
  );
}

function HookVariationCard({
  variation,
  onSelect,
}: {
  variation: CoachHookVariation;
  onSelect: () => void;
}) {
  const typeLabel = formatCoachHookTypeLabel(variation.hookType);
  return (
    <div className="group w-full rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 p-3 transition-colors hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm">
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0 space-y-2">
          <span className="inline-block text-[10px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200 px-2 py-0.5 rounded-full">
            Hook: {typeLabel}
          </span>
          <div>
            <VisualHookLabel />
            <p className="text-sm italic text-gray-700 dark:text-gray-300 mt-1">{variation.visualHook}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Spoken hook</p>
            <p className="text-sm font-medium mt-1">{variation.spokenHook}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">On-screen text</p>
            <p className="text-sm font-semibold mt-1">{variation.onScreenText}</p>
          </div>
        </div>

        {variation.onScreenText.trim() ? (
          <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Preview</p>
            <ReelPreviewPhone onScreenText={variation.onScreenText} compact />
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex justify-end border-t border-blue-100 dark:border-blue-900/60 pt-3">
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex items-center justify-center min-h-9 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Use this hook
        </button>
      </div>
    </div>
  );
}

type HeitSectionProps = {
  badge: string;
  badgeClass: string;
  label: string;
  subtitle: string;
  cardClass: string;
  labelClass?: string;
  bodyClass?: string;
  value: string;
  editMode: boolean;
  onChange: (value: string) => void;
  mediumBody?: boolean;
};

function HeitSection({
  badge,
  badgeClass,
  label,
  subtitle,
  cardClass,
  labelClass,
  bodyClass,
  value,
  editMode,
  onChange,
  mediumBody,
}: HeitSectionProps) {
  return (
    <section className={`rounded-2xl p-5 border ${cardClass}`}>
      <div className="flex gap-2.5 items-start mb-3">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${badgeClass}`}
        >
          {badge}
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${labelClass ?? "text-gray-900 dark:text-gray-100"}`}>
            {label}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>
        </div>
      </div>
      {editMode ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[80px] resize-none bg-white dark:bg-gray-900 text-sm"
        />
      ) : (
        <div
          className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3.5 text-sm leading-relaxed whitespace-pre-line ${bodyClass ?? ""} ${mediumBody ? "font-medium" : ""} ${!value.trim() ? "text-muted-foreground italic" : ""}`}
        >
          {value.trim() ? value : "Missing. Use Refine with AI below to fill this section."}
        </div>
      )}
    </section>
  );
}

function platformLabel(platform: string): string {
  if (platform === "both") return "Instagram + TikTok";
  if (platform === "instagram") return "Instagram Reels";
  if (platform === "tiktok") return "TikTok";
  return platform;
}

type AiCoachResultViewProps = {
  result: CoachResultScript;
  editMode: boolean;
  editDraft: CoachScriptSections & { hook: string };
  onEditDraftChange: (draft: CoachScriptSections & { hook: string }) => void;
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
  onDismissHookVariations: () => void;
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
  onDismissHookVariations,
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
}: AiCoachResultViewProps) {
  const refineInputRef = useRef<HTMLInputElement>(null);
  const production = parseProductionNotes(result.productionNotes);
  const hookOnScreenText =
    production?.hookOnScreenText?.trim() ||
    production?.textOverlay?.trim() ||
    "";
  const hookVisualBeat = production?.hookVisualBeat?.trim() ?? "";
  const hookTypeLabel = production?.hookType
    ? formatCoachHookTypeLabel(production.hookType)
    : "";

  const sections: CoachScriptSections = {
    explain: result.explain,
    illustrate: result.illustrate,
    teach: result.teach,
    cta: result.cta,
  };

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
      toast.success("Script copied to clipboard");
    } catch {
      toast.error("Could not copy script");
    }
  };

  return (
    <div className="min-h-full bg-[#fafafa] dark:bg-gray-950/40 -mx-2 sm:-mx-4 px-2 sm:px-4 py-6">
      <div className="max-w-[1120px] mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            {!previewMode ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                New script
              </button>
            ) : (
              <div />
            )}
            {!previewMode ? (
            <div className="flex gap-2 flex-wrap justify-end">
              {onFilmNow ? (
                <button
                  type="button"
                  onClick={onFilmNow}
                  disabled={filmNowPending}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
                >
                  <Video className="h-4 w-4" />
                  {filmNowPending ? "Opening teleprompter..." : "Film now"}
                </button>
              ) : null}
              {onSaveToMyScripts ? (
                <button
                  type="button"
                  onClick={onSaveToMyScripts}
                  disabled={saveToMyScriptsPending}
                  className={cn(
                    "inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border disabled:opacity-60",
                    savedScriptId
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                  )}
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  {saveToMyScriptsPending
                    ? "Saving..."
                    : savedScriptId
                      ? "Saved · My Scripts"
                      : "Save to My Scripts"}
                </button>
              ) : null}
            <button
              type="button"
              onClick={copyScript}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy script
            </button>
          </div>
            ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <main className="min-w-0 space-y-4">
            <header>
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50 leading-tight tracking-tight">
                {result.title}
              </h1>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-[11px] font-medium bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2.5 py-0.5 rounded-full">
                  {platformLabel(result.platform)}
                </span>
                {production?.funnelStage && (
                  <span className="text-[11px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200 px-2.5 py-0.5 rounded-full uppercase">
                    {production.funnelStage}
                  </span>
                )}
                {hookTypeLabel ? (
                  <span className="text-[11px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200 px-2.5 py-0.5 rounded-full">
                    Hook: {hookTypeLabel}
                  </span>
                ) : null}
                {result.estimatedDuration && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3.5 w-3.5" />
                    {result.estimatedDuration}
                  </span>
                )}
              </div>
            </header>

            <div className="space-y-4">
              <section className="rounded-2xl p-5 border border-blue-200 bg-blue-50 border-l-[3px] border-l-blue-500 dark:bg-blue-950/30 dark:border-blue-800 dark:border-l-blue-500">
                <div className="flex gap-2.5 items-start mb-4">
                  <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                    1
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                      {VIRAL_SCRIPT_SECTION_LABELS.hook}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      All 3 layers in frame 0. Visual + spoken + on-screen text.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px] gap-4 items-start">
                  <div className="min-w-0">
                    <div className="rounded-[14px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
                      <div className="px-4 py-3.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-950/40">
                        <div className="mb-2">
                          <VisualHookLabel />
                        </div>
                        {editMode ? (
                          <Textarea
                            value={hookVisualBeat}
                            readOnly
                            placeholder="Regenerate or refine to add a frame 0 shot."
                            className="min-h-[52px] resize-none text-sm italic bg-white dark:bg-gray-900"
                          />
                        ) : (
                          <p
                            className={`text-sm leading-relaxed ${hookVisualBeat ? "italic text-gray-700 dark:text-gray-300" : "text-muted-foreground italic"}`}
                          >
                            {hookVisualBeat ||
                              "Add a frame 0 shot in Refine (mid-action, close-up, or end-result)."}
                          </p>
                        )}
                      </div>
                      <div className="px-4 py-3.5 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                          Spoken hook
                        </p>
                        {editMode ? (
                          <Textarea
                            value={editDraft.hook}
                            onChange={(e) => onEditDraftChange({ ...editDraft, hook: e.target.value })}
                            className="min-h-[60px] resize-none bg-white dark:bg-gray-900 text-sm font-medium"
                          />
                        ) : (
                          <p className="text-sm leading-relaxed font-medium text-gray-900 dark:text-gray-50">
                            {result.hook}
                          </p>
                        )}
                      </div>
                      <div className="px-4 py-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                          On-screen text
                        </p>
                        {hookOnScreenText ? (
                          <p className="text-sm font-extrabold uppercase tracking-wide text-gray-900 dark:text-gray-50">
                            {hookOnScreenText}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            No on-screen text yet. Regenerate or refine to add frame 0 text.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {!editMode ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400"
                          onClick={
                            hookVariations && hookVariations.length > 0
                              ? onDismissHookVariations
                              : onRequestHookVariations
                          }
                          disabled={hookVariationsPending}
                        >
                          {hookVariationsPending
                            ? "Generating..."
                            : hookVariations && hookVariations.length > 0
                              ? "Hide hook ideas"
                              : "Try 3 new hook ideas"}
                        </button>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground min-w-0 flex-1">
                        On-screen complements spoken (different words, same idea). Works muted.
                      </p>
                    </div>

                    {hookVariations && hookVariations.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-3 px-1">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            Choose a hook ({hookVariations.length} ideas)
                          </p>
                          <button
                            type="button"
                            onClick={onDismissHookVariations}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                            Collapse
                          </button>
                        </div>
                        {hookVariations.map((variation, index) => (
                          <HookVariationCard
                            key={`${variation.hookType}-${index}`}
                            variation={variation}
                            onSelect={() => onApplyHookVariation(variation)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {hookOnScreenText ? (
                    <div className="flex flex-col items-center gap-1.5 sm:pt-1">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        Preview
                      </p>
                      <ReelPreviewPhone onScreenText={hookOnScreenText} compact />
                    </div>
                  ) : null}
                </div>
              </section>

              <HeitSection
                badge="2"
                badgeClass="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                label={VIRAL_SCRIPT_SECTION_LABELS.problem}
                subtitle="Name the problem. Show it is bigger than they think. Build tension."
                cardClass="border-gray-200 bg-gray-50 border-l-[3px] border-l-gray-500 dark:bg-gray-900/40 dark:border-gray-700"
                value={editMode ? editDraft.explain : result.explain}
                editMode={editMode}
                onChange={(explain) => onEditDraftChange({ ...editDraft, explain })}
              />

              <HeitSection
                badge="3"
                badgeClass="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                label={VIRAL_SCRIPT_SECTION_LABELS.story}
                subtitle="One specific story or example. Concrete details so they see themselves in it."
                cardClass="border-gray-200 bg-gray-50 border-l-[3px] border-l-gray-500 dark:bg-gray-900/40 dark:border-gray-700"
                value={editMode ? editDraft.illustrate : result.illustrate}
                editMode={editMode}
                onChange={(illustrate) => onEditDraftChange({ ...editDraft, illustrate })}
              />

              <HeitSection
                badge="4"
                badgeClass="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                label={VIRAL_SCRIPT_SECTION_LABELS.takeaway}
                subtitle="ONE clear takeaway. Not a list. One thing they should do differently."
                cardClass="border-gray-200 bg-gray-50 border-l-[3px] border-l-gray-500 dark:bg-gray-900/40 dark:border-gray-700"
                value={editMode ? editDraft.teach : result.teach}
                editMode={editMode}
                onChange={(teach) => onEditDraftChange({ ...editDraft, teach })}
                mediumBody
              />

              {editMode || result.cta.trim() ? (
                <HeitSection
                  badge="5"
                  badgeClass="bg-orange-500 text-white"
                  label={VIRAL_SCRIPT_SECTION_LABELS.cta}
                  subtitle="Optional. Only when a natural next step helps a cold viewer."
                  cardClass="border-orange-200 bg-orange-50 border-l-[3px] border-l-orange-500 dark:bg-orange-950/30 dark:border-orange-800"
                  labelClass="text-orange-700 dark:text-orange-300"
                  value={editMode ? editDraft.cta : result.cta}
                  editMode={editMode}
                  onChange={(cta) => onEditDraftChange({ ...editDraft, cta })}
                  mediumBody
                />
              ) : null}
            </div>

            {!previewMode ? (
              <>
            <div className="pt-2 space-y-3">
              <div className="flex gap-2 flex-wrap">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      className="text-sm font-medium px-4 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
                      onClick={onSaveEdits}
                      disabled={savePending}
                    >
                      {savePending ? "Saving..." : "Save script"}
                    </button>
                    <button
                      type="button"
                      className="border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 bg-white dark:bg-gray-900"
                      onClick={onCancelEdit}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 bg-white dark:bg-gray-900"
                      onClick={onToggleEdit}
                    >
                      Edit manually
                    </button>
                    <button
                      type="button"
                      className="border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 bg-white dark:bg-gray-900"
                      onClick={() => {
                        if (refineInput.trim()) {
                          onRefine();
                          return;
                        }
                        refineInputRef.current?.focus();
                      }}
                      disabled={refinePending}
                    >
                      Refine with AI
                    </button>
                  </>
                )}
              </div>
              {!editMode && (
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
                    className="min-w-0 flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-900 placeholder:italic placeholder:text-gray-400 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={onRefine}
                    disabled={refinePending || !refineInput.trim()}
                    className="shrink-0 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {refinePending ? "Refining..." : "Apply"}
                  </button>
                </div>
              )}
            </div>

              <CoachScriptFeedback coachScriptId={result.id} />
              </>
            ) : null}
          </main>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
              <h2 className="text-sm font-bold mb-4">Production Notes</h2>
              {production?.setup && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Setup
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{production.setup}</p>
                </div>
              )}
              {result.estimatedDuration && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Duration
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{result.estimatedDuration}</p>
                </div>
              )}
              {production?.voiceTone && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Voice tone
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {truncateWords(production.voiceTone, 20)}
                  </p>
                </div>
              )}
              {production?.bRoll && production.bRoll.length > 0 && (
                <div className="mb-4 rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/20 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-violet-600 text-white px-2 py-0.5 rounded-full">
                    Film these
                  </span>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-2 mb-1">
                    B-roll shots
                  </p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc pl-4 space-y-1">
                    {production.bRoll.map((shot, i) => (
                      <li key={i}>{shot.shot ?? shot.example ?? "B-roll shot"}</li>
                    ))}
                  </ul>
                </div>
              )}
              {production?.instagramAudio && production.instagramAudio.length > 0 ? (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Music2 className="h-3.5 w-3.5" />
                    Instagram audio
                  </p>
                  <div className="space-y-1">
                    {production.instagramAudio.map((pick, i) => {
                      const line = formatInstagramAudioLine(pick.title, pick.artist);
                      if (!line) return null;
                      return (
                        <p
                          key={`${pick.title}-${i}`}
                          className={
                            i === 0
                              ? "text-sm font-medium text-gray-900 dark:text-gray-50"
                              : "text-sm text-muted-foreground"
                          }
                        >
                          {i === 0 ? line : `Backup: ${line}`}
                        </p>
                      );
                    })}
                  </div>
                </div>
              ) : production?.music ? (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                    <Music2 className="h-3.5 w-3.5" />
                    Instagram audio
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{production.music}</p>
                </div>
              ) : null}
              {production?.funnelStage && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Funnel stage
                  </p>
                  <span className="text-[11px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200 px-2.5 py-0.5 rounded-full uppercase">
                    {production.funnelStage}
                  </span>
                </div>
              )}
              {!production?.setup &&
                !production?.voiceTone &&
                !production?.music &&
                !production?.instagramAudio?.length &&
                !production?.bRoll?.length && (
                <p className="text-sm text-muted-foreground">
                  Production directions will appear here after generation.
                </p>
              )}
            </div>

            {!previewMode && scheduleSave ? (
              <CoachScriptSchedulePanel {...scheduleSave} />
            ) : null}

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
              <h2 className="text-sm font-bold mb-3">Quick Actions</h2>
              <button
                type="button"
                onClick={copyScript}
                className="flex items-center gap-2 w-full text-left text-sm font-medium text-violet-600 hover:text-violet-700 hover:underline py-2"
              >
                <Copy className="h-4 w-4 shrink-0" />
                Copy full script
              </button>
              <button
                type="button"
                onClick={onReset}
                className="flex items-center gap-2 w-full text-left text-sm font-medium text-violet-600 hover:text-violet-700 hover:underline py-2"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                New script
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
