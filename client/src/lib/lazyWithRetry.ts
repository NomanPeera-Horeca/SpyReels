import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "chunk-reload-attempted";

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

/**
 * Drop-in for React.lazy that auto-reloads once on stale-chunk import failures
 * (common after deploys when Vite emptyOutDir removes hashed assets still
 * referenced by open tabs).
 *
 * One-shot flow:
 * 1. Chunk load fails -> set sessionStorage flag, reload once
 * 2. Import succeeds after reload -> clear flag (ready for next deploy)
 * 3. Chunk still fails with flag set -> rethrow to ErrorBoundary (no loop)
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await importFn();
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // sessionStorage may be unavailable (private mode / blocked)
      }
      return module;
    } catch (error) {
      if (isChunkLoadError(error)) {
        let alreadyAttempted = false;
        try {
          alreadyAttempted = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
        } catch {
          // If we cannot read storage, fall through and rethrow
        }

        if (!alreadyAttempted) {
          try {
            sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
          } catch {
            // Still attempt reload; worst case ErrorBoundary handles next failure
          }
          window.location.reload();
          // Never resolve so React does not paint an error UI mid-reload
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    }
  });
}
