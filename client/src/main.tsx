import { getCurrentWorkspaceId, trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { captureUtmsFromLocation } from "./utils/utm-capture";
import { getLoginUrl } from "./const";
import "./index.css";
import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";
import { installClientLoadFailureReporting } from "./utils/clientLoadFailureReporting";
import { resolveAppUrl, isNativeApp } from "@/lib/nativeApp";
import { initClarity } from "@/lib/clarity";
import { registerSW } from "virtual:pwa-register";

const clarityProjectId = import.meta.env.VITE_PUBLIC_CLARITY_PROJECT_ID;
if (clarityProjectId && !isNativeApp()) {
  initClarity(clarityProjectId);
}

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2026-01-30",
  capture_exceptions: true,
  session_recording: {
    maskAllInputs: false,
    maskInputOptions: {
      password: true,
      email: true,
    },
  },
});

if (import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN) {
  installClientLoadFailureReporting(posthog);
}

captureUtmsFromLocation();

if (import.meta.env.PROD && !isNativeApp()) {
  registerSW({ immediate: true });
  window.addEventListener("appinstalled", () => {
    posthog.capture("pwa_installed", { method: "appinstalled_event" });
  });
}

void (async () => {
  if (!isNativeApp()) return;
  const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
  ]);
  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* ignore */
  }
  try {
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
})();

document.getElementById("seo-crawler-snapshot")?.remove();

const queryClient = new QueryClient();

let redirectingToLogin = false;
let confirmingSession = false;

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: resolveAppUrl("/api/trpc"),
      transformer: superjson,
      fetch(input, init) {
        const headers = new Headers(init?.headers);
        const workspaceId = getCurrentWorkspaceId();
        if (workspaceId) {
          headers.set("x-workspace-id", workspaceId);
        }
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          headers,
        });
      },
    }),
  ],
});

/**
 * Only hard-redirect to Google when the session is actually gone.
 * Studio fires many protected calls (script generate/refine + 60s heartbeats).
 * A single transient UNAUTHORIZED must not wipe in-progress work.
 */
const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (redirectingToLogin || confirmingSession) return;

  const code = error.data?.code;
  const isUnauthorized =
    code === "UNAUTHORIZED" || error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  confirmingSession = true;
  void (async () => {
    try {
      const me = await trpcClient.auth.me.query();
      if (me) {
        console.warn(
          "[Auth] UNAUTHORIZED from an API call but session cookie is still valid; not redirecting"
        );
        return;
      }

      redirectingToLogin = true;
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.href = getLoginUrl({
        returnTo: returnTo.startsWith("/") ? returnTo : "/studio",
      });
    } catch (confirmError) {
      console.error("[Auth] Session confirm failed; redirecting to login", confirmError);
      redirectingToLogin = true;
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.href = getLoginUrl({
        returnTo: returnTo.startsWith("/") ? returnTo : "/studio",
      });
    } finally {
      confirmingSession = false;
    }
  })();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    const path = event.mutation.options.mutationKey?.[0];
    const procedure =
      Array.isArray(path) && typeof path[0] === "string" && typeof path[1] === "string"
        ? `${path[0]}.${path[1]}`
        : "";
    // Heartbeat is analytics only; never treat its failures as a logout signal.
    if (procedure === "activity.recordHeartbeat") {
      console.warn("[API Mutation Error] activity.recordHeartbeat (ignored for auth redirect)", error);
      return;
    }
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

createRoot(document.getElementById("root")!).render(
  <PostHogProvider client={posthog}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </PostHogProvider>
);
