/**
 * Microsoft Clarity (session recordings / heatmaps).
 * Loaded via the official tag snippet so we can gate on env without a hard dependency.
 * Inputs are masked by Clarity by default.
 */

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

export function initClarity(projectId: string): void {
  if (typeof window === "undefined" || !projectId) return;
  if (window.clarity) return;

  (function (
    c: Window,
    l: Document,
    a: "clarity",
    r: "script",
    i: string
  ) {
    const clarityFn: ClarityFn = function (...args: unknown[]) {
      (clarityFn.q = clarityFn.q || []).push(args);
    };
    c[a] = clarityFn;
    const t = l.createElement(r);
    t.async = true;
    t.src = "https://www.clarity.ms/tag/" + i;
    const y = l.getElementsByTagName(r)[0];
    y?.parentNode?.insertBefore(t, y);
  })(window, document, "clarity", "script", projectId);
}

export function identifyClarityUser(
  userId: string,
  friendlyName?: string | null
): void {
  if (typeof window === "undefined" || !window.clarity) return;
  // identify(customId, customSessionId?, customPageId?, friendlyName?)
  window.clarity("identify", userId, undefined, undefined, friendlyName ?? undefined);
}
