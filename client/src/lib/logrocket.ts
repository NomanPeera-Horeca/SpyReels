/**
 * LogRocket session replay / bug finding.
 * Loaded via the official script tag so we can gate on env without a hard dependency.
 */

type LogRocketClient = {
  init: (appId: string, options?: Record<string, unknown>) => void;
  identify: (userId: string, traits?: Record<string, string | number | boolean | undefined>) => void;
};

declare global {
  interface Window {
    LogRocket?: LogRocketClient;
  }
}

let appIdReady: string | null = null;
let scriptLoading = false;
let pendingIdentify: {
  userId: string;
  traits?: Record<string, string | number | boolean | undefined>;
} | null = null;

function flushPendingIdentify(): void {
  if (!pendingIdentify || !window.LogRocket) return;
  window.LogRocket.identify(pendingIdentify.userId, pendingIdentify.traits);
  pendingIdentify = null;
}

export function initLogRocket(appId: string): void {
  if (typeof window === "undefined" || !appId) return;
  appIdReady = appId;

  if (window.LogRocket) {
    window.LogRocket.init(appId);
    flushPendingIdentify();
    return;
  }

  if (scriptLoading) return;
  scriptLoading = true;

  const script = document.createElement("script");
  script.src = "https://cdn.logr-in.com/LogRocket.min.js";
  script.crossOrigin = "anonymous";
  script.async = true;
  script.onload = () => {
    if (appIdReady && window.LogRocket) {
      window.LogRocket.init(appIdReady);
      flushPendingIdentify();
    }
  };
  document.head.appendChild(script);
}

export function identifyLogRocketUser(
  userId: string,
  traits?: { name?: string | null; email?: string | null }
): void {
  if (typeof window === "undefined") return;
  const payload = {
    name: traits?.name ?? undefined,
    email: traits?.email ?? undefined,
  };
  if (window.LogRocket) {
    window.LogRocket.identify(userId, payload);
    return;
  }
  pendingIdentify = { userId, traits: payload };
}
