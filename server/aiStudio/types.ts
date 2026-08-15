import { z } from "zod";

export const aiStudioSceneTypeSchema = z.enum(["presenter", "broll", "graphic"]);
export type AiStudioSceneType = z.infer<typeof aiStudioSceneTypeSchema>;

export const aiStudioSceneSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  type: aiStudioSceneTypeSchema,
  script: z.string().min(1),
  durationSeconds: z.number().positive().max(30),
  emotion: z.enum(["neutral", "confident", "excited", "serious", "concerned", "warm"]),
  pace: z.enum(["slow", "medium", "medium_fast", "fast"]),
  energy: z.number().min(0).max(1),
  pauseBeforeMs: z.number().int().nonnegative().max(5000).default(0),
  pauseAfterMs: z.number().int().nonnegative().max(5000).default(0),
  emphasizedWords: z.array(z.string()).default([]),
  visualDirection: z.string().optional(),
  brollQuery: z.string().optional(),
});
export type AiStudioScene = z.infer<typeof aiStudioSceneSchema>;

export const creatorPerformanceProfileSchema = z.object({
  creatorId: z.string().min(1),
  presenterStyle: z.enum(["office", "podcast", "whiteboard", "warehouse", "studio", "walking"]),
  voiceProvider: z.enum(["elevenlabs", "none"]).default("none"),
  avatarProvider: z.enum(["heygen", "none"]).default("none"),
  voiceId: z.string().optional(),
  avatarId: z.string().optional(),
  speakingStyle: z.enum(["confident_natural", "high_energy", "calm_teacher", "storytelling"]),
  pace: z.enum(["slow", "medium", "medium_fast", "fast"]),
  hookEnergy: z.number().min(0).max(1),
  teachingEnergy: z.number().min(0).max(1),
  ctaEnergy: z.number().min(0).max(1),
  captionStyle: z.enum(["bold_keywords", "minimal", "karaoke"]),
  captionHighlightHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  favoriteTransitions: z.array(z.string()).max(20).default([]),
});
export type CreatorPerformanceProfile = z.infer<typeof creatorPerformanceProfileSchema>;

export const createVideoJobInputSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  scriptId: z.string().optional(),
  title: z.string().min(1).max(240),
  aspectRatio: z.literal("9:16").default("9:16"),
  profile: creatorPerformanceProfileSchema,
  scenes: z.array(aiStudioSceneSchema).min(1).max(30),
});
export type CreateVideoJobInput = z.infer<typeof createVideoJobInputSchema>;

export const videoJobStatusSchema = z.enum([
  "queued",
  "directing",
  "generating_voice",
  "generating_presenter",
  "collecting_broll",
  "composing",
  "quality_check",
  "completed",
  "failed",
  "cancelled",
]);
export type VideoJobStatus = z.infer<typeof videoJobStatusSchema>;

export type GeneratedVoice = {
  provider: "elevenlabs" | "mock";
  audioUrl: string;
  durationSeconds?: number;
  alignment?: Array<{ word: string; startMs: number; endMs: number }>;
};

export type GeneratedPresenterClip = {
  provider: "heygen" | "mock";
  videoUrl: string;
  durationSeconds?: number;
  providerJobId?: string;
};

export type AiStudioJobSnapshot = {
  id: string;
  status: VideoJobStatus;
  progress: number;
  currentStep: string;
  outputUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
