import { useState } from "react";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type SparkPlanCard = {
  id: number;
  day: number;
  funnelStage: string;
  contentFormat: string;
  platform: string;
  title: string;
  hook: string;
  angle: string;
  filmingLocation: string;
  researchSignal: string | null;
  status: string;
  goal: string | null;
  sourceType: string;
  sourceReelId: number | null;
  sourceFeaturedReelId: number | null;
  sourceReelHandle: string | null;
  userRawNote: string | null;
  coachScriptId?: number | null;
};

type SparkDeckCardProps = {
  card: SparkPlanCard;
  selected: boolean;
  anySelected: boolean;
  isAdjusting: boolean;
  adjustText: string;
  isRegenerating: boolean;
  isDismissing: boolean;
  onToggle: () => void;
  onWriteScript: () => void;
  onViewScript: () => void;
  onWriteAnother: () => void;
  onDismiss: () => void;
  onStartAdjust: () => void;
  onCancelAdjust: () => void;
  onAdjustTextChange: (text: string) => void;
  onAdjustSubmit: () => void;
};

function SparkDeckCard({
  card,
  selected,
  anySelected,
  isAdjusting,
  adjustText,
  isRegenerating,
  isDismissing,
  onToggle,
  onWriteScript,
  onViewScript,
  onWriteAnother,
  onDismiss,
  onStartAdjust,
  onCancelAdjust,
  onAdjustTextChange,
  onAdjustSubmit,
}: SparkDeckCardProps) {
  const scriptReady = card.coachScriptId != null && card.coachScriptId > 0;

  const statusBorder = isAdjusting
    ? "border-amber-400 bg-amber-50/30 dark:bg-amber-950/20"
    : scriptReady
      ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20"
      : card.status === "approved"
        ? "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20"
        : card.status === "rejected"
          ? "border-red-400 bg-red-50/40 dark:bg-red-950/20"
          : selected
            ? "border-violet-500"
            : "border-border bg-card";

  return (
    <div
      className={`relative min-w-[240px] max-w-[260px] shrink-0 rounded-xl border-2 transition-all duration-150 group ${isAdjusting || scriptReady ? "" : "cursor-pointer"} ${statusBorder}`}
      onClick={isAdjusting || scriptReady ? undefined : onToggle}
    >
      {!isAdjusting && !scriptReady && (
        <div
          className={`absolute top-2.5 left-2.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            selected
              ? "bg-violet-600 border-violet-600"
              : anySelected
                ? "border-border bg-background"
                : "border-transparent group-hover:border-border bg-background/80"
          }`}
        >
          {selected && <span className="text-white text-[10px] font-bold">✓</span>}
        </div>
      )}

      <button
        type="button"
        className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        aria-label="Dismiss spark"
        title="Dismiss spark"
        disabled={isDismissing || isAdjusting}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        {isDismissing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </button>

      <div className={`p-3 ${isAdjusting || scriptReady ? "pt-3" : "pt-8"}`}>
        <div className="flex items-center gap-1.5 flex-wrap mb-2 pr-7">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
            Spark
          </span>
          {card.sourceReelHandle ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[120px]">
              @{card.sourceReelHandle.replace(/^@/, "")}
            </span>
          ) : (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              Typed
            </span>
          )}
          {scriptReady ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 ml-auto">
              Script ready
            </span>
          ) : card.status === "approved" ? (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 ml-auto">
              Approved
            </span>
          ) : null}
        </div>

        <p className="text-sm font-semibold leading-snug line-clamp-2 mb-1.5">{card.title}</p>
        <p className="text-xs italic text-muted-foreground line-clamp-2 leading-relaxed mb-2">
          &ldquo;{card.hook}&rdquo;
        </p>

        {isAdjusting && !scriptReady && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
              What needs to change?
            </p>
            <Textarea
              value={adjustText}
              onChange={(e) => onAdjustTextChange(e.target.value)}
              placeholder='e.g. "Make it more B2B, less consumer advice."'
              className="text-xs min-h-[70px] resize-none border-amber-300 mb-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onAdjustSubmit();
                if (e.key === "Escape") onCancelAdjust();
              }}
            />
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="sm" className="flex-1 text-xs" onClick={onCancelAdjust} disabled={isRegenerating}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 text-xs bg-amber-500 hover:bg-amber-600"
                onClick={onAdjustSubmit}
                disabled={isRegenerating || !adjustText.trim()}
              >
                {isRegenerating ? "Regenerating..." : "Regenerate"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {!isAdjusting && (
        <div className="px-3 pb-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {scriptReady ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                onClick={onViewScript}
              >
                View Script
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300"
                onClick={onWriteAnother}
              >
                Write another
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                onClick={onWriteScript}
              >
                Write Script
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onStartAdjust}>
                Change this idea
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AddSparkModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const captureMutation = trpc.plan.captureSpark.useMutation({
    onSuccess: () => {
      setNote("");
      onClose();
      onSaved();
      toast.success("Spark saved", {
        description: "Added to your Spark Deck.",
      });
    },
    onError: (err) => toast.error(err.message),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-lg mb-1">Add my idea</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Rough notes are fine. Saves to Spark Deck. No script until you hit Write Script.
        </p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder='e.g. "3 mistakes small HVAC shops make on commercial bids..."'
          className="min-h-[120px] resize-none mb-4"
          autoFocus
        />
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={captureMutation.isPending}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-violet-600 hover:bg-violet-700"
            onClick={() => {
              const trimmed = note.trim();
              if (trimmed.length < 3) return;
              captureMutation.mutate({ note: trimmed });
            }}
            disabled={captureMutation.isPending || note.trim().length < 3}
          >
            {captureMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save to Spark Deck"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

type SparkDeckSectionProps = {
  sparkCards: SparkPlanCard[];
  selectedIds: Set<number>;
  anySelected: boolean;
  adjustingId: number | null;
  adjustText: string;
  isRegenerating: boolean;
  onToggleSelect: (id: number) => void;
  onWriteScript: (card: SparkPlanCard) => void;
  onViewScript: (card: SparkPlanCard) => void;
  onStartAdjust: (id: number) => void;
  onCancelAdjust: () => void;
  onAdjustTextChange: (text: string) => void;
  onAdjustSubmit: () => void;
  onCardsChanged: () => void;
};

export function SparkDeckSection({
  sparkCards,
  selectedIds,
  anySelected,
  adjustingId,
  adjustText,
  isRegenerating,
  onToggleSelect,
  onWriteScript,
  onViewScript,
  onStartAdjust,
  onCancelAdjust,
  onAdjustTextChange,
  onAdjustSubmit,
  onCardsChanged,
}: SparkDeckSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const dismissMutation = trpc.plan.dismissSpark.useMutation({
    onSuccess: () => {
      toast.success("Spark dismissed");
      setDismissingId(null);
      onCardsChanged();
    },
    onError: (err) => {
      setDismissingId(null);
      toast.error(err.message);
    },
  });

  const handleDismiss = (card: SparkPlanCard) => {
    const ok = window.confirm(`Remove "${card.title}" from your Spark Deck?`);
    if (!ok) return;
    setDismissingId(card.id);
    dismissMutation.mutate({ id: card.id });
  };

  return (
    <section className="rounded-xl border border-violet-200/80 bg-violet-50/30 dark:border-violet-900 dark:bg-violet-950/20 p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            Spark Deck
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ideas you saved from reels or typed yourself. Refine later, then Write Script.
          </p>
        </div>
        {sparkCards.length > 3 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-violet-700 dark:text-violet-300"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
        )}
      </div>

      <div
        className={`flex gap-3 overflow-x-auto pb-1 ${expanded ? "flex-wrap max-h-[520px] overflow-y-auto" : "flex-nowrap"}`}
      >
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="min-w-[200px] max-w-[220px] shrink-0 rounded-xl border-2 border-dashed border-violet-300 dark:border-violet-700 bg-background/60 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-colors p-4 flex flex-col items-center justify-center gap-2 text-center min-h-[180px]"
        >
          <Plus className="h-6 w-6 text-violet-600" />
          <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">Add my idea</span>
          <span className="text-[10px] text-muted-foreground">Type a rough note</span>
        </button>

        {sparkCards.map((card) => (
          <SparkDeckCard
            key={card.id}
            card={card}
            selected={selectedIds.has(card.id)}
            anySelected={anySelected}
            isAdjusting={adjustingId === card.id}
            adjustText={adjustingId === card.id ? adjustText : ""}
            isRegenerating={isRegenerating}
            isDismissing={dismissingId === card.id && dismissMutation.isPending}
            onToggle={() => onToggleSelect(card.id)}
            onWriteScript={() => onWriteScript(card)}
            onViewScript={() => onViewScript(card)}
            onWriteAnother={() => setShowAddModal(true)}
            onDismiss={() => handleDismiss(card)}
            onStartAdjust={() => onStartAdjust(card.id)}
            onCancelAdjust={onCancelAdjust}
            onAdjustTextChange={onAdjustTextChange}
            onAdjustSubmit={onAdjustSubmit}
          />
        ))}
      </div>

      <AddSparkModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={onCardsChanged}
      />
    </section>
  );
}
