import { Button } from "@/components/ui/button";
import {
  Bookmark,
  BookmarkCheck,
  FileText,
  Loader2,
  Wand2,
  ExternalLink,
} from "lucide-react";

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
  hasScript: boolean;

  /**
   * All three handlers take no args because the parent component already
   * knows which reel this button strip belongs to. The parent decides
   * what "expand" means (scrolling, opening a modal, etc.) so the same
   * component works in Grid's hover strip and List's expanded panel.
   */
  onToggleSave: () => void;
  onTranscribe: () => void;
  onExpand: () => void;

  saveBusy?: boolean;
  transcribeDisabled?: boolean;

  /** Grid view hides labels on small viewports. `compact` swaps long
   *  labels for icon-only buttons to fit inside a tile. */
  compact?: boolean;

  /** Grid bookmark sits on the thumbnail overlay, not the strip. */
  hideBookmark?: boolean;

  /** Grid moves the external link to a different corner. */
  hideExternalLink?: boolean;
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
    hasScript,
    onToggleSave,
    onTranscribe,
    onExpand,
    saveBusy,
    transcribeDisabled,
    compact,
    hideBookmark,
    hideExternalLink,
    reelUrl,
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
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={onTranscribe}
          disabled={isProcessing || !!transcribeDisabled}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              <span className={labelClass}>Transcribing...</span>
            </>
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

      {hasTranscription && (
        <Button
          variant="outline"
          size="sm"
          className={`h-7 text-xs px-2 border-primary/30 ${
            hasScript ? "bg-primary/10 text-primary" : "text-primary hover:bg-primary/10"
          }`}
          onClick={onExpand}
          title={hasScript ? "Open your script" : "Make your version"}
        >
          <Wand2 className="h-3 w-3 sm:mr-1" />
          <span className={labelClass}>
            {hasScript ? "Open My Script ✓" : "Make My Version"}
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
