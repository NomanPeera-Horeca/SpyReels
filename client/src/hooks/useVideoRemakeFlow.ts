import { useEffect, useState } from "react";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { LIBRARY_REMAKE_CTA_LABEL } from "@/lib/libraryRemakeChainCore";
import type {
  PlatformResearchConfig,
  PlatformVideoLike,
} from "@/lib/platformResearchConfigs";

export type VideoRemakeFlow = {
  isTranscribing: boolean;
  isGenerating: boolean;
  isBusy: boolean;
  buttonLabel: string;
  buttonDisabled: boolean;
  showScript: boolean;
  script: {
    status?: string;
    generatedScript?: string | null;
    errorMessage?: string | null;
  } | null;
  noSpeechOrNoTranscript: boolean;
  transcriptionFailed: boolean;
  generationFailed: boolean;
  transcriptionErrorMessage: string | null;
  hasTranscription: boolean;
  hasTranscriptText: boolean;
  onButtonClick: () => void;
};

/**
 * Shared remake/transcribe/generate state machine for TikTok (async poll) and
 * YouTube (instant mutateAsync). Branches on config.transcribeMode.
 */
export function useVideoRemakeFlow(
  video: PlatformVideoLike,
  config: PlatformResearchConfig
): VideoRemakeFlow {
  const utils = trpc.useUtils();
  const [remakeRequested, setRemakeRequested] = useState(false);
  const [transcriptionId, setTranscriptionId] = useState<number | null>(null);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [noTranscript, setNoTranscript] = useState(false);
  const [transcriptionFailedLocal, setTranscriptionFailedLocal] =
    useState(false);
  const [transcriptionErrorMessage, setTranscriptionErrorMessage] = useState<
    string | null
  >(null);

  const statusInput = config.buildTranscribeInput(video.id);

  const transcriptionQuery = trpc.transcribe.status.useQuery(statusInput as never, {
    enabled: true,
    refetchInterval: (query) => {
      if (config.transcribeMode !== "async") return false;
      if (!remakeRequested && transcriptionId == null) return false;
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 2000;
    },
  });

  const transcribeMutation = trpc.transcribe.start.useMutation({
    onSuccess: (data) => {
      if (config.transcribeMode === "async" && "transcriptionId" in data) {
        setTranscriptionId(
          (data as { transcriptionId: number }).transcriptionId
        );
      }
    },
    onError: (err) => {
      if (config.transcribeMode === "instant") {
        setTranscriptionFailedLocal(true);
      }
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly transcription limit reached.");
        if (config.transcribeMode === "instant") {
          setTranscriptionErrorMessage("Monthly transcription limit reached.");
        }
      } else {
        toast.error(err.message);
        if (config.transcribeMode === "instant") {
          setTranscriptionErrorMessage(err.message);
        }
      }
    },
  });

  const generateMutation = trpc.recreate.generate.useMutation({
    onSuccess: (data) => {
      setScriptId(data.scriptId);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly script generation limit reached.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const scriptQuery = trpc.recreate.status.useQuery(
    { scriptId: scriptId! },
    {
      enabled: scriptId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "processing" ? 2000 : false;
      },
    }
  );

  const transcription = transcriptionQuery.data;
  const hasTranscription = transcription?.status === "completed";
  const transcript = transcription?.transcript ?? null;
  const hasTranscriptText = Boolean(transcript?.trim());

  const isTranscribing =
    config.transcribeMode === "async"
      ? remakeRequested &&
        (transcribeMutation.isPending ||
          (transcriptionId != null &&
            transcription?.status !== "completed" &&
            transcription?.status !== "failed"))
      : remakeRequested && transcribeMutation.isPending;

  const script = scriptQuery.data ?? null;
  const isGenerating =
    generateMutation.isPending ||
    (scriptId != null && script?.status === "processing");

  const isBusy = isTranscribing || isGenerating;

  const noSpeechAsync = hasTranscription && !transcript;
  const emptyTranscriptInstant =
    noTranscript || (hasTranscription && !transcript?.trim());
  const noSpeechOrNoTranscript =
    config.transcribeMode === "async"
      ? noSpeechAsync
      : emptyTranscriptInstant && (noTranscript || hasTranscription);

  const transcriptionFailed =
    config.transcribeMode === "async"
      ? transcription?.status === "failed"
      : transcriptionFailedLocal || transcription?.status === "failed";

  const generationFailed = script?.status === "failed";

  // Async (TikTok): kick generate once transcription completes with speech.
  useEffect(() => {
    if (config.transcribeMode !== "async") return;
    if (
      !remakeRequested ||
      generationStarted ||
      transcription?.status !== "completed" ||
      !transcription.transcript
    ) {
      return;
    }

    setGenerationStarted(true);
    generateMutation.mutate(config.buildGenerateInput(video.id) as never);
  }, [
    config,
    generationStarted,
    generateMutation,
    remakeRequested,
    transcription?.status,
    transcription?.transcript,
    video.id,
  ]);

  // Auto-expand script panel when generation completes (both platforms).
  useEffect(() => {
    if (script?.status === "completed" && script.generatedScript) {
      setShowScript(true);
    }
  }, [script?.generatedScript, script?.status]);

  const startRemakeAsync = () => {
    if (script?.status === "completed" && script.generatedScript) {
      setShowScript((current) => !current);
      return;
    }

    setRemakeRequested(true);
    setGenerationStarted(false);
    setTranscriptionId(null);
    setScriptId(null);
    transcribeMutation.mutate(config.buildTranscribeInput(video.id) as never);
  };

  const startRemakeInstant = async () => {
    // View/Hide must win over remake restart. Clearing scriptId on a
    // false-negative here was the YouTube "View result renders nothing" bug:
    // button said View result but the click fell through and wiped scriptId.
    if (script?.status === "completed" && script.generatedScript) {
      setShowScript((current) => !current);
      return;
    }

    setRemakeRequested(true);
    setScriptId(null);
    setNoTranscript(false);
    setTranscriptionFailedLocal(false);
    setTranscriptionErrorMessage(null);
    setShowScript(false);

    try {
      const result = await transcribeMutation.mutateAsync(
        config.buildTranscribeInput(video.id) as never
      );

      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        (result as { status: string }).status !== "completed"
      ) {
        setTranscriptionFailedLocal(true);
        setTranscriptionErrorMessage("Transcription did not complete");
        toast.error("Transcription did not complete");
        return;
      }

      const fresh = await utils.transcribe.status.fetch(statusInput as never);
      await transcriptionQuery.refetch();

      if (!fresh?.transcript?.trim()) {
        setNoTranscript(true);
        return;
      }

      await generateMutation.mutateAsync(
        config.buildGenerateInput(video.id) as never
      );
    } catch {
      // Errors surfaced via mutation onError handlers / toast above.
    }
  };

  const onButtonClick = () => {
    if (config.transcribeMode === "async") {
      startRemakeAsync();
      return;
    }
    void startRemakeInstant();
  };

  let buttonLabel = LIBRARY_REMAKE_CTA_LABEL;
  if (config.transcribeMode === "async") {
    if (isTranscribing) buttonLabel = "Transcribing...";
    else if (isGenerating) buttonLabel = "Generating...";
    else if (noSpeechAsync) buttonLabel = "No speech detected";
    else if (transcriptionFailed || generationFailed) buttonLabel = "Retry";
    else if (script?.status === "completed") {
      buttonLabel = showScript ? "Hide result" : "View result";
    }
  } else {
    if (isGenerating) buttonLabel = "Generating...";
    else if (emptyTranscriptInstant && (noTranscript || hasTranscription)) {
      buttonLabel = "No transcript available";
    } else if (transcriptionFailed || generationFailed) buttonLabel = "Retry";
    else if (script?.status === "completed") {
      buttonLabel = showScript ? "Hide result" : "View result";
    }
  }

  // Always allow View/Hide when a completed script exists (YouTube previously
  // could disable the button via emptyTranscript while still showing View result).
  const scriptReady = script?.status === "completed" && !!script.generatedScript;
  const buttonDisabled = scriptReady
    ? false
    : config.transcribeMode === "async"
      ? isTranscribing || isGenerating || noSpeechAsync
      : isBusy ||
        (emptyTranscriptInstant && (noTranscript || hasTranscription));

  return {
    isTranscribing,
    isGenerating,
    isBusy,
    buttonLabel,
    buttonDisabled,
    showScript,
    script,
    noSpeechOrNoTranscript,
    transcriptionFailed,
    generationFailed,
    transcriptionErrorMessage:
      config.transcribeMode === "instant"
        ? transcriptionErrorMessage ||
          (transcription?.status === "failed"
            ? transcription.errorMessage || "Transcription failed"
            : null)
        : transcription?.status === "failed"
          ? transcription.errorMessage || "Transcription failed"
          : null,
    hasTranscription,
    hasTranscriptText,
    onButtonClick,
  };
}
