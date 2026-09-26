import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { mergeRemakeability } from "@/lib/remakeability";
import { trpc } from "@/lib/trpc";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";

export type RemakeStage =
  | "idle"
  | "ingesting"
  | "transcribing"
  | "generating"
  | "ready"
  | "inspiration"
  | "error";

export type DiscoverRemakeState = {
  stage: RemakeStage;
  progressPercent: number;
  errorMessage?: string;
  reelId?: number;
  scriptId?: number;
};

export type DiscoverSaveState = "idle" | "saved" | "error";

export type ViralReelLike = {
  shortcode: string;
  reelUrl: string;
};

const POLL_MS = 2500;
const INGEST_MAX = 20;
const TRANSCRIBE_MAX = 60;
const GENERATE_MAX = 60;

const STAGE_FLOOR: Record<RemakeStage, number> = {
  idle: 0,
  ingesting: 0,
  transcribing: 25,
  generating: 65,
  ready: 100,
  inspiration: 100,
  error: 0,
};

const STAGE_CEILING: Record<RemakeStage, number> = {
  idle: 0,
  ingesting: 25,
  transcribing: 65,
  generating: 95,
  ready: 100,
  inspiration: 100,
  error: 0,
};

function easedPercent(stage: RemakeStage, attempt: number, maxAttempts: number): number {
  const floor = STAGE_FLOOR[stage];
  const ceiling = STAGE_CEILING[stage];
  if (maxAttempts <= 0) return floor;
  const span = ceiling - floor - 1;
  const eased = floor + Math.round((Math.min(attempt, maxAttempts) / maxAttempts) * span);
  return Math.min(ceiling - 1, Math.max(floor, eased));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type IngestTranscribeDeps = {
  addByUrl: (url: string) => Promise<{ id: number; duplicate: boolean }>;
  transcribe: (collectedReelId: number) => Promise<{
    reelId: number;
    status: "completed" | "processing" | "failed";
  }>;
  fetchCollectedList: () => Promise<Array<{ id: number; status: string }>>;
  fetchTranscribeStatus: (
    reelId: number
  ) => Promise<{
    status: string;
    transcript?: string | null;
    segments?: unknown;
  } | null>;
  isCancelled: () => boolean;
  onProgress?: (patch: Partial<DiscoverRemakeState> & { stage: RemakeStage }) => void;
};

function isTranscriptionReadyForRecreate(
  tx: { status: string; transcript?: string | null } | null | undefined
): boolean {
  return tx?.status === "completed" && Boolean(String(tx.transcript ?? "").trim());
}

async function waitForTranscriptionReady(
  reelId: number,
  deps: Pick<IngestTranscribeDeps, "fetchTranscribeStatus" | "isCancelled">,
  onProgress?: (attempt: number) => void
): Promise<void> {
  for (let attempt = 1; attempt <= TRANSCRIBE_MAX; attempt++) {
    if (deps.isCancelled()) return;
    onProgress?.(attempt);
    const tx = await deps.fetchTranscribeStatus(reelId);
    if (isTranscriptionReadyForRecreate(tx)) return;
    if (tx?.status === "completed" && !String(tx.transcript ?? "").trim()) {
      throw new Error(
        "No voice detected on this reel. Pick one with narration to remake."
      );
    }
    if (tx?.status === "failed") {
      throw new Error("Transcription failed. Try again.");
    }
    if (attempt < TRANSCRIBE_MAX) await sleep(POLL_MS);
  }
  throw new Error("Transcription timed out. Try again.");
}

/** Ingest via collected.addByUrl, then transcribe; returns DB reelId. */
export async function runDiscoverIngestAndTranscribe(
  reel: ViralReelLike,
  deps: IngestTranscribeDeps
): Promise<number> {
  deps.onProgress?.({ stage: "ingesting", progressPercent: 5, errorMessage: undefined });

  const addResult = await deps.addByUrl(reel.reelUrl);
  if (deps.isCancelled()) throw new Error("Cancelled");

  const collectedReelId = addResult.id;

  let ingestReady = false;
  for (let attempt = 1; attempt <= INGEST_MAX; attempt++) {
    if (deps.isCancelled()) throw new Error("Cancelled");
    deps.onProgress?.({
      stage: "ingesting",
      progressPercent: easedPercent("ingesting", attempt, INGEST_MAX),
    });

    const list = await deps.fetchCollectedList();
    const row = list.find((r) => r.id === collectedReelId);
    if (row?.status === "ready") {
      ingestReady = true;
      break;
    }
    if (row?.status === "failed") {
      throw new Error("Reel ingest failed. Try again.");
    }
    if (attempt < INGEST_MAX) await sleep(POLL_MS);
  }

  if (!ingestReady) {
    throw new Error("Reel ingest timed out. Try again.");
  }

  deps.onProgress?.({ stage: "transcribing", progressPercent: 25 });

  const transcribeResult = await deps.transcribe(collectedReelId);
  if (deps.isCancelled()) throw new Error("Cancelled");

  if (transcribeResult.status === "failed") {
    throw new Error(
      "No captions available for this video. Pick one with spoken audio to remake."
    );
  }

  const reelId = transcribeResult.reelId;
  await waitForTranscriptionReady(reelId, deps, (attempt) => {
    deps.onProgress?.({
      stage: "transcribing",
      progressPercent: easedPercent("transcribing", attempt, TRANSCRIBE_MAX),
      reelId,
    });
  });

  deps.onProgress?.({ stage: "transcribing", progressPercent: 64, reelId });
  return reelId;
}

export function useDiscoverRemakeChain() {
  const trpcUtils = trpc.useUtils();
  const addByUrlMutation = trpc.collected.addByUrl.useMutation();
  const transcribeMutation = trpc.collected.transcribe.useMutation();
  const generateMutation = trpc.recreate.generate.useMutation();
  const toggleSaveMutation = trpc.saved.toggle.useMutation();
  const [stateByShortcode, setStateByShortcode] = useState<
    Record<string, DiscoverRemakeState>
  >({});
  const [saveStateByShortcode, setSaveStateByShortcode] = useState<
    Record<string, DiscoverSaveState>
  >({});
  const runningRef = useRef<Set<string>>(new Set());
  const saveRunningRef = useRef<Set<string>>(new Set());
  const cancelledRef = useRef<Set<string>>(new Set());

  const patchState = useCallback(
    (shortcode: string, patch: Partial<DiscoverRemakeState> & { stage: RemakeStage }) => {
      setStateByShortcode((prev) => ({
        ...prev,
        [shortcode]: {
          ...(prev[shortcode] ?? { stage: "idle" as RemakeStage, progressPercent: 0 }),
          ...patch,
        },
      }));
    },
    []
  );

  const failRemake = useCallback(
    (shortcode: string, message: string) => {
      runningRef.current.delete(shortcode);
      patchState(shortcode, {
        stage: "error",
        progressPercent: 0,
        errorMessage: message,
      });
      toast.error(message);
    },
    [patchState]
  );

  const buildIngestDeps = useCallback(
    (shortcode: string): IngestTranscribeDeps => ({
      addByUrl: (url) => addByUrlMutation.mutateAsync({ url }),
      transcribe: (collectedReelId) => transcribeMutation.mutateAsync({ collectedReelId }),
      fetchCollectedList: () => trpcUtils.collected.list.fetch(),
      fetchTranscribeStatus: (reelId) => trpcUtils.transcribe.status.fetch({ reelId }),
      isCancelled: () => cancelledRef.current.has(shortcode),
      onProgress: (patch) => patchState(shortcode, patch),
    }),
    [addByUrlMutation, patchState, transcribeMutation, trpcUtils]
  );

  const resolveReelIdForSave = useCallback(
    async (reel: ViralReelLike, remakeState: DiscoverRemakeState | undefined): Promise<number> => {
      const shortcode = reel.shortcode;
      const deps = buildIngestDeps(shortcode);

      if (remakeState?.reelId != null) {
        const tx = await deps.fetchTranscribeStatus(remakeState.reelId);
        if (isTranscriptionReadyForRecreate(tx)) return remakeState.reelId;
        if (tx?.status === "processing") {
          await waitForTranscriptionReady(remakeState.reelId, deps);
          return remakeState.reelId;
        }
      }

      return runDiscoverIngestAndTranscribe(reel, deps);
    },
    [buildIngestDeps]
  );

  const runChain = useCallback(
    async (reel: ViralReelLike) => {
      const shortcode = reel.shortcode;
      if (runningRef.current.has(shortcode)) return;

      runningRef.current.add(shortcode);
      cancelledRef.current.delete(shortcode);

      try {
        const reelId = await runDiscoverIngestAndTranscribe(reel, buildIngestDeps(shortcode));
        if (cancelledRef.current.has(shortcode)) return;

        const tx = await trpcUtils.transcribe.status.fetch({ reelId });
        const remakeCheck = mergeRemakeability(
          tx
            ? {
                status: tx.status,
                transcript: tx.transcript,
                segments: tx.segments,
              }
            : null
        );
        if (remakeCheck.notRemakeable) {
          runningRef.current.delete(shortcode);
          patchState(shortcode, {
            stage: "inspiration",
            progressPercent: 100,
            reelId,
          });
          return;
        }

        patchState(shortcode, { stage: "generating", progressPercent: 65, reelId });

        const generateResult = await generateMutation.mutateAsync({
          reelId,
          gradeLevel: "auto",
        });
        if (cancelledRef.current.has(shortcode)) return;

        const scriptId = generateResult.scriptId;
        let scriptDone = false;

        for (let attempt = 1; !scriptDone && attempt <= GENERATE_MAX; attempt++) {
          if (cancelledRef.current.has(shortcode)) return;
          patchState(shortcode, {
            stage: "generating",
            progressPercent: easedPercent("generating", attempt, GENERATE_MAX),
            reelId,
            scriptId,
          });

          const scriptStatus = await trpcUtils.recreate.status.fetch({ scriptId });
          if (scriptStatus?.status === "completed") {
            scriptDone = true;
            break;
          }
          if (scriptStatus?.status === "failed") {
            throw new Error(
              formatIdeaScriptErrorForUser(
                scriptStatus.errorMessage?.trim() || "Script generation failed. Try again.",
                "remake"
              )
            );
          }
          if (attempt < GENERATE_MAX) await sleep(POLL_MS);
        }

        if (!scriptDone) {
          throw new Error("Script generation timed out. Try again.");
        }

        runningRef.current.delete(shortcode);
        patchState(shortcode, {
          stage: "ready",
          progressPercent: 100,
          reelId,
          scriptId,
        });
      } catch (err) {
        if (cancelledRef.current.has(shortcode)) return;
        failRemake(shortcode, formatIdeaScriptErrorForUser(err, "remake"));
      }
    },
    [buildIngestDeps, failRemake, generateMutation, patchState, trpcUtils]
  );

  const startRemake = useCallback(
    (reel: ViralReelLike) => {
      const shortcode = reel.shortcode;
      const current = stateByShortcode[shortcode];
      if (
        current?.stage === "ingesting" ||
        current?.stage === "transcribing" ||
        current?.stage === "generating"
      ) {
        return;
      }
      if (current?.stage === "inspiration") return;
      if (current?.stage === "ready" && current.reelId != null && current.scriptId != null) {
        return;
      }
      void runChain(reel);
    },
    [runChain, stateByShortcode]
  );

  const retryRemake = useCallback(
    (reel: ViralReelLike) => {
      void runChain(reel);
    },
    [runChain]
  );

  const startSave = useCallback(
    async (reel: ViralReelLike) => {
      const shortcode = reel.shortcode;
      if (saveStateByShortcode[shortcode] === "saved") return;
      if (saveRunningRef.current.has(shortcode)) return;

      saveRunningRef.current.add(shortcode);
      setSaveStateByShortcode((prev) => ({ ...prev, [shortcode]: "saved" }));

      try {
        const remakeState = stateByShortcode[shortcode];
        const reelId = await resolveReelIdForSave(reel, remakeState);
        const existing = await trpcUtils.saved.check.fetch({ reelId });
        if (!existing.saved) {
          const result = await toggleSaveMutation.mutateAsync({ reelId, jobId: 0 });
          if (!result.saved) {
            throw new Error("Could not save reel. Try again.");
          }
        }
        void trpcUtils.saved.list.invalidate();
        setSaveStateByShortcode((prev) => ({ ...prev, [shortcode]: "saved" }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not save reel. Try again.";
        setSaveStateByShortcode((prev) => ({ ...prev, [shortcode]: "error" }));
        toast.error(message);
      } finally {
        saveRunningRef.current.delete(shortcode);
      }
    },
    [
      resolveReelIdForSave,
      saveStateByShortcode,
      stateByShortcode,
      toggleSaveMutation,
      trpcUtils,
    ]
  );

  const getRemakeState = useCallback(
    (shortcode: string): DiscoverRemakeState => {
      return (
        stateByShortcode[shortcode] ?? {
          stage: "idle",
          progressPercent: 0,
        }
      );
    },
    [stateByShortcode]
  );

  const getSaveState = useCallback(
    (shortcode: string): DiscoverSaveState => {
      return saveStateByShortcode[shortcode] ?? "idle";
    },
    [saveStateByShortcode]
  );

  useEffect(() => {
    return () => {
      for (const sc of runningRef.current) {
        cancelledRef.current.add(sc);
      }
      runningRef.current.clear();
    };
  }, []);

  return {
    getRemakeState,
    getSaveState,
    startRemake,
    retryRemake,
    startSave,
  };
}

export function remakeButtonLabel(state: DiscoverRemakeState): string {
  const pct = state.progressPercent;
  switch (state.stage) {
    case "ingesting":
      return `Ingesting… ${pct}%`;
    case "transcribing":
      return `Transcribing… ${pct}%`;
    case "generating":
      return `Generating… ${pct}%`;
    case "inspiration":
      return "Save for inspiration";
    case "ready":
      return "Open remake";
    case "error":
      return "Retry";
    default:
      return "Remake";
  }
}
