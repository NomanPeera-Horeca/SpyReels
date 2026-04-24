import { Button } from "@/components/ui/button";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  FileText,
  Loader2,
  Wand2,
  ExternalLink,
} from "lucide-react";
import Tooltip from "@/components/Tooltip";

/**
 * Discriminated source so a single callsite can't accidentally pass the
 * wrong id. Commit 5 extracted this so List view and Grid view share the
 * exact same mutation inputs + analytics payload — visual shell differs,
 * behavior does not.
 */
export type ReelActionSource =
  | { source: "user_job"; reelId: number; jobId: number }
  | { source: "featured"; featuredReelId: number };

export interface ReelActionButtonsProps {
  /** Selects the discriminated input for `saved.toggle`/`transcribe.start`. */
  source: ReelActionSource;
  /** `reels.list`'s per-row id (used purely as a React key for callbacks). */
  reelId: number;
  /** Instagram URL for the external link button. */
  reelUrl: string;

  isSaved: boolean;
  hasTranscription: boolean;
  isProcessing: boolean;
  isFailed: boolean;
  /**
   * None = no row yet, Generating = latest script still pending/processing,
   * Ready = latest completed, Failed = latest row failed.
   */
  recreateState: "none" | "generating" | "ready" | "failed";

  /**
   * All three handlers take no args because the parent component already
   * knows which reel this button strip belongs to. The parent decides
   * what "expand" means (scrolling, opening a modal, etc.) so the same
   * component works in Grid's hover strip and List's expanded panel.
   */
  onToggleSave: () => void;
  onTranscribe: () => void;
  onExpand: () => void;
  /**
   * Commit 9 — fired by the "Make My Version" / "Open My Script ✓"
   * button. Parents use this to expand the row (if collapsed) AND
   * trigger a scroll-to + pulse on the Re-create section. Separate
   * from `onExpand` (which is fired by the Transcript button) so
   * clicking "View Transcript" doesn't pulse the recreate area.
   */
  onMakeVersion: () => void;
  /** Fired when recreateState is ready (open completed script inline). */
  onOpenMyScript: () => void;

  saveBusy?: boolean;
  transcribeDisabled?: boolean;

  /** Grid view hides labels on small viewports. `compact` swaps long
   *  labels for icon-only buttons to fit inside a tile. */
  compact?: boolean;

  /** Grid bookmark sits on the thumbnail overlay, not the strip. */
  hideBookmark?: boolean;

  /** Grid moves the external link to a different corner. */
  hideExternalLink?: boolean;

  /** True when the row is still waiting for a worker slot (Bug #24). */
  isQueued?: boolean;

  /** No usable speech: completed run with empty transcript/segments. */
  isNoSpeech?: boolean;
}

/**
 * Shared action buttons used by List + Grid. Keeping a single component
 * means the two views cannot drift in terms of which tRPC mutations they
 * call or how analytics events are shaped.
 */
export function ReelActionButtons(props: ReelActionButtonsProps) {
  const {
    isSaved,
    hasTranscription,
    isProcessing,
    isFailed,
    recreateState,
    onToggleSave,
    onTranscribe,
    onExpand,
    onMakeVersion,
    onOpenMyScript,
    saveBusy,
    transcribeDisabled,
    compact,
    hideBookmark,
    hideExternalLink,
    reelUrl,
    isQueued,
    isNoSpeech,
  } = props;

  const labelClass = compact ? "hidden md:inline" : "hidden sm:inline";

  return (
    <div
      className="flex items-center gap-0.5 sm:gap-1 shrink-0 flex-wrap justify-end"
      onClick={(e) => e.stopPropagation()}
    >
      {!hideBookmark && (
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 w-8 p-0 ${isSaved ? "text-primary" : "text-muted-foreground"}`}
          onClick={onToggleSave}
          disabled={!!saveBusy}
          title={isSaved ? "Remove from saved" : "Save reel"}
        >
          {isSaved ? (
            <BookmarkCheck className="h-4 w-4" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </Button>
      )}

      {hasTranscription ? (
        isNoSpeech ? (
          <Tooltip content="No transcript available">
            <span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                disabled
                title="No transcript available"
                aria-label="No transcript available"
              >
                <FileText className="h-3 w-3 sm:mr-1" />
                <span className={labelClass}>Transcript</span>
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={onExpand}
            title="View transcript"
          >
            <FileText className="h-3 w-3 sm:mr-1" />
            <span className={labelClass}>Transcript</span>
          </Button>
        )
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={onTranscribe}
          disabled={isProcessing || !!transcribeDisabled}
        >
          {isProcessing ? (
            isQueued ? (
              <>
                <Clock className="mr-1 h-3 w-3 text-amber-400" />
                <span className={labelClass}>Queued</span>
              </>
            ) : (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                <span className={labelClass}>Transcribing...</span>
              </>
            )
          ) : isFailed ? (
            <>
              <FileText className="h-3 w-3 sm:mr-1" />
              <span className={labelClass}>Retry</span>
            </>
          ) : (
            <>
              <FileText className="h-3 w-3 sm:mr-1" />
              <span className={labelClass}>Transcribe</span>
            </>
          )}
        </Button>
      )}

      {hasTranscription && !isNoSpeech && (
        <Button
          variant="outline"
          size="sm"
          className={`h-7 text-xs px-2 ${
            recreateState === "ready"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
              : "border-primary/30 text-primary hover:bg-primary/10"
          }`}
          disabled={recreateState === "generating"}
          onClick={() =>
            recreateState === "ready" ? onOpenMyScript() : onMakeVersion()
          }
          title={
            recreateState === "ready"
              ? "Open your script in the panel below"
              : recreateState === "generating"
                ? "Script is still generating"
                : "Write your own viral script using this reel's hook and structure"
          }
        >
          {recreateState === "generating" ? (
            <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
          ) : (
            <Wand2 className="h-3 w-3 sm:mr-1" />
          )}
          <span className={labelClass}>
            {recreateState === "ready"
              ? "Open My Script ✓"
              : recreateState === "generating"
                ? "Generating..."
                : "Make My Version"}
          </span>
        </Button>
      )}

      {!hideExternalLink && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          asChild
        >
          <a
            href={reelUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on Instagram"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
    </div>
  );
}
