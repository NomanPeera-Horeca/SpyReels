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
import { registerSW } from "virtual:pwa-register";

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

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
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
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

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

createRoot(document.getElementById("root")!).render(
  <PostHogProvider client={posthog}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </PostHogProvider>
);
