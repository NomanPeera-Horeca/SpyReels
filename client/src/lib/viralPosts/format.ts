import type { ViralTrendStatus } from "@shared/viralPosts";

export function formatCompactCount(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${trimDecimal(m)}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${trimDecimal(k)}K`;
  }
  return String(Math.round(abs));
}

function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatFollowerCount(value: number | null | undefined): string | null {
  const c = formatCompactCount(value);
  return c ? `${c} followers` : null;
}

export function formatPostedAge(
  iso: string | null | undefined,
  ageHours?: number | null,
  now = Date.now()
): string | null {
  if (ageHours != null && Number.isFinite(ageHours)) {
    if (ageHours < 1) return "just now";
    if (ageHours < 24) return `${Math.floor(ageHours)}h ago`;
    const days = Math.floor(ageHours / 24);
    if (days === 1) return "1d ago";
    if (days < 30) return `${days}d ago`;
    return null;
  }
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const hours = Math.floor(Math.max(0, now - then) / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return null;
}

export function trendStatusLabel(status: ViralTrendStatus): string {
  switch (status) {
    case "rising-fast":
      return "Rising fast";
    case "breaking-out":
      return "Breaking out";
    case "proven-format":
      return "Proven format";
    case "saturated":
      return "Getting saturated";
    default:
      return "Unknown momentum";
  }
}

export function trendStatusClass(status: ViralTrendStatus): string {
  switch (status) {
    case "rising-fast":
      return "rising";
    case "breaking-out":
      return "breaking";
    case "proven-format":
      return "proven";
    case "saturated":
      return "saturated";
    default:
      return "unknown";
  }
}

export function whyFitBody(reason: string): string {
  return reason
    .replace(/^Matches your /i, "")
    .replace(/^Your audience /i, "Your audience ");
}

/** Engagement rate is stored as a 0-1 fraction. */
export function formatEngagementPct(
  rate: number | null | undefined
): string | null {
  if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
  const pct = rate <= 1 ? rate * 100 : rate;
  const rounded = Math.round(pct * 10) / 10;
  const label = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
  return `${label}% eng`;
}

/**
 * Relative performance cue for cards/drawer.
 * Uses reachMultiplier (views / followers) as the quiet "so what" signal.
 */
export function formatNicheSignal(
  reachMultiplier: number | null | undefined
): string | null {
  if (
    reachMultiplier == null ||
    !Number.isFinite(reachMultiplier) ||
    reachMultiplier <= 0
  ) {
    return null;
  }
  const rounded = Math.round(reachMultiplier * 10) / 10;
  const label = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
  return `${label}x niche avg`;
}

export function formatShortPostDate(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function viralPostCreatorProfileUrl(post: {
  platform: "instagram" | "tiktok" | "youtube";
  creatorHandle?: string | null;
}): string | null {
  const raw = (post.creatorHandle || "").replace(/^@/, "").trim();
  if (!raw) return null;
  if (post.platform === "tiktok") {
    return `https://www.tiktok.com/@${encodeURIComponent(raw)}`;
  }
  if (post.platform === "youtube") return null;
  return `https://www.instagram.com/${encodeURIComponent(raw)}/`;
}

export function whyItWorksBullets(post: {
  hookMechanism?: string | null;
  format?: string | null;
  adaptabilityReason?: string | null;
  trendStatus?: ViralTrendStatus | null;
}): string[] {
  const bullets: string[] = [];
  if (post.hookMechanism?.trim()) bullets.push(post.hookMechanism.trim());
  if (post.format?.trim()) bullets.push(`${post.format.trim()} format`);
  if (post.adaptabilityReason?.trim()) {
    bullets.push(post.adaptabilityReason.trim());
  }
  if (
    bullets.length === 0 &&
    post.trendStatus &&
    post.trendStatus !== "unknown"
  ) {
    bullets.push(trendStatusLabel(post.trendStatus));
  }
  if (bullets.length === 0) {
    bullets.push("Clear hook and structure worth remaking in your voice");
  }
  return bullets.slice(0, 4);
}

export function formatCreatorHandle(handle: string | null | undefined): string {
  const raw = (handle || "").trim();
  if (!raw) return "Unknown creator";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

/** Local calendar date YYYY-MM-DD for the user's browser timezone. */
export function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Human label for a YYYY-MM-DD feed day, e.g. "March 28, 2026". */
export function formatFeedLocalDate(localDate: string): string {
  const parts = localDate.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return localDate;
  const date = new Date(y, m - 1, d);
  if (!Number.isFinite(date.getTime())) return localDate;
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
