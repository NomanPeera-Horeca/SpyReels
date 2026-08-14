import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { SPYREELS_LOGO_URL } from "@/lib/brandAssets";
import { isNativeApp } from "@/lib/nativeApp";
import {
  getRetellWidgetConfig,
  shouldMountRetellWidget,
} from "@/lib/retellWidget";

const SCRIPT_ID = "retell-widget";
const SCRIPT_SRC = "https://dashboard.retellai.com/retell-widget-v2.js";

function removeRetellDom(): void {
  document.getElementById(SCRIPT_ID)?.remove();
  document
    .querySelectorAll(
      "[id^='retell'], [class*='retell-widget'], [data-retell-widget]"
    )
    .forEach((el) => {
      if (el.id === SCRIPT_ID) return;
      el.remove();
    });
}

function injectRetellScript(): void {
  if (document.getElementById(SCRIPT_ID)) return;

  const config = getRetellWidgetConfig();
  if (!config) return;

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = SCRIPT_SRC;
  script.type = "module";
  script.setAttribute("data-public-key", config.publicKey);
  script.setAttribute("data-agent-id", config.chatAgentId);

  if (config.voiceAgentId) {
    script.setAttribute("data-voice-agent-id", config.voiceAgentId);
    script.setAttribute(
      "data-voice-public-key",
      config.voicePublicKey || config.publicKey
    );
  }

  script.setAttribute("data-title", "SpyReels Support");
  script.setAttribute("data-bot-name", "SpyReels");
  script.setAttribute("data-fab-text", "Need help?");
  script.setAttribute(
    "data-popup-message",
    "Questions about SpyReels? Chat with us."
  );
  script.setAttribute("data-show-ai-popup", "true");
  script.setAttribute("data-show-ai-popup-time", "8");
  script.setAttribute("data-auto-open", "false");
  script.setAttribute("data-theme-color", "#0f0a1a");
  script.setAttribute("data-component-color", "#7c3aed");
  script.setAttribute("data-color", "#7c3aed");
  script.setAttribute("data-logo-url", SPYREELS_LOGO_URL);

  document.body.appendChild(script);
}

/**
 * Loads the Retell chat widget on marketing / landing pages only.
 * Requires VITE_PUBLIC_RETELL_PUBLIC_KEY + VITE_PUBLIC_RETELL_CHAT_AGENT_ID.
 */
export function RetellChatWidget() {
  const [pathname] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (isNativeApp() || !getRetellWidgetConfig()) {
      removeRetellDom();
      return;
    }
    if (loading) return;

    if (!shouldMountRetellWidget(pathname, Boolean(user))) {
      removeRetellDom();
      return;
    }

    injectRetellScript();
  }, [pathname, user, loading]);

  useEffect(() => {
    return () => {
      removeRetellDom();
    };
  }, []);

  return null;
}
