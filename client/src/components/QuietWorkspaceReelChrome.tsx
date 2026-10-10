import { MoreHorizontal, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatCompactCount,
  formatCreatorHandle,
  formatNicheSignal,
  formatShortPostDate,
} from "@/lib/viralPosts/format";

/** Account engagement is already a percent (e.g. 3.4), not a 0-1 fraction. */
export function formatAccountEngPct(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  const rounded = Math.round(pct * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label}% eng`;
}

export function quietReachSignal(
  views: number | null | undefined,
  followers: number | null | undefined
): string | null {
  if (
    views == null ||
    followers == null ||
    !Number.isFinite(views) ||
    !Number.isFinite(followers) ||
    followers <= 0 ||
    views <= 0
  ) {
    return null;
  }
  return formatNicheSignal(views / followers);
}

export function QuietReelCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="line-clamp-2 min-h-[2.7em] text-[13px] font-semibold leading-snug text-[#f5f3f8]">
      {children}
    </p>
  );
}

export function QuietCreatorButton({
  handle,
  onOpen,
}: {
  handle: string | null | undefined;
  onOpen: () => void;
}) {
  const label = formatCreatorHandle(handle);
  if (!handle?.trim()) return null;
  return (
    <button
      type="button"
      className="w-fit text-left text-[12px] font-medium text-[#a8a3b3] hover:text-[#f5f3f8] hover:underline"
      title="Open creator in SpyReels"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {label}
    </button>
  );
}

export function QuietReelMetrics({
  views,
  engagementPct,
  reachViews,
  reachFollowers,
  postedAt,
}: {
  views?: number | null;
  engagementPct?: number | null;
  reachViews?: number | null;
  reachFollowers?: number | null;
  postedAt?: string | null;
}) {
  const viewLabel = formatCompactCount(views ?? null);
  const eng = formatAccountEngPct(engagementPct);
  const signal = quietReachSignal(reachViews ?? views, reachFollowers);
  const date = formatShortPostDate(postedAt);
  if (!viewLabel && !eng && !signal && !date) return null;

  return (
    <p className="text-[11px] leading-snug text-[#a8a3b3]">
      {viewLabel ? `${viewLabel} views` : null}
      {eng ? (
        <>
          {viewLabel ? " · " : null}
          {eng}
        </>
      ) : null}
      {signal ? (
        <>
          {viewLabel || eng ? " · " : null}
          <span className="font-semibold text-[#e8e4f0]">{signal}</span>
        </>
      ) : null}
      {date ? (
        <>
          {viewLabel || eng || signal ? " · " : null}
          {date}
        </>
      ) : null}
    </p>
  );
}

/** Quiet-card status chip when a remake already exists for this reel. */
export function QuietRemakeStatusChip({
  label,
}: {
  label: "Remaking…" | "Draft" | "Ready" | "Scheduled";
}) {
  const tone =
    label === "Remaking…"
      ? "border-[rgba(155,108,255,.35)] bg-[rgba(155,108,255,.14)] text-[#d7c7ff]"
      : label === "Scheduled"
        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
        : "border-[rgba(66,211,146,.35)] bg-[rgba(66,211,146,.12)] text-[#b7f0d0]";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

export function quietRemakeStatusFromState(args: {
  hookStage?: string | null;
  batchState?: "none" | "generating" | "ready" | "failed";
  hasSavedScript?: boolean;
  scheduled?: boolean;
}): "Remaking…" | "Draft" | "Ready" | "Scheduled" | null {
  if (args.hookStage === "transcribing" || args.hookStage === "generating" || args.batchState === "generating") {
    return "Remaking…";
  }
  if (args.scheduled) return "Scheduled";
  if (args.hookStage === "ready" || args.batchState === "ready") return "Ready";
  if (args.hasSavedScript) return "Draft";
  return null;
}

type QuietRemakeActionsProps = {
  remakeLabel: string;
  remakeDisabled?: boolean;
  remakeBusy?: boolean;
  onRemake: () => void;
  saved: boolean;
  onToggleSave: () => void;
  moreMenu?: React.ReactNode;
  moreOpen?: boolean;
  onToggleMore?: () => void;
};

/**
 * Soft Remake + star + optional kebab — matches approved Viral Posts HTML.
 */
export function QuietRemakeActions({
  remakeLabel,
  remakeDisabled,
  remakeBusy,
  onRemake,
  saved,
  onToggleSave,
  moreMenu,
  moreOpen,
  onToggleMore,
}: QuietRemakeActionsProps) {
  return (
    <div className="relative grid grid-cols-[1fr_auto_auto] gap-1.5">
      <Button
        type="button"
        variant="outline"
        disabled={remakeDisabled || remakeBusy}
        className="h-9 border-[#2b2739] bg-transparent px-2.5 text-[11px] font-semibold text-[#e8e2f4] hover:border-[rgba(155,108,255,.45)] hover:bg-[rgba(155,108,255,.08)] hover:text-white disabled:opacity-50"
        onClick={(e) => {
          e.stopPropagation();
          onRemake();
        }}
      >
        {remakeLabel}
      </Button>
      <button
        type="button"
        aria-label={saved ? "Remove from saved" : "Save reel"}
        title={saved ? "Saved" : "Save"}
        className={cn(
          "grid h-9 w-9 place-items-center rounded-[10px] border border-[#2b2739] bg-transparent text-[#a8a3b3] hover:border-[rgba(155,108,255,.4)] hover:text-[#f5f3f8]",
          saved && "border-[rgba(155,108,255,.4)] text-[#f5f3f8]"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSave();
        }}
      >
        <Star className={cn("h-3.5 w-3.5", saved && "fill-current")} />
      </button>
      {onToggleMore ? (
        <button
          type="button"
          aria-label="More options"
          aria-expanded={moreOpen}
          className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#2b2739] bg-transparent text-[#a8a3b3] hover:border-[rgba(155,108,255,.4)] hover:text-[#f5f3f8]"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMore();
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-9" aria-hidden />
      )}
      {moreMenu}
    </div>
  );
}
