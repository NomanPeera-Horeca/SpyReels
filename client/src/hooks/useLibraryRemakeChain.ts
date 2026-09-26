import { useCallback, useEffect, useRef, useState, createElement, Fragment } from "react";
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
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";
import { OnboardingVoiceGateDialog } from "@/components/OnboardingVoiceGateDialog";
import { RemakeIntentDialog } from "@/components/RemakeIntentDialog";
import {
  RemakeWorkspaceDialog,
  type RemakeWorkspaceTarget,
} from "@/components/RemakeWorkspaceDialog";
import type { OpenRemakeWorkspaceArgs } from "@/lib/oneClickRemakeAction";
import {
  isValidRemakeIntent,
  remakeIntentToTopic,
  type RemakeIntent,
} from "@/lib/remakeIntent";

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

function hasVoiceProfile(state: {
  businessDescription?: string | null;
  targetAudience?: string | null;
} | null | undefined): boolean {
  return Boolean(
    state?.businessDescription?.trim() && state?.targetAudience?.trim()
  );
}

function resolveOpenReelId(
  source: LibraryRemakeSource,
  state: LibraryRemakeState | undefined,
  fallbackReelId?: number | null
): number | null {
  if (fallbackReelId != null) return fallbackReelId;
  if (state?.reelId != null) return state.reelId;
  if (source.source === "user") return source.reelId;
  if (source.source === "featured") return source.featuredReelId;
  if (source.source === "collected") return source.transcriptionReelId ?? null;
  return null;
}

export type UseLibraryRemakeChainOptions = {
  /**
   * Fired when a reel's remake stage changes. Parents use this for
   * surface-specific cache refresh without baking query keys into the hook.
   */
  onStageChange?: (
    source: LibraryRemakeSource,
    stage: LibraryRemakeStage,
    prevStage: LibraryRemakeStage | undefined
  ) => void;
  /** Optional teleprompter open from Remake workspace (secondary path). */
  onOpenTeleprompter?: (reelId: number, scriptId: number) => void;
};

