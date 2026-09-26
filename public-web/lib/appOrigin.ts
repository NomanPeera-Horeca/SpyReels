/**
 * Canonical SpyReels app origin for public-web handoffs and upstream API calls.
 * Production is apex https://spyreels.ai — app.spyreels.ai has no DNS (NXDOMAIN).
 */
const CANONICAL = "https://spyreels.ai";

function normalizeOrigin(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "app.spyreels.ai") return CANONICAL;
    if (host === "spyreels.ai") return CANONICAL;
    return `${url.protocol}//${url.host}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Browser-safe origin for auth / research handoffs. */
export function resolvePublicAppOrigin(opts?: {
  configured?: string | null;
  hostname?: string | null;
}): string {
  const host = (opts?.hostname ?? "").replace(/^www\./, "").toLowerCase();
  if (host === "spyreels.ai") return CANONICAL;

  return (
    normalizeOrigin(opts?.configured) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN) ??
    CANONICAL
  );
}

/** Server-side origin for proxying to the main SpyReels API. */
export function resolveServerAppOrigin(): string {
  return (
    normalizeOrigin(process.env.SPYREELS_APP_ORIGIN) ??
    normalizeOrigin(process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN) ??
    CANONICAL
  );
}
