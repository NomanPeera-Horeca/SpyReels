import type { PostHog } from "posthog-js";

/**
 * Captures failed script/link/img loads and dynamic-import / chunk failures to PostHog
 * so we can measure how often "CSS never applied" / broken layout sessions occur.
 */
export function installClientLoadFailureReporting(posthog: PostHog | null): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const capture = (event: string, props: Record<string, unknown>) => {
    try {
      posthog?.capture(event, props);
    } catch {
      /* ignore */
    }
  };

  const onError = (ev: ErrorEvent) => {
    const t = ev.target;
    if (t && t !== window && t instanceof HTMLElement) {
      const tag = t.tagName;
      if (tag === "SCRIPT" || tag === "LINK" || tag === "IMG" || tag === "VIDEO") {
        const props: Record<string, unknown> = { tag };
        if (tag === "IMG" && (t as HTMLImageElement).src) {
          props.src = String((t as HTMLImageElement).src).slice(0, 240);
        }
        if (tag === "SCRIPT" && (t as HTMLScriptElement).src) {
          props.src = String((t as HTMLScriptElement).src).slice(0, 240);
        }
        if (tag === "LINK" && (t as HTMLLinkElement).href) {
          props.href = String((t as HTMLLinkElement).href).slice(0, 240);
        }
        if (tag === "VIDEO" && (t as HTMLVideoElement).src) {
          props.src = String((t as HTMLVideoElement).src).slice(0, 240);
        }
        capture("client_resource_load_error", props);
      }
    }
    const msg = ev.message ?? "";
    if (/ChunkLoadError|dynamically imported module|Failed to fetch dynamically/i.test(msg)) {
      capture("client_chunk_load_error", { message: msg.slice(0, 320) });
    }
  };

  const onRejection = (ev: PromiseRejectionEvent) => {
    const reason = String((ev.reason as Error)?.message ?? ev.reason ?? "");
    if (/ChunkLoadError|dynamically imported module|Importing a module script failed/i.test(reason)) {
      capture("client_dynamic_import_failed", { reason: reason.slice(0, 400) });
    }
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
