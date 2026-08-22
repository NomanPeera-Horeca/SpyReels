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

/** Local calendar date YYYY-MM-DD for the user's browser timezone. */
export function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
