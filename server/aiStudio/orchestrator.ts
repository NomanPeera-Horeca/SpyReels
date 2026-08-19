import { randomUUID } from "node:crypto";
import type {
  AiStudioJobSnapshot,
  CreateVideoJobInput,
  GeneratedPresenterClip,
  GeneratedVoice,
  VideoJobStatus,
} from "./types";
import { createVideoJobInputSchema } from "./types";
import type { AvatarProvider, VoiceProvider } from "./providers";

export interface AiStudioJobStore {
  create(snapshot: AiStudioJobSnapshot): Promise<void>;
  update(id: string, patch: Partial<AiStudioJobSnapshot>): Promise<void>;
  get(id: string): Promise<AiStudioJobSnapshot | null>;
}

export interface AiStudioAssetStore {
  persistDataUrl(input: { key: string; dataUrl: string; contentType: string }): Promise<string>;
}

export interface AiStudioComposer {
  compose(input: {
    jobId: string;
    title: string;
    aspectRatio: "9:16";
    scenes: Array<{
      sceneId: string;
      presenter?: GeneratedPresenterClip;
      voice?: GeneratedVoice;
      script: string;
      type: "presenter" | "broll" | "graphic";
      durationSeconds: number;
    }>;
  }): Promise<{ outputUrl: string }>;
}

const statusProgress: Record<VideoJobStatus, number> = {
  queued: 2,
  directing: 10,
  generating_voice: 25,
  generating_presenter: 48,
  collecting_broll: 62,
  composing: 78,
  quality_check: 92,
  completed: 100,
  failed: 100,
  cancelled: 100,
};

export class AiStudioOrchestrator {
  constructor(
    private readonly dependencies: {
      jobs: AiStudioJobStore;
      assets: AiStudioAssetStore;
      voice: VoiceProvider;
      avatar: AvatarProvider;
      composer: AiStudioComposer;
    }
  ) {}

  async createJob(rawInput: CreateVideoJobInput): Promise<AiStudioJobSnapshot> {
    const input = createVideoJobInputSchema.parse(rawInput);
    const now = new Date().toISOString();
    const snapshot: AiStudioJobSnapshot = {
      id: randomUUID(),
      status: "queued",
      progress: statusProgress.queued,
      currentStep: "Waiting to start",
      createdAt: now,
      updatedAt: now,
    };
    await this.dependencies.jobs.create(snapshot);

    void this.run(snapshot.id, input).catch(async error => {
      await this.transition(snapshot.id, "failed", {
        currentStep: "Video generation failed",
        error: error instanceof Error ? error.message : "Unknown AI Studio error",
      });
    });

    return snapshot;
  }

  async getJob(jobId: string): Promise<AiStudioJobSnapshot | null> {
    return this.dependencies.jobs.get(jobId);
  }

  private async transition(
    jobId: string,
    status: VideoJobStatus,
    patch: Partial<AiStudioJobSnapshot> = {}
  ): Promise<void> {
    await this.dependencies.jobs.update(jobId, {
      status,
      progress: statusProgress[status],
      updatedAt: new Date().toISOString(),
      ...patch,
    });
  }

  private async run(jobId: string, input: CreateVideoJobInput): Promise<void> {
    await this.transition(jobId, "directing", { currentStep: "Directing scene performance" });

    const generatedScenes: Array<{
      sceneId: string;
      presenter?: GeneratedPresenterClip;
      voice?: GeneratedVoice;
      script: string;
      type: "presenter" | "broll" | "graphic";
      durationSeconds: number;
    }> = [];

    for (const scene of input.scenes.sort((a, b) => a.order - b.order)) {
      if (scene.type !== "presenter") {
        generatedScenes.push({
          sceneId: scene.id,
          script: scene.script,
          type: scene.type,
          durationSeconds: scene.durationSeconds,
        });
        continue;
      }

      await this.transition(jobId, "generating_voice", {
        currentStep: `Generating natural voice for scene ${scene.order + 1}`,
      });
      let voice = await this.dependencies.voice.generateVoice({ scene, profile: input.profile });

      if (voice.audioUrl.startsWith("data:")) {
        voice = {
          ...voice,
          audioUrl: await this.dependencies.assets.persistDataUrl({
            key: `ai-studio/${input.workspaceId}/${jobId}/scene-${scene.order + 1}.mp3`,
            dataUrl: voice.audioUrl,
            contentType: "audio/mpeg",
          }),
        };
      }

      await this.transition(jobId, "generating_presenter", {
        currentStep: `Generating presenter for scene ${scene.order + 1}`,
      });
      const presenter = await this.dependencies.avatar.generatePresenterClip({
        scene,
        profile: input.profile,
        voice,
      });

      generatedScenes.push({
        sceneId: scene.id,
        script: scene.script,
        type: scene.type,
        durationSeconds: scene.durationSeconds,
        voice,
        presenter,
      });
    }

    await this.transition(jobId, "collecting_broll", { currentStep: "Matching B-roll and graphics" });
    await this.transition(jobId, "composing", { currentStep: "Adding captions and composing final Reel" });

    const result = await this.dependencies.composer.compose({
      jobId,
      title: input.title,
      aspectRatio: input.aspectRatio,
      scenes: generatedScenes,
    });

    await this.transition(jobId, "quality_check", { currentStep: "Running final quality checks" });
    await this.transition(jobId, "completed", {
      currentStep: "Video ready",
      outputUrl: result.outputUrl,
    });
  }
}

export class InMemoryAiStudioJobStore implements AiStudioJobStore {
  private readonly jobs = new Map<string, AiStudioJobSnapshot>();

  async create(snapshot: AiStudioJobSnapshot): Promise<void> {
    this.jobs.set(snapshot.id, snapshot);
  }

  async update(id: string, patch: Partial<AiStudioJobSnapshot>): Promise<void> {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`AI Studio job ${id} was not found`);
    this.jobs.set(id, { ...current, ...patch });
  }

  async get(id: string): Promise<AiStudioJobSnapshot | null> {
    return this.jobs.get(id) ?? null;
  }
}
