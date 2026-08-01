let activeScrapes = 0;

/** Tunable process-local cap on simultaneous Instagram scrapes (OOM guard). */
export const MAX_CONCURRENT_SCRAPES = 3;

export function getActiveScrapes(): number {
  return activeScrapes;
}

/** Atomic take-or-fail (no wait). Prefer this at scrape.start so we never queue. */
export function tryAcquireScrapeSlot(): boolean {
  if (activeScrapes >= MAX_CONCURRENT_SCRAPES) return false;
  activeScrapes++;
  return true;
}

export async function acquireScrapeSlot(): Promise<void> {
  while (activeScrapes >= MAX_CONCURRENT_SCRAPES) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  activeScrapes++;
}

export function releaseScrapeSlot(): void {
  activeScrapes--;
}
