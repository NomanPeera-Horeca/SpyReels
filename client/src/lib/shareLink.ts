/**
 * Share a video link (owner decision: the original video link, so it opens for
 * anyone without a SpyReels account).
 * - Phones and browsers with a share sheet: the device's own sheet.
 * - Otherwise the card shows Copy link, WhatsApp, Email and Text message.
 */
export type ShareTarget = "copy" | "whatsapp" | "email" | "sms";

export type SharePayload = { url: string; title: string };

/** True when this browser can open the device's share sheet for a link. */
export function canUseNativeShare(nav: Partial<Navigator> | undefined = globalThis.navigator): boolean {
  if (!nav || typeof nav.share !== "function") return false;
  try {
    return typeof nav.canShare === "function" ? nav.canShare({ url: "https://example.com" }) : true;
  } catch {
    return false;
  }
}

/** Link that opens WhatsApp, the mail app or Messages with the text filled in. Pure. */
export function shareTargetHref(target: Exclude<ShareTarget, "copy">, p: SharePayload): string {
  const text = p.title ? `${p.title}\n${p.url}` : p.url;
  if (target === "whatsapp") return `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (target === "email") {
    return `mailto:?subject=${encodeURIComponent(p.title || "A video for you")}&body=${encodeURIComponent(text)}`;
  }
  // "sms:?&body=" works on both iOS and Android.
  return `sms:?&body=${encodeURIComponent(text)}`;
}

/**
 * Opens the device's share sheet. Resolves "shared", "cancelled" (the person
 * closed the sheet) or "unavailable" (show the share menu instead). Never throws.
 */
export async function shareNatively(
  p: SharePayload,
  nav: Partial<Navigator> | undefined = globalThis.navigator
): Promise<"shared" | "cancelled" | "unavailable"> {
  if (!canUseNativeShare(nav)) return "unavailable";
  try {
    await nav!.share!({ title: p.title, url: p.url });
    return "shared";
  } catch (err) {
    return err instanceof Error && err.name === "AbortError" ? "cancelled" : "unavailable";
  }
}

/** Copies the link. False when the browser refuses (e.g. no permission). Never throws. */
export async function copyLink(url: string, nav: Partial<Navigator> | undefined = globalThis.navigator): Promise<boolean> {
  try {
    if (!nav?.clipboard?.writeText) return false;
    await nav.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
