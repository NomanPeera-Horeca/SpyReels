import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export type RemakeStage =
  | "idle"
  | "ingesting"
  | "transcribing"
  | "generating"
  | "ready"
  | "error";

export type DiscoverRemakeState = {
  stage: RemakeStage;
  progressPercent: number;
  errorMessage?: string;
  reelId?: number;
  scriptId?: number;
};

type ViralReelLike = {
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
  error: 0,
};

const STAGE_CEILING: Record<RemakeStage, number> = {
  idle: 0,
  ingesting: 25,
  transcribing: 65,
  generating: 95,
  ready: 100,
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

export function useDiscoverRemakeChain() {
  const trpcUtils = trpc.useUtils();
  const addByUrlMutation = trpc.collected.addByUrl.useMutation();
  const transcribeMutation = trpc.collected.transcribe.useMutation();
  const generateMutation = trpc.recreate.generate.useMutation();
  const [stateByShortcode, setStateByShortcode] = useState<
    Record<string, DiscoverRemakeState>
  >({});
  const runningRef = useRef<Set<string>>(new Set());
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

  const runChain = useCallback(
    async (reel: ViralReelLike) => {
      const shortcode = reel.shortcode;
      if (runningRef.current.has(shortcode)) return;

      runningRef.current.add(shortcode);
      cancelledRef.current.delete(shortcode);

      patchState(shortcode, { stage: "ingesting", progressPercent: 5, errorMessage: undefined });

      try {
        const addResult = await addByUrlMutation.mutateAsync({ url: reel.reelUrl });
        if (cancelledRef.current.has(shortcode)) return;

        const collectedReelId = addResult.id;
        if (addResult.duplicate) {
          // Proceed with existing collected row.
        }

        let ingestReady = false;
        for (let attempt = 1; attempt <= INGEST_MAX; attempt++) {
          if (cancelledRef.current.has(shortcode)) return;
          patchState(shortcode, {
            stage: "ingesting",
            progressPercent: easedPercent("ingesting", attempt, INGEST_MAX),
          });

          const list = await trpcUtils.collected.list.fetch();
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

        patchState(shortcode, { stage: "transcribing", progressPercent: 25 });

        const transcribeResult = await transcribeMutation.mutateAsync({
          collectedReelId,
        });
        if (cancelledRef.current.has(shortcode)) return;

        const reelId = transcribeResult.reelId;
        let transcriptionDone = transcribeResult.status === "completed";

        for (let attempt = 1; !transcriptionDone && attempt <= TRANSCRIBE_MAX; attempt++) {
          if (cancelledRef.current.has(shortcode)) return;
          patchState(shortcode, {
            stage: "transcribing",
            progressPercent: easedPercent("transcribing", attempt, TRANSCRIBE_MAX),
            reelId,
          });

          const txStatus = await trpcUtils.transcribe.status.fetch({ reelId });
          if (txStatus?.status === "completed") {
            transcriptionDone = true;
            break;
          }
          if (txStatus?.status === "failed") {
            throw new Error("Transcription failed. Try again.");
          }
          if (attempt < TRANSCRIBE_MAX) await sleep(POLL_MS);
        }

        if (!transcriptionDone) {
          throw new Error("Transcription timed out. Try again.");
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
              scriptStatus.errorMessage?.trim() || "Script generation failed. Try again."
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
        const message =
          err instanceof Error ? err.message : "Remake failed. Try again.";
        failRemake(shortcode, message);
      }
    },
    [addByUrlMutation, failRemake, generateMutation, patchState, transcribeMutation, trpcUtils]
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
    startRemake,
    retryRemake,
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
    case "ready":
      return "Open script";
    case "error":
      return "Retry";
    default:
      return "Remake now";
  }
}
