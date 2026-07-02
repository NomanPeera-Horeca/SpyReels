import type { OneClickRemakeAction } from "@/components/ReelActionButtons";
import type { StartRemakeOptions } from "@/hooks/useLibraryRemakeChain";
import {
  LIBRARY_REMAKE_CTA_LABEL,
  READY_TO_FILM_CTA_LABEL,
  libraryRemakeButtonLabel,
  type LibraryRemakeSource,
  type LibraryRemakeState,
} from "@/lib/libraryRemakeChainCore";
import type { ReelClassificationLike } from "@/lib/remakeability";

type RecreateBatchEntry = { latestScriptId: number; status: string };

type RecreateStripState = "none" | "generating" | "ready" | "failed";

export function reelClassificationFromRow(reel: {
  classifiedAt?: Date | string | null;
  suggestedAction?: string | null;
  contentType?: string | null;
  remakeabilityScore?: number | null;
  classificationReason?: string | null;
}): ReelClassificationLike {
  return {
    classifiedAt: reel.classifiedAt ?? null,
    suggestedAction: reel.suggestedAction ?? null,
    contentType: reel.contentType ?? null,
    remakeabilityScore: reel.remakeabilityScore ?? null,
    classificationReason: reel.classificationReason ?? null,
  };
}

export function buildLibraryOneClickRemake(args: {
  /** Row reel id for triggerOpenMyScript (user reelId or featuredReelId). */
  openScriptReelId: number;
  jobId?: number;
  isNoSpeech: boolean;
  alreadyTranscribed: boolean;
  idleNotRemakeable: boolean;
  classificationReason?: string | null;
  classification: ReelClassificationLike;
  batchRecreateSt: RecreateStripState;
  batchEntry: RecreateBatchEntry | undefined;
  hookState: LibraryRemakeState;
  librarySource: LibraryRemakeSource;
  startRemake: (source: LibraryRemakeSource, opts?: StartRemakeOptions) => void;
  retryRemake: (source: LibraryRemakeSource, opts?: StartRemakeOptions) => void;
  startInspirationSave: (
    source: LibraryRemakeSource,
    opts?: Pick<StartRemakeOptions, "jobId">
  ) => void;
  triggerOpenMyScript: (reelId: number, scriptId: number) => void;
}): OneClickRemakeAction {
  const startOpts: StartRemakeOptions = {
    alreadyTranscribed: args.alreadyTranscribed,
    classification: args.classification,
    ...(args.librarySource.source === "user" && args.jobId != null
      ? { jobId: args.jobId }
      : {}),
  };
  const inspirationSaveOpts =
    args.librarySource.source === "user" && args.jobId != null
      ? { jobId: args.jobId }
      : undefined;
  const { hookState, librarySource } = args;

  if (hookState.stage === "transcribing" || hookState.stage === "generating") {
    return {
      label: libraryRemakeButtonLabel(hookState),
      disabled: true,
      loading: true,
      onClick: () => {},
    };
  }
  if (hookState.stage === "inspiration") {
    const tip =
      hookState.classificationReason?.trim() ||
      args.classificationReason?.trim() ||
      "Save for Inspiration";
    return {
      label: "Save for Inspiration",
      tone: "inspiration",
      tooltip: tip,
      onClick: () => void args.startInspirationSave(librarySource, inspirationSaveOpts),
    };
  }
  if (hookState.stage === "ready" && hookState.scriptId != null) {
    return {
      label: READY_TO_FILM_CTA_LABEL,
      tone: "ready",
      tooltip: "Open your script and record in the teleprompter",
      onClick: () => args.triggerOpenMyScript(args.openScriptReelId, hookState.scriptId!),
    };
  }
  if (hookState.stage === "error") {
    return {
      label: "Retry",
      onClick: () => void args.retryRemake(librarySource, startOpts),
    };
  }

  if (args.batchRecreateSt === "generating") {
    return { label: "Generating...", disabled: true, loading: true, onClick: () => {} };
  }
  if (args.batchRecreateSt === "ready" && args.batchEntry?.latestScriptId) {
    return {
      label: READY_TO_FILM_CTA_LABEL,
      tone: "ready",
      tooltip: "Open your script and record in the teleprompter",
      onClick: () =>
        args.triggerOpenMyScript(args.openScriptReelId, args.batchEntry!.latestScriptId),
    };
  }
  if (args.isNoSpeech) {
    return {
      label: "No voice",
      disabled: true,
      tooltip: "No transcript available. Click the reel to view details.",
      onClick: () => {},
    };
  }
  if (args.idleNotRemakeable) {
    const tip = args.classificationReason?.trim() || "Save for Inspiration";
    return {
      label: "Save for Inspiration",
      tone: "inspiration",
      tooltip: tip,
      onClick: () => void args.startInspirationSave(librarySource, inspirationSaveOpts),
    };
  }
  return {
    label: LIBRARY_REMAKE_CTA_LABEL,
    onClick: () => void args.startRemake(librarySource, startOpts),
  };
}
