import type {
  AiStudioScene,
  CreatorPerformanceProfile,
  GeneratedPresenterClip,
  GeneratedVoice,
} from "./types";

export interface VoiceProvider {
  generateVoice(input: {
    scene: AiStudioScene;
    profile: CreatorPerformanceProfile;
  }): Promise<GeneratedVoice>;
}

export interface AvatarProvider {
  generatePresenterClip(input: {
    scene: AiStudioScene;
    profile: CreatorPerformanceProfile;
    voice: GeneratedVoice;
  }): Promise<GeneratedPresenterClip>;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  async generateVoice({ scene, profile }: { scene: AiStudioScene; profile: CreatorPerformanceProfile }): Promise<GeneratedVoice> {
    const apiKey = requireEnv("ELEVENLABS_API_KEY");
    const voiceId = profile.voiceId ?? requireEnv("ELEVENLABS_DEFAULT_VOICE_ID");

    const text = [
      scene.pauseBeforeMs > 0 ? "<break time=\"0.3s\" />" : "",
      scene.script,
      scene.pauseAfterMs > 0 ? "<break time=\"0.4s\" />" : "",
    ].join(" ").trim();

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        voice_settings: {
          stability: Math.max(0.25, 0.72 - scene.energy * 0.25),
          similarity_boost: 0.82,
          style: Math.min(1, 0.2 + scene.energy * 0.7),
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs request failed (${response.status}): ${await response.text()}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const dataUrl = `data:audio/mpeg;base64,${bytes.toString("base64")}`;
    return { provider: "elevenlabs", audioUrl: dataUrl };
  }
}

export class HeyGenAvatarProvider implements AvatarProvider {
  async generatePresenterClip({ scene, profile, voice }: { scene: AiStudioScene; profile: CreatorPerformanceProfile; voice: GeneratedVoice }): Promise<GeneratedPresenterClip> {
    const apiKey = requireEnv("HEYGEN_API_KEY");
    const avatarId = profile.avatarId ?? requireEnv("HEYGEN_DEFAULT_AVATAR_ID");

    const response = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        video_inputs: [
          {
            character: {
              type: "avatar",
              avatar_id: avatarId,
              avatar_style: "normal",
            },
            voice: {
              type: "audio",
              audio_url: voice.audioUrl,
            },
            background: {
              type: "color",
              value: "#111111",
            },
          },
        ],
        dimension: { width: 1080, height: 1920 },
        caption: false,
        title: `SpyReels scene ${scene.id}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`HeyGen request failed (${response.status}): ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      data?: { video_id?: string; video_url?: string };
      error?: { message?: string };
    };

    const providerJobId = payload.data?.video_id;
    const videoUrl = payload.data?.video_url;
    if (!providerJobId && !videoUrl) {
      throw new Error(payload.error?.message || "HeyGen did not return a video job id");
    }

    return {
      provider: "heygen",
      videoUrl: videoUrl || "",
      providerJobId,
    };
  }
}

export class MockVoiceProvider implements VoiceProvider {
  async generateVoice(): Promise<GeneratedVoice> {
    return { provider: "mock", audioUrl: "mock://voice" };
  }
}

export class MockAvatarProvider implements AvatarProvider {
  async generatePresenterClip({ scene }: { scene: AiStudioScene }): Promise<GeneratedPresenterClip> {
    return { provider: "mock", videoUrl: `mock://presenter/${scene.id}` };
  }
}

export function createAiStudioProviders(): { voice: VoiceProvider; avatar: AvatarProvider } {
  const useMock = process.env.AI_STUDIO_USE_MOCK_PROVIDERS === "true";
  return useMock
    ? { voice: new MockVoiceProvider(), avatar: new MockAvatarProvider() }
    : { voice: new ElevenLabsVoiceProvider(), avatar: new HeyGenAvatarProvider() };
}
