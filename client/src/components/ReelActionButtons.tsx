import { Button } from "@/components/ui/button";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  FileText,
  Loader2,
  Wand2,
  ExternalLink,
  Trash2,
  Info,
} from "lucide-react";
import Tooltip from "@/components/Tooltip";

/**
 * Discriminated source so a single callsite can't accidentally pass the
 * wrong id. Commit 5 extracted this so List view and Grid view share the
 * exact same mutation inputs + analytics payload  -  visual shell differs,
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
   * Commit 9  -  fired by the "Make My Version" / "Open My Script ✓"
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

  /**
   * Bug #57: Tier-1 remakeability. When true, replaces idle "Make My Version"
   * with Save for Inspiration (same `saved.toggle` as bookmark).
   */
  idleNotRemakeable?: boolean;
  /** Bug #57 Tier 2 coach text for Save for Inspiration tooltip when idle. */
  classificationReason?: string | null;

  /**
   * Collected Reels / inbox: hides bookmark UI; optionally shows remove-from-collection trash.
   * Idle remakeability coaching uses italic text instead of Save for Inspiration.
   */
  collectionMode?: boolean;
  onRemoveFromCollection?: () => void;
  removeFromCollectionBusy?: boolean;

  /**
   * One-click remake strip: hides Transcript/Transcribe + Make My Version;
   * single primary CTA from parent (Dashboard grid user-job).
   */
  oneClickRemake?: OneClickRemakeAction;
}

export type OneClickRemakeAction = {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
  /** default | ready (emerald) | inspiration (primary outline) */
  tone?: "default" | "ready" | "inspiration";
  onClick: () => void;
};

/**
 * Shared action buttons used by List + Grid. Keeping a single component
 * means the two views cannot drift in terms of which tRPC mutations they
 * call or how analytics events are shaped.
 */
export function ReelActionButtons(props: ReelActionButtonsProps) {
  const {
    source,
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
    idleNotRemakeable = false,
    classificationReason,
    collectionMode = false,
    onRemoveFromCollection,
    removeFromCollectionBusy,
    oneClickRemake,
  } = props;

  const labelClass = compact ? "hidden md:inline" : "hidden sm:inline";

  return (
    <div
      className={`flex items-center gap-0.5 sm:gap-1 flex-wrap justify-end ${
        oneClickRemake ? "w-full" : "shrink-0"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {!hideBookmark && !collectionMode && (
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

      {oneClickRemake ? (
        <Tooltip content={oneClickRemake.tooltip ?? oneClickRemake.label}>
          <span className="block w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`h-7 text-xs px-3 w-full justify-center ${
                oneClickRemake.tone === "ready"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                  : oneClickRemake.tone === "inspiration"
                    ? "border-primary/30 text-primary hover:bg-primary/10"
                    : "border-primary/30 text-primary hover:bg-primary/10"
              }`}
              disabled={oneClickRemake.disabled}
              onClick={oneClickRemake.onClick}
              title={oneClickRemake.tooltip ?? oneClickRemake.label}
            >
              {oneClickRemake.loading ? (
                <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
              ) : oneClickRemake.tone === "inspiration" ? (
                <Bookmark className="h-3 w-3 sm:mr-1" />
              ) : (
                <Wand2 className="h-3 w-3 sm:mr-1" />
              )}
              <span>{oneClickRemake.label}</span>
            </Button>
          </span>
        </Tooltip>
      ) : (
        <>
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
          ) : isFailed && source.source !== "featured" ? (
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
        idleNotRemakeable &&
        recreateState !== "ready" &&
        recreateState !== "generating" &&
        recreateState !== "failed" ? (
          collectionMode ? (
            <p
              className={`text-[10px] sm:text-xs italic text-muted-foreground text-right leading-tight max-w-[5.5rem] sm:max-w-[9rem] flex items-center justify-end gap-1 self-center ${compact ? "max-w-[4.5rem]" : ""}`}
            >
              <span>Saved as inspiration</span>
              {classificationReason?.trim() ? (
                <Tooltip content={classificationReason.trim()}>
                  <span className="inline-flex cursor-help shrink-0">
                    <Info className="h-3 w-3 text-muted-foreground/70" aria-hidden />
                  </span>
                </Tooltip>
              ) : null}
            </p>
          ) : isSaved ? (
            <Tooltip content="Remove from saved">
              <span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={onToggleSave}
                  disabled={!!saveBusy}
                  title="Remove from saved"
                >
                  <BookmarkCheck className="h-3 w-3 sm:mr-1" />
                  <span className={labelClass}>Saved</span>
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Tooltip
              content={
                idleNotRemakeable && classificationReason?.trim()
                  ? classificationReason.trim()
                  : "Save for Inspiration"
              }
            >
              <span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={onToggleSave}
                  disabled={!!saveBusy}
                  title={
                    idleNotRemakeable && classificationReason?.trim()
                      ? classificationReason.trim()
                      : "Save for Inspiration"
                  }
                >
                  <Bookmark className="h-3 w-3 sm:mr-1" />
                  <span className={labelClass}>Save for Inspiration</span>
                </Button>
              </span>
            </Tooltip>
          )
        ) : (
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
        )
      )}

        </>
      )}

      {!oneClickRemake && !hideExternalLink && (
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

      {collectionMode && onRemoveFromCollection && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          onClick={onRemoveFromCollection}
          disabled={!!removeFromCollectionBusy}
          title="Remove from collection"
          aria-label="Remove from collection"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
