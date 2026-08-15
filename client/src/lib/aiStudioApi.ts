export type AiStudioJob = {
  id: string;
  status:
    | "queued"
    | "directing"
    | "generating_voice"
    | "generating_presenter"
    | "collecting_broll"
    | "composing"
    | "quality_check"
    | "completed"
    | "failed"
    | "cancelled";
  progress: number;
  currentStep: string;
  outputUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type AiStudioSceneInput = {
  id: string;
  order: number;
  type: "presenter" | "broll" | "graphic";
  script: string;
  durationSeconds: number;
  emotion: "neutral" | "confident" | "excited" | "serious" | "concerned" | "warm";
  pace: "slow" | "medium" | "medium_fast" | "fast";
  energy: number;
  pauseBeforeMs: number;
  pauseAfterMs: number;
  emphasizedWords: string[];
  visualDirection?: string;
  brollQuery?: string;
};

type RequestOptions = RequestInit & { body?: string };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `AI Studio request failed (${response.status})`);
  }
  return payload as T;
}

export async function createAiStudioProfile(input: {
  name: string;
  presenterStyle: "office" | "podcast" | "whiteboard" | "warehouse" | "studio" | "walking";
}) {
  return request<{
    id: string;
    status: string;
    profile: Record<string, unknown>;
  }>("/api/ai-studio/profiles", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      consentConfirmed: true,
      profile: {
        presenterStyle: input.presenterStyle,
        voiceProvider: "elevenlabs",
        avatarProvider: "heygen",
        speakingStyle: "confident_natural",
        pace: "medium_fast",
        hookEnergy: 0.9,
        teachingEnergy: 0.62,
        ctaEnergy: 0.75,
        captionStyle: "bold_keywords",
        captionHighlightHex: "#FACC15",
        favoriteTransitions: [
          "Here is the problem",
          "And this is where it gets expensive",
          "Remember this",
        ],
      },
    }),
  });
}

export async function uploadAiStudioTrainingFile(input: {
  profileId: string;
  kind: "training-video" | "voice-sample";
  file: File;
}): Promise<{ key: string; url: string }> {
  const prepared = await request<{ key: string; uploadUrl: string; url: string }>(
    "/api/ai-studio/uploads",
    {
      method: "POST",
      body: JSON.stringify({
        profileId: input.profileId,
        kind: input.kind,
        filename: input.file.name,
        contentType: input.file.type,
        contentLength: input.file.size,
      }),
    }
  );

  const upload = await fetch(prepared.uploadUrl, {
    method: "PUT",
    headers: { "content-type": input.file.type },
    body: input.file,
  });
  if (!upload.ok) throw new Error(`Training upload failed (${upload.status})`);
  return { key: prepared.key, url: prepared.url };
}

export async function markAiStudioProfileReady(input: {
  profileId: string;
  voiceId?: string;
  avatarId?: string;
}) {
  return request<{ success: true }>(`/api/ai-studio/profiles/${input.profileId}/ready`, {
    method: "POST",
    body: JSON.stringify({ voiceId: input.voiceId, avatarId: input.avatarId }),
  });
}

export async function createAiStudioVideo(input: {
  creatorProfileId: string;
  title: string;
  scenes: AiStudioSceneInput[];
}): Promise<AiStudioJob> {
  return request<AiStudioJob>("/api/ai-studio/jobs", {
    method: "POST",
    body: JSON.stringify({
      creatorProfileId: input.creatorProfileId,
      title: input.title,
      aspectRatio: "9:16",
      scenes: input.scenes,
    }),
  });
}

export async function getAiStudioJob(jobId: string): Promise<AiStudioJob> {
  return request<AiStudioJob>(`/api/ai-studio/jobs/${jobId}`);
}

export async function waitForAiStudioJob(
  jobId: string,
  onUpdate: (job: AiStudioJob) => void,
  options: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<AiStudioJob> {
  const intervalMs = options.intervalMs ?? 2500;
  const timeoutAt = Date.now() + (options.timeoutMs ?? 20 * 60_000);
  while (Date.now() < timeoutAt) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const job = await getAiStudioJob(jobId);
    onUpdate(job);
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise(resolve => window.setTimeout(resolve, intervalMs));
  }
  throw new Error("Video generation is taking longer than expected. It will continue in the background.");
}
