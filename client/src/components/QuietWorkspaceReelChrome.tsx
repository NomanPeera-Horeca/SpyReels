import {
  formatCompactCount,
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

/** Same facts as QuietReelMetrics, as plain parts for the Result Card metrics line. Pure. */
export function quietReelMetricParts(m: {
  views?: number | null;
  engagementPct?: number | null;
  reachViews?: number | null;
  reachFollowers?: number | null;
  postedAt?: string | null;
}): string[] {
  const viewLabel = formatCompactCount(m.views ?? null);
  const eng = formatAccountEngPct(m.engagementPct);
  const signal = quietReachSignal(m.reachViews ?? m.views, m.reachFollowers);
  const date = formatShortPostDate(m.postedAt);
  return [
    ...(viewLabel ? [`${viewLabel} views`] : []),
    ...(eng ? [eng] : []),
    ...(signal ? [signal] : []),
    ...(date ? [date] : []),
  ];
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
