import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ReelClassificationLike } from "@/lib/remakeability";
import {
  assertLibraryTranscriptionReadyOnce,
  evaluateRemakeabilityGate,
  libraryEasedPercent,
  libraryRemakeButtonLabel,
  libraryRemakeKey,
  LIBRARY_GENERATE_MAX,
  LIBRARY_POLL_MS,
  LIBRARY_TRANSCRIBE_MAX,
  resolveLibraryIds,
  transcribeStatusInput,
  waitForLibraryTranscriptionReady,
  type LibraryRemakeSource,
  type LibraryRemakeStage,
  type LibraryRemakeState,
} from "@/lib/libraryRemakeChainCore";
import { trpc } from "@/lib/trpc";

export type LibrarySaveState = "idle" | "saved" | "error";

export type StartRemakeOptions = {
  /** Skip transcribe.start when parent already knows transcription is complete with speech */
  alreadyTranscribed?: boolean;
  /** Tier-2 + coach copy for mergeRemakeability / inspiration tooltip */
  classification?: ReelClassificationLike;
  /** Required for saved.toggle on user_job reels when jobId !== 0 */
  jobId?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useLibraryRemakeChain() {
  const trpcUtils = trpc.useUtils();
  const transcribeStartMutation = trpc.transcribe.start.useMutation();
  const collectedTranscribeMutation = trpc.collected.transcribe.useMutation();
  const generateMutation = trpc.recreate.generate.useMutation();
  const toggleSaveMutation = trpc.saved.toggle.useMutation();

  const [stateByKey, setStateByKey] = useState<Record<string, LibraryRemakeState>>({});
  const [saveStateByKey, setSaveStateByKey] = useState<Record<string, LibrarySaveState>>({});
  const runningRef = useRef<Set<string>>(new Set());
  const saveRunningRef = useRef<Set<string>>(new Set());
  const cancelledRef = useRef<Set<string>>(new Set());

  const patchState = useCallback(
    (key: string, patch: Partial<LibraryRemakeState> & { stage: LibraryRemakeStage }) => {
      setStateByKey((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? { stage: "idle" as LibraryRemakeStage, progressPercent: 0 }),
          ...patch,
        },
      }));
    },
    []
  );

  const failRemake = useCallback(
    (key: string, message: string) => {
      runningRef.current.delete(key);
      patchState(key, { stage: "error", progressPercent: 0, errorMessage: message });
      toast.error(message);
    },
    [patchState]
  );

  const fetchTranscribeStatus = useCallback(
    (input: { reelId: number } | { featuredReelId: number }) =>
      trpcUtils.transcribe.status.fetch(input),
    [trpcUtils]
  );

  const runChain = useCallback(
    async (source: LibraryRemakeSource, opts: StartRemakeOptions = {}) => {
      const key = libraryRemakeKey(source);
      if (runningRef.current.has(key)) return;

      runningRef.current.add(key);
      cancelledRef.current.delete(key);

      const classification = opts.classification;
      let reelId: number | undefined =
        source.source === "user"
          ? source.reelId
          : source.source === "collected"
            ? source.transcriptionReelId ?? undefined
            : undefined;
      const featuredReelId =
        source.source === "featured" ? source.featuredReelId : undefined;

      try {
        if (opts.alreadyTranscribed) {
          // Parent vouches transcription is done: one fetch, no poll loop.
          const statusInput = transcribeStatusInput(source, reelId, featuredReelId);
          await assertLibraryTranscriptionReadyOnce(fetchTranscribeStatus, statusInput);
          if (cancelledRef.current.has(key)) return;
        } else {
          patchState(key, {
            stage: "transcribing",
            progressPercent: 25,
            ...resolveLibraryIds(source, reelId),
          });

          if (source.source === "collected") {
            const result = await collectedTranscribeMutation.mutateAsync({
              collectedReelId: source.collectedReelId,
            });
            if (cancelledRef.current.has(key)) return;
            reelId = result.reelId;
            patchState(key, {
              stage: "transcribing",
              progressPercent: 25,
              ...resolveLibraryIds(source, reelId),
            });
            if (result.status !== "completed") {
              await waitForLibraryTranscriptionReady(
                fetchTranscribeStatus,
                { reelId: result.reelId },
                {
                  isCancelled: () => cancelledRef.current.has(key),
                  onAttempt: (attempt) =>
                    patchState(key, {
                      stage: "transcribing",
                      progressPercent: libraryEasedPercent(
                        "transcribing",
                        attempt,
                        LIBRARY_TRANSCRIBE_MAX
                      ),
                      reelId: result.reelId,
                      collectedReelId: source.collectedReelId,
                    }),
                }
              );
            }
          } else if (source.source === "featured") {
            const result = await transcribeStartMutation.mutateAsync({
              featuredReelId: source.featuredReelId,
            });
            if (cancelledRef.current.has(key)) return;
            if (result.status !== "completed") {
              await waitForLibraryTranscriptionReady(
                fetchTranscribeStatus,
                { featuredReelId: source.featuredReelId },
                {
                  isCancelled: () => cancelledRef.current.has(key),
                  onAttempt: (attempt) =>
                    patchState(key, {
                      stage: "transcribing",
                      progressPercent: libraryEasedPercent(
                        "transcribing",
                        attempt,
                        LIBRARY_TRANSCRIBE_MAX
                      ),
                      featuredReelId: source.featuredReelId,
                    }),
                }
              );
            }
          } else {
            const result = await transcribeStartMutation.mutateAsync({
              reelId: source.reelId,
            });
            if (cancelledRef.current.has(key)) return;
            reelId = source.reelId;
            if (result.status !== "completed") {
              await waitForLibraryTranscriptionReady(
                fetchTranscribeStatus,
                { reelId: source.reelId },
                {
                  isCancelled: () => cancelledRef.current.has(key),
                  onAttempt: (attempt) =>
                    patchState(key, {
                      stage: "transcribing",
                      progressPercent: libraryEasedPercent(
                        "transcribing",
                        attempt,
                        LIBRARY_TRANSCRIBE_MAX
                      ),
                      reelId: source.reelId,
                    }),
                }
              );
            }
          }
        }

        if (cancelledRef.current.has(key)) return;

        const statusInput = transcribeStatusInput(source, reelId, featuredReelId);
        const tx = await fetchTranscribeStatus(statusInput);
        const gate = evaluateRemakeabilityGate(
          tx
            ? { status: tx.status, transcript: tx.transcript, segments: tx.segments }
            : null,
          classification
        );

        if (!gate.proceed) {
          runningRef.current.delete(key);
          patchState(key, {
            stage: "inspiration",
            progressPercent: 100,
            classificationReason: gate.classificationReason,
            ...resolveLibraryIds(source, reelId),
          });
          return;
        }

        patchState(key, {
          stage: "generating",
          progressPercent: 65,
          ...resolveLibraryIds(source, reelId),
        });

        const generateInput =
          source.source === "featured"
            ? {
                featuredReelId: source.featuredReelId,
                topic: "",
                gradeLevel: "auto" as const,
              }
            : {
                reelId: reelId!,
                topic: "",
                gradeLevel: "auto" as const,
              };

        const generateResult = await generateMutation.mutateAsync(generateInput);
        if (cancelledRef.current.has(key)) return;

        const scriptId = generateResult.scriptId;
        let scriptDone = false;

        for (let attempt = 1; !scriptDone && attempt <= LIBRARY_GENERATE_MAX; attempt++) {
          if (cancelledRef.current.has(key)) return;
          patchState(key, {
            stage: "generating",
            progressPercent: libraryEasedPercent("generating", attempt, LIBRARY_GENERATE_MAX),
            scriptId,
            ...resolveLibraryIds(source, reelId),
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
          if (attempt < LIBRARY_GENERATE_MAX) await sleep(LIBRARY_POLL_MS);
        }

        if (!scriptDone) {
          throw new Error("Script generation timed out. Try again.");
        }

        runningRef.current.delete(key);
        patchState(key, {
          stage: "ready",
          progressPercent: 100,
          scriptId,
          ...resolveLibraryIds(source, reelId),
        });
      } catch (err) {
        if (cancelledRef.current.has(key)) return;
        const message = err instanceof Error ? err.message : "Remake failed. Try again.";
        failRemake(key, message);
      }
    },
    [
      collectedTranscribeMutation,
      failRemake,
      fetchTranscribeStatus,
      generateMutation,
      patchState,
      transcribeStartMutation,
      trpcUtils,
    ]
  );

  const startRemake = useCallback(
    (source: LibraryRemakeSource, opts?: StartRemakeOptions) => {
      const key = libraryRemakeKey(source);
      const current = stateByKey[key];
      if (current?.stage === "transcribing" || current?.stage === "generating") {
        return;
      }
      if (current?.stage === "inspiration") return;
      if (current?.stage === "ready" && current.scriptId != null) return;
      void runChain(source, opts);
    },
    [runChain, stateByKey]
  );

  const retryRemake = useCallback(
    (source: LibraryRemakeSource, opts?: StartRemakeOptions) => {
      void runChain(source, opts);
    },
    [runChain]
  );

  const startInspirationSave = useCallback(
    async (source: LibraryRemakeSource, opts?: Pick<StartRemakeOptions, "jobId">) => {
      const key = libraryRemakeKey(source);
      if (saveStateByKey[key] === "saved") return;
      if (saveRunningRef.current.has(key)) return;

      saveRunningRef.current.add(key);
      setSaveStateByKey((prev) => ({ ...prev, [key]: "idle" }));

      try {
        const state = stateByKey[key];
        let reelId = state?.reelId;

        if (source.source === "featured") {
          const existing = await trpcUtils.saved.check.fetch({
            featuredReelId: source.featuredReelId,
          });
          if (!existing.saved) {
            await toggleSaveMutation.mutateAsync({
              featuredReelId: source.featuredReelId,
            });
          }
        } else if (source.source === "user") {
          const jobId = opts?.jobId ?? source.jobId ?? 0;
          const existing = await trpcUtils.saved.check.fetch({ reelId: source.reelId });
          if (!existing.saved) {
            await toggleSaveMutation.mutateAsync({ reelId: source.reelId, jobId });
          }
        } else {
          if (reelId == null && source.transcriptionReelId != null) {
            reelId = source.transcriptionReelId;
          }
          if (reelId == null) {
            throw new Error("Reel not ready to save yet.");
          }
          const existing = await trpcUtils.saved.check.fetch({ reelId });
          if (!existing.saved) {
            await toggleSaveMutation.mutateAsync({ reelId, jobId: 0 });
          }
        }

        void trpcUtils.saved.list.invalidate();
        void trpcUtils.saved.checkBatch.invalidate();
        setSaveStateByKey((prev) => ({ ...prev, [key]: "saved" }));
        toast.success("Saved for inspiration");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not save reel. Try again.";
        setSaveStateByKey((prev) => ({ ...prev, [key]: "error" }));
        toast.error(message);
      } finally {
        saveRunningRef.current.delete(key);
      }
    },
    [saveStateByKey, stateByKey, toggleSaveMutation, trpcUtils]
  );

  const getRemakeState = useCallback(
    (key: string): LibraryRemakeState =>
      stateByKey[key] ?? { stage: "idle", progressPercent: 0 },
    [stateByKey]
  );

  const getSaveState = useCallback(
    (key: string): LibrarySaveState => saveStateByKey[key] ?? "idle",
    [saveStateByKey]
  );

  useEffect(() => {
    return () => {
      for (const k of runningRef.current) {
        cancelledRef.current.add(k);
      }
      runningRef.current.clear();
    };
  }, []);

  return {
    libraryRemakeKey,
    libraryRemakeButtonLabel,
    getRemakeState,
    getSaveState,
    startRemake,
    retryRemake,
    startInspirationSave,
  };
}

export type { LibraryRemakeSource, LibraryRemakeState, LibraryRemakeStage };
export { libraryRemakeButtonLabel };
