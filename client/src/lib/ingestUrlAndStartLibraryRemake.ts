import type { StartRemakeOptions } from "@/hooks/useLibraryRemakeChain";
import { libraryRemakeKey, type LibraryRemakeSource } from "@/lib/libraryRemakeChainCore";
import type { RemakeIntentMedia } from "@/lib/remakeIntent";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type IngestCollectedRemakeDeps = {
  addByUrl: (url: string) => Promise<{ id: number; duplicate: boolean }>;
  fetchCollectedList: () => Promise<
    Array<{ id: number; status: string; errorMessage?: string | null }>
  >;
  startRemake: (source: LibraryRemakeSource, opts?: StartRemakeOptions) => void;
  /** Source preview captured before ingest so RemakeIntentDialog still has media after polling. */
  media?: RemakeIntentMedia | null;
  maxAttempts?: number;
  pollMs?: number;
  /**
   * The library video this link is, when Remake should go straight from the
   * library (REMAKE_LIBRARY_SOURCE=on). Null keeps the Collected Reels path.
   */
  resolveLibraryCandidateId?: () => Promise<number | null>;
};

export type IngestRemakeResult = {
  source: LibraryRemakeSource;
  remakeKey: string;
  /** Set only on the Collected Reels path. */
  collectedReelId: number | null;
};

/**
 * Shared Remake entry for URL-based surfaces (Home, Viral Posts, Agent, Discovery).
 * A library video (when the library route is on) starts straight from the
 * library, with no copy in Collected Reels. Anything else is ingested into
 * Collected Reels, waits until ready, then starts the Collected remake chain.
 */
export async function ingestUrlAndStartLibraryRemake(
  url: string,
  deps: IngestCollectedRemakeDeps
): Promise<IngestRemakeResult> {
  const pasteUrl = url.trim();
  if (!pasteUrl) {
    throw new Error("Missing video URL to remake.");
  }

  const libraryCandidateId = deps.resolveLibraryCandidateId
    ? await deps.resolveLibraryCandidateId().catch(() => null)
    : null;
  if (libraryCandidateId != null) {
    const source: LibraryRemakeSource = { source: "library", libraryCandidateId };
    deps.startRemake(source, deps.media ? { media: deps.media } : undefined);
    return { source, remakeKey: libraryRemakeKey(source), collectedReelId: null };
  }

  const added = await deps.addByUrl(pasteUrl);
  const maxAttempts = deps.maxAttempts ?? 40;
  const pollMs = deps.pollMs ?? 1500;
  let ready = false;

  for (let i = 0; i < maxAttempts; i++) {
    const list = await deps.fetchCollectedList();
    const row = list.find((r) => r.id === added.id);
    if (row?.status === "ready") {
      ready = true;
      break;
    }
    if (row?.status === "failed") {
      throw new Error(
        row.errorMessage?.trim() ||
          "Could not load that video into your library. Check it is public and try again."
      );
    }
    await sleep(pollMs);
  }

  if (!ready) {
    throw new Error(
      "Timed out waiting for video metadata. Try again from Collected Reels."
    );
  }

  const source: LibraryRemakeSource = {
    source: "collected",
    collectedReelId: added.id,
  };
  const remakeKey = libraryRemakeKey(source);
  deps.startRemake(source, deps.media ? { media: deps.media } : undefined);
  return { source, collectedReelId: added.id, remakeKey };
}
