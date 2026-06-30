import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { HelpTipBadge } from "@/components/HelpTipBadge";
import { formatTooltip, PLAN_FORMAT_LABELS } from "@/lib/studioContentHelp";
import {
  flattenCoachScriptForCopy,
  parseProductionNotes,
  type CoachScriptSections,
} from "@shared/coachScriptSections";
import {
  ArrowLeft,
  Clock,
  Copy,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

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
          className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3.5 text-sm leading-relaxed whitespace-pre-line ${bodyClass ?? ""} ${mediumBody ? "font-medium" : ""}`}
        >
          {value}
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
  hookVariations: { context: string; contrarian: string; intrigue: string } | null;
  onRequestHookVariations: () => void;
  hookVariationsPending: boolean;
  onApplyHook: (hook: string) => void;
  onDismissHookVariations: () => void;
  refinePending: boolean;
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
  onApplyHook,
  onDismissHookVariations,
  refinePending,
}: AiCoachResultViewProps) {
  const refineInputRef = useRef<HTMLInputElement>(null);
  const formatKey = result.contentFormat ?? "";
  const formatLabel =
    result.formatLabel ?? PLAN_FORMAT_LABELS[formatKey] ?? formatKey.replace(/-/g, " ");
  const production = parseProductionNotes(result.productionNotes);

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
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            New idea
          </button>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={copyScript}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy script
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
          <main className="min-w-0 space-y-4">
            <header>
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50 leading-tight tracking-tight">
                {result.title}
              </h1>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {formatLabel && (
                  <HelpTipBadge
                    label={formatLabel}
                    tip={formatKey ? formatTooltip(formatKey) : formatTooltip("talking-head")}
                    className="text-[11px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200 px-2.5 py-0.5 rounded-full"
                  />
                )}
                <span className="text-[11px] font-medium bg-gray-200/80 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2.5 py-0.5 rounded-full">
                  {platformLabel(result.platform)}
                </span>
                {production?.funnelStage && (
                  <span className="text-[11px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200 px-2.5 py-0.5 rounded-full uppercase">
                    {production.funnelStage}
                  </span>
                )}
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
                <div className="flex gap-2.5 items-start mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                    H
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">Hook</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      First 2 seconds. Stop the scroll. No warm-up.
                    </p>
                  </div>
                </div>
                {editMode ? (
                  <Textarea
                    value={editDraft.hook}
                    onChange={(e) => onEditDraftChange({ ...editDraft, hook: e.target.value })}
                    className="min-h-[60px] resize-none bg-white dark:bg-gray-900 text-sm"
                  />
                ) : (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3.5 text-sm leading-relaxed font-medium">
                    {result.hook}
                  </div>
                )}
                {!editMode && (
                  <button
                    type="button"
                    className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    onClick={onRequestHookVariations}
                    disabled={hookVariationsPending}
                  >
                    {hookVariationsPending ? "Generating..." : "Try 3 alternative hooks"}
                  </button>
                )}
                {hookVariations && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(hookVariations).map(([type, text]) => (
                      <div
                        key={type}
                        className="flex items-start gap-2 p-3 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-xl"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">{type}</p>
                          <p className="text-sm">{text}</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 bg-primary/10 text-primary px-2 py-1 rounded-lg text-xs font-semibold hover:bg-primary/15"
                          onClick={() => onApplyHook(text)}
                        >
                          Use
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs text-gray-500 hover:text-gray-800"
                      onClick={onDismissHookVariations}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </section>

              <HeitSection
                badge="E"
                badgeClass="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                label="Explain"
                subtitle="Name the problem. Show it is bigger than they think. Build tension. Do not solve it yet."
                cardClass="border-gray-200 bg-gray-50 border-l-[3px] border-l-gray-500 dark:bg-gray-900/40 dark:border-gray-700"
                value={editMode ? editDraft.explain : result.explain}
                editMode={editMode}
                onChange={(explain) => onEditDraftChange({ ...editDraft, explain })}
              />

              <HeitSection
                badge="I"
                badgeClass="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                label="Illustrate"
                subtitle="One specific story or example. Concrete details so they see themselves in it."
                cardClass="border-gray-200 bg-gray-50 border-l-[3px] border-l-gray-500 dark:bg-gray-900/40 dark:border-gray-700"
                value={editMode ? editDraft.illustrate : result.illustrate}
                editMode={editMode}
                onChange={(illustrate) => onEditDraftChange({ ...editDraft, illustrate })}
              />

              <HeitSection
                badge="T"
                badgeClass="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                label="Teach"
                subtitle="ONE clear takeaway. Not a list. One thing they should do differently."
                cardClass="border-gray-200 bg-gray-50 border-l-[3px] border-l-gray-500 dark:bg-gray-900/40 dark:border-gray-700"
                value={editMode ? editDraft.teach : result.teach}
                editMode={editMode}
                onChange={(teach) => onEditDraftChange({ ...editDraft, teach })}
                mediumBody
              />

              <HeitSection
                badge="CTA"
                badgeClass="bg-orange-500 text-white"
                label="Call to Action"
                subtitle="Tell them exactly what to do next. One thing only."
                cardClass="border-orange-200 bg-orange-50 border-l-[3px] border-l-orange-500 dark:bg-orange-950/30 dark:border-orange-800"
                labelClass="text-orange-700 dark:text-orange-300"
                value={editMode ? editDraft.cta : result.cta}
                editMode={editMode}
                onChange={(cta) => onEditDraftChange({ ...editDraft, cta })}
                mediumBody
              />
            </div>

            <div className="pt-2 space-y-3">
              <div className="flex gap-2 flex-wrap">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      className="text-sm font-medium px-4 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-700"
                      onClick={onSaveEdits}
                    >
                      Save edits
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
                      onClick={() => refineInputRef.current?.focus()}
                      disabled={refinePending}
                    >
                      {refinePending ? "Refining..." : "Refine with AI"}
                    </button>
                  </>
                )}
              </div>
              {!editMode && (
                <input
                  ref={refineInputRef}
                  value={refineInput}
                  onChange={(e) => onRefineInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && refineInput.trim()) onRefine();
                  }}
                  placeholder='e.g. "Make the hook more contrarian"'
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-900 placeholder:italic placeholder:text-gray-400"
                />
              )}
            </div>
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
              {formatLabel && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Format
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{formatLabel}</p>
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
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{production.voiceTone}</p>
                </div>
              )}
              {production?.music && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Music
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{production.music}</p>
                </div>
              )}
              {production?.bRoll && production.bRoll.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    B-roll shots
                  </p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc pl-4 space-y-1">
                    {production.bRoll.map((shot, i) => (
                      <li key={i}>{shot.shot ?? shot.example ?? "B-roll shot"}</li>
                    ))}
                  </ul>
                </div>
              )}
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
              {!production?.setup && !production?.voiceTone && !production?.music && (
                <p className="text-sm text-muted-foreground">
                  Production directions will appear here after generation.
                </p>
              )}
            </div>

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
                New idea
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
