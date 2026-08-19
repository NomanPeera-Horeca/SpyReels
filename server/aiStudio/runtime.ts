import { createAiStudioProviders } from "./providers";
import { R2AiStudioAssetStore } from "./assets";
import {
  getCreatorProfile,
  getJobInput,
  getJobScenes,
  getVideoJob,
  updateSceneResult,
  updateVideoJob,
} from "./repository";
import type { AiStudioScene, GeneratedPresenterClip, GeneratedVoice } from "./types";

async function persistVoice(
  assets: R2AiStudioAssetStore,
  workspaceId: string,
  jobId: string,
  scene: AiStudioScene,
  voice: GeneratedVoice
): Promise<GeneratedVoice> {
  if (!voice.audioUrl.startsWith("data:")) return voice;
  return {
    ...voice,
    audioUrl: await assets.persistDataUrl({
      key: `ai-studio/${workspaceId}/jobs/${jobId}/scene-${scene.order + 1}.mp3`,
      dataUrl: voice.audioUrl,
      contentType: "audio/mpeg",
    }),
  };
}

async function pollHeyGen(providerJobId: string): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY?.trim();
  if (!apiKey) throw new Error("HEYGEN_API_KEY is not configured");
  const timeoutAt = Date.now() + Number(process.env.AI_STUDIO_PROVIDER_TIMEOUT_MS || 12 * 60_000);
  while (Date.now() < timeoutAt) {
    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(providerJobId)}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!response.ok) throw new Error(`HeyGen status failed (${response.status}): ${await response.text()}`);
    const payload = (await response.json()) as {
      data?: { status?: string; video_url?: string; error?: string };
    };
    if (payload.data?.status === "completed" && payload.data.video_url) return payload.data.video_url;
    if (payload.data?.status === "failed") throw new Error(payload.data.error || "HeyGen render failed");
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error("HeyGen render timed out");
}

async function resolvePresenter(clip: GeneratedPresenterClip): Promise<GeneratedPresenterClip> {
  if (clip.videoUrl) return clip;
  if (!clip.providerJobId) throw new Error("Avatar provider returned no video URL or job ID");
  return { ...clip, videoUrl: await pollHeyGen(clip.providerJobId) };
}

export async function runPersistentAiStudioJob(jobId: string): Promise<void> {
  const input = await getJobInput(jobId);
  if (!input) throw new Error(`AI Studio job ${jobId} was not found`);
  const scenes = await getJobScenes(jobId);
  const profileRecord = await getCreatorProfile({
    id: input.creatorProfileId,
    userId: Number(input.userId),
    workspaceId: input.workspaceId,
  });
  if (!profileRecord) throw new Error("Creator profile was not found");

  const providers = createAiStudioProviders();
  const assets = new R2AiStudioAssetStore();
  const manifest: Array<{
    sceneId: string;
    order: number;
    type: string;
    script: string;
    durationSeconds: number;
    voiceUrl?: string;
    presenterUrl?: string;
    brollQuery?: string;
    visualDirection?: string;
  }> = [];

  try {
    await updateVideoJob({ id: jobId, status: "directing", progress: 10, currentStep: "Directing scene performance" });
    for (const scene of scenes.sort((a, b) => a.order - b.order)) {
      await updateSceneResult({ jobId, sceneId: scene.id, status: "processing" });
      if (scene.type !== "presenter") {
        manifest.push({
          sceneId: scene.id,
          order: scene.order,
          type: scene.type,
          script: scene.script,
          durationSeconds: scene.durationSeconds,
          brollQuery: scene.brollQuery,
          visualDirection: scene.visualDirection,
        });
        await updateSceneResult({ jobId, sceneId: scene.id, status: "completed", qualityScore: 90 });
        continue;
      }

      await updateVideoJob({
        id: jobId,
        status: "generating_voice",
        progress: 20 + Math.round((scene.order / Math.max(1, scenes.length)) * 20),
        currentStep: `Generating natural voice for scene ${scene.order + 1}`,
      });
      const generatedVoice = await providers.voice.generateVoice({ scene, profile: profileRecord.profile });
      const voice = await persistVoice(assets, input.workspaceId, jobId, scene, generatedVoice);

      await updateVideoJob({
        id: jobId,
        status: "generating_presenter",
        progress: 42 + Math.round((scene.order / Math.max(1, scenes.length)) * 25),
        currentStep: `Generating presenter for scene ${scene.order + 1}`,
      });
      const presenter = await resolvePresenter(
        await providers.avatar.generatePresenterClip({ scene, profile: profileRecord.profile, voice })
      );

      manifest.push({
        sceneId: scene.id,
        order: scene.order,
        type: scene.type,
        script: scene.script,
        durationSeconds: scene.durationSeconds,
        voiceUrl: voice.audioUrl,
        presenterUrl: presenter.videoUrl,
        visualDirection: scene.visualDirection,
      });
      await updateSceneResult({
        jobId,
        sceneId: scene.id,
        status: "completed",
        voiceUrl: voice.audioUrl,
        presenterUrl: presenter.videoUrl,
        qualityScore: 94,
      });
    }

    await updateVideoJob({ id: jobId, status: "collecting_broll", progress: 70, currentStep: "Matching B-roll and graphics" });
    const manifestStored = await assets.persistDataUrl({
      key: `ai-studio/${input.workspaceId}/jobs/${jobId}/render-manifest.json`,
      dataUrl: `data:application/json;base64,${Buffer.from(JSON.stringify({ jobId, title: input.title, aspectRatio: input.aspectRatio, scenes: manifest }, null, 2)).toString("base64")}`,
      contentType: "application/json",
    });

    await updateVideoJob({
      id: jobId,
      status: "composing",
      progress: 80,
      currentStep: "Queued for Remotion/FFmpeg composition",
      outputUrl: manifestStored,
    });

    const composerWebhook = process.env.AI_STUDIO_COMPOSER_WEBHOOK_URL?.trim();
    if (!composerWebhook) {
      await updateVideoJob({
        id: jobId,
        status: "quality_check",
        progress: 92,
        currentStep: "Provider scenes ready; composer worker not configured",
        outputUrl: manifestStored,
      });
      return;
    }

    const response = await fetch(composerWebhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.AI_STUDIO_WORKER_SECRET
          ? { authorization: `Bearer ${process.env.AI_STUDIO_WORKER_SECRET}` }
          : {}),
      },
      body: JSON.stringify({ jobId, manifestUrl: manifestStored }),
    });
    if (!response.ok) throw new Error(`Composer enqueue failed (${response.status}): ${await response.text()}`);
  } catch (error) {
    await updateVideoJob({
      id: jobId,
      status: "failed",
      progress: 100,
      currentStep: "Video generation failed",
      error: error instanceof Error ? error.message : "Unknown AI Studio failure",
    });
    throw error;
  }
}

export async function completePersistentAiStudioJob(input: {
  jobId: string;
  outputUrl: string;
  outputKey?: string;
}): Promise<void> {
  await updateVideoJob({
    id: input.jobId,
    status: "completed",
    progress: 100,
    currentStep: "Video ready",
    outputUrl: input.outputUrl,
    outputKey: input.outputKey,
  });
}

export async function getPersistentAiStudioJob(input: {
  jobId: string;
  userId: number;
  workspaceId: string;
}) {
  return getVideoJob({ id: input.jobId, userId: input.userId, workspaceId: input.workspaceId });
}
