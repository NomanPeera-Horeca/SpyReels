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
import type { RemakeIntentMedia } from "@/lib/remakeIntent";

type RecreateBatchEntry = { latestScriptId: number; status: string };

type RecreateStripState = "none" | "generating" | "ready" | "failed";

export type OpenRemakeWorkspaceArgs = {
  scriptId: number | null;
  openScriptReelId: number | null;
  source: LibraryRemakeSource;
};

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
  /** Row reel id for teleprompter / workspace (user reelId or featuredReelId). */
  openScriptReelId: number | null;
  jobId?: number;
  isNoSpeech: boolean;
  alreadyTranscribed: boolean;
  idleNotRemakeable: boolean;
  classificationReason?: string | null;
  classification: ReelClassificationLike;
  media?: RemakeIntentMedia;
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
  openRemakeWorkspace: (args: OpenRemakeWorkspaceArgs) => void;
}): OneClickRemakeAction {
  const startOpts: StartRemakeOptions = {
    alreadyTranscribed: args.alreadyTranscribed,
    classification: args.classification,
    media: args.media,
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
      loading: true,
      tooltip: "Open remake workspace to watch progress",
      onClick: () =>
        args.openRemakeWorkspace({
          scriptId: hookState.scriptId ?? null,
          openScriptReelId: args.openScriptReelId,
          source: librarySource,
        }),
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
      tooltip: "Open remake workspace to improve script, caption, and B-roll",
      onClick: () =>
        args.openRemakeWorkspace({
          scriptId: hookState.scriptId!,
          openScriptReelId: args.openScriptReelId,
          source: librarySource,
        }),
    };
  }
  if (hookState.stage === "error") {
    return {
      label: LIBRARY_REMAKE_CTA_LABEL,
      tooltip: hookState.errorMessage?.trim() || "Last remake failed. Tap to try again.",
      onClick: () => void args.retryRemake(librarySource, startOpts),
    };
  }

  if (args.batchRecreateSt === "generating") {
    return {
      label: "Generating...",
      loading: true,
      tooltip: "Open remake workspace to watch progress",
      onClick: () =>
        args.openRemakeWorkspace({
          scriptId: args.batchEntry?.latestScriptId ?? null,
          openScriptReelId: args.openScriptReelId,
          source: librarySource,
        }),
    };
  }
  if (args.batchRecreateSt === "ready" && args.batchEntry?.latestScriptId) {
    return {
      label: READY_TO_FILM_CTA_LABEL,
      tone: "ready",
      tooltip: "Open remake workspace to improve script, caption, and B-roll",
      onClick: () =>
        args.openRemakeWorkspace({
          scriptId: args.batchEntry!.latestScriptId,
          openScriptReelId: args.openScriptReelId,
          source: librarySource,
        }),
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
