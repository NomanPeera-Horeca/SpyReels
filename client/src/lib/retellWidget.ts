/**
 * Retell website widget (chat / optional voice) for public marketing pages.
 * Credentials are public-key scoped; never put the Retell secret API key in Vite env.
 */

const MARKETING_EXACT = new Set([
  "/pricing",
  "/blog",
  "/free-tools",
  "/about",
  "/contact",
  "/affiliate",
  "/extension",
  "/terms",
  "/privacy",
]);

const MARKETING_PREFIXES = ["/blog/", "/free-tools/", "/features/"];

export type RetellWidgetConfig = {
  publicKey: string;
  chatAgentId: string;
  voiceAgentId?: string;
  voicePublicKey?: string;
};

export function getRetellWidgetConfig(): RetellWidgetConfig | null {
  const publicKey = import.meta.env.VITE_PUBLIC_RETELL_PUBLIC_KEY?.trim();
  const chatAgentId = import.meta.env.VITE_PUBLIC_RETELL_CHAT_AGENT_ID?.trim();
  if (!publicKey || !chatAgentId) return null;

  const voiceAgentId =
    import.meta.env.VITE_PUBLIC_RETELL_VOICE_AGENT_ID?.trim() || undefined;
  const voicePublicKey =
    import.meta.env.VITE_PUBLIC_RETELL_VOICE_PUBLIC_KEY?.trim() || undefined;

  return { publicKey, chatAgentId, voiceAgentId, voicePublicKey };
}

/** Home (logged out) + marketing LPs; never authenticated app surfaces. */
export function shouldMountRetellWidget(
  pathname: string,
  isLoggedIn: boolean
): boolean {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";

  if (path === "/") {
    return !isLoggedIn;
  }

  if (MARKETING_EXACT.has(path)) return true;
  return MARKETING_PREFIXES.some((prefix) => path.startsWith(prefix));
}
