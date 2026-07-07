import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useMobile";
import { isNativeApp, isPwaStandalone } from "@/lib/nativeApp";
import {
  clearDeferredPwaInstallPrompt,
  dismissPwaInstallPrompt,
  getDeferredPwaInstallPrompt,
  isIosSafari,
  isPwaInstallDismissed,
  subscribeToPwaInstallPrompt,
  type PwaInstallPromptEvent,
} from "@/lib/pwaInstall";

export function PwaInstallBanner() {
  const posthog = usePostHog();
  const isMobile = useIsMobile();
  const [canInstall, setCanInstall] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(() => isPwaInstallDismissed());

  useEffect(() => {
    if (!isMobile || isNativeApp() || isPwaStandalone() || hidden) return;

    const existing = getDeferredPwaInstallPrompt();
    if (existing) {
      setCanInstall(true);
      posthog?.capture("pwa_install_prompted", { platform: "chromium" });
    }

    if (isIosSafari()) {
      setShowIosHint(true);
      posthog?.capture("pwa_install_prompted", { platform: "ios_safari" });
    }

    return subscribeToPwaInstallPrompt((event: PwaInstallPromptEvent) => {
      setCanInstall(true);
      posthog?.capture("pwa_install_prompted", { platform: "chromium" });
    });
  }, [hidden, isMobile, posthog]);

  if (!isMobile || isNativeApp() || isPwaStandalone() || hidden) {
    return null;
  }

  if (!canInstall && !showIosHint) return null;

  const onDismiss = () => {
    dismissPwaInstallPrompt();
    setHidden(true);
    posthog?.capture("pwa_install_dismissed");
  };

  const onInstall = async () => {
    const prompt = getDeferredPwaInstallPrompt();
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    clearDeferredPwaInstallPrompt();
    setCanInstall(false);
    if (choice.outcome === "accepted") {
      posthog?.capture("pwa_installed", { method: "browser_prompt" });
      setHidden(true);
    } else {
      posthog?.capture("pwa_install_dismissed", { method: "browser_prompt" });
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-primary/25 bg-primary/10 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {showIosHint && !canInstall ? (
            <Share className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Install SpyReels on your phone</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {showIosHint && !canInstall
              ? "Tap Share, then Add to Home Screen for quick access to your 30-day plan and scripts on the go."
              : "Add SpyReels to your home screen for a full-screen app experience."}
          </p>
          {canInstall ? (
            <Button size="sm" className="mt-2 h-8" onClick={() => void onInstall()}>
              Install app
            </Button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground"
          aria-label="Dismiss install banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
