const DISMISS_KEY = "spyreels:pwa-install-dismissed";

export type PwaInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: PwaInstallPromptEvent | null = null;

export function getDeferredPwaInstallPrompt(): PwaInstallPromptEvent | null {
  return deferredPrompt;
}

export function clearDeferredPwaInstallPrompt(): void {
  deferredPrompt = null;
}

export function isPwaInstallDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPwaInstallPrompt(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function subscribeToPwaInstallPrompt(
  onAvailable: (event: PwaInstallPromptEvent) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as PwaInstallPromptEvent;
    onAvailable(deferredPrompt);
  };

  const onInstalled = () => {
    deferredPrompt = null;
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);

  return () => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}
