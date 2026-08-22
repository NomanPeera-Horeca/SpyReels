import type { ViralTrendStatus } from "./types";

export function formatCompactCount(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "0";
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

export function formatFollowerCount(value: number | undefined): string {
  return `${formatCompactCount(value)} followers`;
}

export function formatPostedAge(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const diffMs = Math.max(0, now - then);
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
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
      return "Rising fast";
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
      return "rising";
  }
}

export function whyFitBody(reason: string): string {
  return reason
    .replace(/^Matches your /i, "")
    .replace(/^Your audience /i, "Your audience ");
}

export function renderHookWithHighlight(
  hook: string,
  highlight?: string
): { before: string; highlight: string; after: string } | null {
  if (!highlight) return null;
  const idx = hook.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx < 0) return null;
  return {
    before: hook.slice(0, idx),
    highlight: hook.slice(idx, idx + highlight.length),
    after: hook.slice(idx + highlight.length),
  };
}
