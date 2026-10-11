/**
 * Session flag: after signup/login on the B-roll landing page,
 * automatically retry the watermarked download once the preview is restored.
 */

export const BROLL_PENDING_DOWNLOAD_KEY = "spyreels:broll_pending_download";
export const BROLL_PENDING_DOWNLOAD_TTL_MS = 60 * 60 * 1000;

export function stashBrollPendingDownload(): void {
  try {
    sessionStorage.setItem(
      BROLL_PENDING_DOWNLOAD_KEY,
      JSON.stringify({ savedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function peekBrollPendingDownload(): boolean {
  try {
    const raw = sessionStorage.getItem(BROLL_PENDING_DOWNLOAD_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as { savedAt?: number };
    const savedAt = Number(data.savedAt);
    if (
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > BROLL_PENDING_DOWNLOAD_TTL_MS
    ) {
      sessionStorage.removeItem(BROLL_PENDING_DOWNLOAD_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearBrollPendingDownload(): void {
  try {
    sessionStorage.removeItem(BROLL_PENDING_DOWNLOAD_KEY);
  } catch {
    /* ignore */
  }
}