export function useLibraryRemakeChain(options: UseLibraryRemakeChainOptions = {}) {
  const trpcUtils = trpc.useUtils();
  const onStageChangeRef = useRef(options.onStageChange);
  onStageChangeRef.current = options.onStageChange;
  const onOpenTeleprompterRef = useRef(options.onOpenTeleprompter);
  onOpenTeleprompterRef.current = options.onOpenTeleprompter;

  const onboardingStateQuery = trpc.onboarding.getState.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const transcribeStartMutation = trpc.transcribe.start.useMutation();
  const collectedTranscribeMutation = trpc.collected.transcribe.useMutation();
  const generateMutation = trpc.recreate.generate.useMutation();
  const ensureFromRecreateMutation = trpc.scripts.ensureFromRecreate.useMutation();
  const toggleSaveMutation = trpc.saved.toggle.useMutation();

  const [stateByKey, setStateByKey] = useState<Record<string, LibraryRemakeState>>({});
  const [saveStateByKey, setSaveStateByKey] = useState<Record<string, LibrarySaveState>>({});
  const [voiceGateOpen, setVoiceGateOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTarget, setWorkspaceTarget] = useState<RemakeWorkspaceTarget | null>(null);
  const [intentPrompt, setIntentPrompt] = useState<{
    source: LibraryRemakeSource;
    key: string;
  } | null>(null);

  const pendingRemakeRef = useRef<{
    source: LibraryRemakeSource;
    opts?: StartRemakeOptions;
    mode: "start" | "retry";
  } | null>(null);
  const runningRef = useRef<Set<string>>(new Set());
  const saveRunningRef = useRef<Set<string>>(new Set());
  const cancelledRef = useRef<Set<string>>(new Set());
  const workspaceKeyRef = useRef<string | null>(null);
  const stateByKeyRef = useRef(stateByKey);
  const intentByKeyRef = useRef<Map<string, RemakeIntent>>(new Map());
  stateByKeyRef.current = stateByKey;

  const openWorkspaceForSource = useCallback(
    (
      source: LibraryRemakeSource,
      opts?: { scriptId?: number | null; reelId?: number | null }
    ) => {
      const key = libraryRemakeKey(source);
      const state = stateByKeyRef.current[key];
      const scriptId = opts?.scriptId ?? state?.scriptId ?? null;
      const reelId = resolveOpenReelId(source, state, opts?.reelId);
      workspaceKeyRef.current = key;
      setWorkspaceTarget({
        remakeKey: key,
        scriptId,
        reelId,
        source,
      });
      setWorkspaceOpen(true);
    },
    []
  );

  const resolveSavedScriptId = useCallback(
    async (maybeRecreateOrSavedId: number): Promise<number> => {
      const result = await ensureFromRecreateMutation.mutateAsync({
        recreatedScriptId: maybeRecreateOrSavedId,
      });
      return result.id;
    },
    [ensureFromRecreateMutation]
  );

  const openRemakeWorkspace = useCallback(
    (args: OpenRemakeWorkspaceArgs) => {
      const openWith = (scriptId: number | null) => {
        openWorkspaceForSource(args.source, {
          scriptId,
          reelId: args.openScriptReelId,
        });
      };

      if (args.scriptId == null) {
        openWith(null);
        return;
      }

      void resolveSavedScriptId(args.scriptId)
        .then((savedId) => {
          const key = libraryRemakeKey(args.source);
          setStateByKey((prev) => ({
            ...prev,
            [key]: {
              ...(prev[key] ?? {
                stage: "ready" as LibraryRemakeStage,
                progressPercent: 100,
              }),
              stage: "ready",
              progressPercent: 100,
              scriptId: savedId,
            },
          }));
          openWith(savedId);
        })
        .catch((err) => {
          toast.error(
            err instanceof Error ? err.message : "Could not open remake script."
          );
        });
    },
    [openWorkspaceForSource, resolveSavedScriptId]
  );

  useEffect(() => {
    if (!workspaceOpen || !workspaceKeyRef.current) return;
    const key = workspaceKeyRef.current;
    const state = stateByKey[key];
    if (!state) return;
    setWorkspaceTarget((prev) => {
      if (!prev || prev.remakeKey !== key) return prev;
      const nextScript =
        state.stage === "transcribing" || state.stage === "generating"
          ? null
          : (state.scriptId ?? prev.scriptId);
      const nextReel = state.reelId ?? prev.reelId;
      if (nextScript === prev.scriptId && nextReel === prev.reelId) return prev;
      return { ...prev, scriptId: nextScript, reelId: nextReel };
    });
  }, [stateByKey, workspaceOpen]);

  const patchState = useCallback(
    (
      source: LibraryRemakeSource,
      patch: Partial<LibraryRemakeState> & { stage: LibraryRemakeStage }
    ) => {
      const key = libraryRemakeKey(source);
      setStateByKey((prev) => {
        const prevStage = prev[key]?.stage ?? ("idle" as LibraryRemakeStage);
        const nextState: LibraryRemakeState = {
          ...(prev[key] ?? {
            stage: "idle" as LibraryRemakeStage,
            progressPercent: 0,
          }),
          ...patch,
        };
        if (prevStage !== patch.stage) {
          onStageChangeRef.current?.(source, patch.stage, prevStage);
        }
        return { ...prev, [key]: nextState };
      });
    },
    []
  );

  const failRemake = useCallback(
    (source: LibraryRemakeSource, message: string) => {
      const key = libraryRemakeKey(source);
      runningRef.current.delete(key);
      patchState(source, {
        stage: "error",
        progressPercent: 0,
        errorMessage: message,
      });
      toast.error(message);
    },
    [patchState]
  );

  const fetchTranscribeStatus = useCallback(
    (
      input:
        | { reelId: number }
        | { featuredReelId: number }
        | { tiktokVideoId: number }
        | { youtubeVideoId: number }
    ) => trpcUtils.transcribe.status.fetch(input),
    [trpcUtils]
  );

  const waitForIntent = useCallback(async (key: string): Promise<RemakeIntent | null> => {
    while (!cancelledRef.current.has(key)) {
      const intent = intentByKeyRef.current.get(key);
      if (intent && isValidRemakeIntent(intent)) return intent;
      await sleep(100);
    }
    return null;
  }, []);

  const runChain = useCallback(
    async (source: LibraryRemakeSource, opts: StartRemakeOptions = {}) => {
      const key = libraryRemakeKey(source);
      if (runningRef.current.has(key)) return;

      runningRef.current.add(key);
      cancelledRef.current.delete(key);

      const existingIntent = intentByKeyRef.current.get(key);
      if (existingIntent) {
        openWorkspaceForSource(source);
      } else {
        setIntentPrompt({ source, key });
      }

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
        patchState(source, {
          stage: "transcribing",
          progressPercent: opts.alreadyTranscribed ? 60 : 25,
          ...resolveLibraryIds(source, reelId),
        });

        if (opts.alreadyTranscribed) {
          const statusInput = transcribeStatusInput(source, reelId, featuredReelId);
          await assertLibraryTranscriptionReadyOnce(fetchTranscribeStatus, statusInput);
          if (cancelledRef.current.has(key)) return;
        } else if (source.source === "collected") {
          const result = await collectedTranscribeMutation.mutateAsync({
            collectedReelId: source.collectedReelId,
          });
          if (cancelledRef.current.has(key)) return;
          reelId = result.reelId;
          patchState(source, {
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
                  patchState(source, {
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
                  patchState(source, {
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
        } else if (source.source === "tiktok") {
          const result = await transcribeStartMutation.mutateAsync({
            tiktokVideoId: source.tiktokVideoId,
          });
          if (cancelledRef.current.has(key)) return;
          if (result.status !== "completed") {
            await waitForLibraryTranscriptionReady(
              fetchTranscribeStatus,
              { tiktokVideoId: source.tiktokVideoId },
              {
                isCancelled: () => cancelledRef.current.has(key),
                onAttempt: (attempt) =>
                  patchState(source, {
                    stage: "transcribing",
                    progressPercent: libraryEasedPercent(
                      "transcribing",
                      attempt,
                      LIBRARY_TRANSCRIBE_MAX
                    ),
                    tiktokVideoId: source.tiktokVideoId,
                  }),
              }
            );
          }
        } else if (source.source === "youtube") {
          const result = await transcribeStartMutation.mutateAsync({
            youtubeVideoId: source.youtubeVideoId,
          });
          if (cancelledRef.current.has(key)) return;
          if (result.status !== "completed") {
            await waitForLibraryTranscriptionReady(
              fetchTranscribeStatus,
              { youtubeVideoId: source.youtubeVideoId },
              {
                isCancelled: () => cancelledRef.current.has(key),
                onAttempt: (attempt) =>
                  patchState(source, {
                    stage: "transcribing",
                    progressPercent: libraryEasedPercent(
                      "transcribing",
                      attempt,
                      LIBRARY_TRANSCRIBE_MAX
                    ),
                    youtubeVideoId: source.youtubeVideoId,
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
                  patchState(source, {
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

        if (cancelledRef.current.has(key)) return;

        const statusInput = transcribeStatusInput(source, reelId, featuredReelId);
        // YouTube / collected used to return status=completed with an empty
        // transcript when captions were missing. That skipped the wait loop and
        // failed later with "Reel must be transcribed first". Always require a
        // non-empty transcript before generate.
        await assertLibraryTranscriptionReadyOnce(
          fetchTranscribeStatus,
          statusInput
        );
        if (cancelledRef.current.has(key)) return;

        const tx = await fetchTranscribeStatus(statusInput);
        const gate = evaluateRemakeabilityGate(
          tx
            ? { status: tx.status, transcript: tx.transcript, segments: tx.segments }
            : null,
          classification
        );

        if (!gate.proceed) {
          runningRef.current.delete(key);
          setIntentPrompt((current) => (current?.key === key ? null : current));
          patchState(source, {
            stage: "inspiration",
            progressPercent: 100,
            classificationReason: gate.classificationReason,
            ...resolveLibraryIds(source, reelId),
          });
          setWorkspaceOpen(false);
          toast.message(
            gate.classificationReason?.trim() ||
              "This video looks inspiration-only. Save it, or pick one with clear talking to remake."
          );
          return;
        }

        patchState(source, {
          stage: "transcribing",
          progressPercent: 64,
          ...resolveLibraryIds(source, reelId),
        });

        const intent = intentByKeyRef.current.get(key) ?? (await waitForIntent(key));
        if (!intent || cancelledRef.current.has(key)) return;

        setIntentPrompt((current) => (current?.key === key ? null : current));
        openWorkspaceForSource(source, { reelId: reelId ?? null });

        patchState(source, {
          stage: "generating",
          progressPercent: 65,
          ...resolveLibraryIds(source, reelId),
        });

        const topic = remakeIntentToTopic(intent);
        const generateInput =
          source.source === "featured"
            ? {
                featuredReelId: source.featuredReelId,
                topic,
                gradeLevel: "auto" as const,
              }
            : source.source === "tiktok"
              ? {
                  tiktokVideoId: source.tiktokVideoId,
                  topic,
                  gradeLevel: "auto" as const,
                }
              : source.source === "youtube"
                ? {
                    youtubeVideoId: source.youtubeVideoId,
                    topic,
                    gradeLevel: "auto" as const,
                  }
                : {
                    reelId: reelId!,
                    topic,
                    gradeLevel: "auto" as const,
                  };

        const generateResult = await generateMutation.mutateAsync(generateInput);
        if (cancelledRef.current.has(key)) return;

        const recreatedScriptId = generateResult.scriptId;
        let scriptDone = false;
        let generatedScript = "";

        for (let attempt = 1; !scriptDone && attempt <= LIBRARY_GENERATE_MAX; attempt++) {
          if (cancelledRef.current.has(key)) return;
          patchState(source, {
            stage: "generating",
            progressPercent: libraryEasedPercent(
              "generating",
              attempt,
              LIBRARY_GENERATE_MAX
            ),
            ...resolveLibraryIds(source, reelId),
          });

          const scriptStatus = await trpcUtils.recreate.status.fetch({
            scriptId: recreatedScriptId,
          });
          if (scriptStatus?.status === "completed") {
            generatedScript = String(scriptStatus.generatedScript ?? "").trim();
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
          if (attempt < LIBRARY_GENERATE_MAX) await sleep(LIBRARY_POLL_MS);
        }

        if (!scriptDone) {
          throw new Error("Script generation timed out. Try again.");
        }
        if (!generatedScript) {
          throw new Error("Remake finished with empty script content. Try again.");
        }

        const promoted = await ensureFromRecreateMutation.mutateAsync({
          recreatedScriptId,
        });
        if (cancelledRef.current.has(key)) return;

        runningRef.current.delete(key);
        patchState(source, {
          stage: "ready",
          progressPercent: 100,
          scriptId: promoted.id,
          ...resolveLibraryIds(source, reelId),
        });
      } catch (err) {
        if (cancelledRef.current.has(key)) return;
        setIntentPrompt((current) => (current?.key === key ? null : current));
        failRemake(source, formatIdeaScriptErrorForUser(err, "remake"));
        openWorkspaceForSource(source, { reelId: reelId ?? null });
      }
    },
    [
      collectedTranscribeMutation,
      ensureFromRecreateMutation,
      failRemake,
      fetchTranscribeStatus,
      generateMutation,
      openWorkspaceForSource,
      patchState,
      transcribeStartMutation,
      trpcUtils,
      waitForIntent,
    ]
  );

  const submitRemakeIntent = useCallback(
    (intent: RemakeIntent) => {
      const prompt = intentPrompt;
      if (!prompt || !isValidRemakeIntent(intent)) return;
      intentByKeyRef.current.set(prompt.key, intent);
      setIntentPrompt(null);
      const current = stateByKeyRef.current[prompt.key];
      openWorkspaceForSource(prompt.source, {
        scriptId: null,
        reelId: current?.reelId ?? null,
      });
    },
    [intentPrompt, openWorkspaceForSource]
  );

  const cancelRemakeIntent = useCallback(() => {
    const prompt = intentPrompt;
    if (!prompt) return;
    cancelledRef.current.add(prompt.key);
    runningRef.current.delete(prompt.key);
    intentByKeyRef.current.delete(prompt.key);
    patchState(prompt.source, { stage: "idle", progressPercent: 0 });
    setIntentPrompt(null);
  }, [intentPrompt, patchState]);

  const startRemake = useCallback(
    (source: LibraryRemakeSource, opts?: StartRemakeOptions) => {
      const key = libraryRemakeKey(source);
      const current = stateByKey[key];

      if (current?.stage === "transcribing") {
        if (intentByKeyRef.current.has(key)) {
          openWorkspaceForSource(source, {
            scriptId: null,
            reelId: current.reelId ?? null,
          });
        } else {
          setIntentPrompt({ source, key });
        }
        return;
      }

      if (current?.stage === "generating") {
        openWorkspaceForSource(source, {
          scriptId: null,
          reelId: current.reelId ?? null,
        });
        return;
      }
      if (current?.stage === "inspiration") return;
      if (current?.stage === "ready" && current.scriptId != null) {
        openRemakeWorkspace({
          source,
          scriptId: current.scriptId,
          openScriptReelId: current.reelId ?? null,
        });
        return;
      }

      if (!hasVoiceProfile(onboardingStateQuery.data)) {
        pendingRemakeRef.current = { source, opts, mode: "start" };
        setVoiceGateOpen(true);
        return;
      }
      void runChain(source, opts);
    },
    [
      onboardingStateQuery.data,
      openRemakeWorkspace,
      openWorkspaceForSource,
      runChain,
      stateByKey,
    ]
  );

  const retryRemake = useCallback(
    (source: LibraryRemakeSource, opts?: StartRemakeOptions) => {
      if (!hasVoiceProfile(onboardingStateQuery.data)) {
        pendingRemakeRef.current = { source, opts, mode: "retry" };
        setVoiceGateOpen(true);
        return;
      }
      void runChain(source, opts);
    },
    [onboardingStateQuery.data, runChain]
  );

  const onVoiceGateSaved = useCallback(() => {
    const pending = pendingRemakeRef.current;
    pendingRemakeRef.current = null;
    if (!pending) return;
    void runChain(pending.source, pending.opts);
  }, [runChain]);

  const VoiceGateDialog = createElement(OnboardingVoiceGateDialog, {
    open: voiceGateOpen,
    onOpenChange: (open: boolean) => {
      setVoiceGateOpen(open);
      if (!open) pendingRemakeRef.current = null;
    },
    onSaved: onVoiceGateSaved,
  });

  const workspaceRemakeState =
    workspaceTarget != null
      ? stateByKey[workspaceTarget.remakeKey] ?? null
      : null;
  const intentPromptState =
    intentPrompt != null ? stateByKey[intentPrompt.key] ?? null : null;

  const RemakeDialogs = createElement(
    Fragment,
    null,
    VoiceGateDialog,
    createElement(RemakeIntentDialog, {
      open: intentPrompt != null,
      progressPercent: intentPromptState?.progressPercent ?? 0,
      onSubmit: submitRemakeIntent,
      onCancel: cancelRemakeIntent,
    }),
    createElement(RemakeWorkspaceDialog, {
      open: workspaceOpen,
      onOpenChange: setWorkspaceOpen,
      target: workspaceTarget,
      remakeState: workspaceRemakeState,
      onRetryRemake:
        workspaceTarget?.source != null
          ? () => retryRemake(workspaceTarget.source!)
          : undefined,
      onOpenTeleprompter: (reelId: number, scriptId: number) => {
        onOpenTeleprompterRef.current?.(reelId, scriptId);
      },
    })
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
        } else if (source.source === "tiktok") {
          const existing = await trpcUtils.saved.check.fetch({
            tiktokVideoId: source.tiktokVideoId,
          });
          if (!existing.saved) {
            await toggleSaveMutation.mutateAsync({
              tiktokVideoId: source.tiktokVideoId,
            });
          }
        } else if (source.source === "youtube") {
          const existing = await trpcUtils.saved.check.fetch({
            youtubeVideoId: source.youtubeVideoId,
          });
          if (!existing.saved) {
            await toggleSaveMutation.mutateAsync({
              youtubeVideoId: source.youtubeVideoId,
            });
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
      for (const key of runningRef.current) {
        cancelledRef.current.add(key);
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
    openRemakeWorkspace,
    VoiceGateDialog,
    RemakeDialogs,
  };
}

export type { LibraryRemakeSource, LibraryRemakeState, LibraryRemakeStage };
export { libraryRemakeButtonLabel };
