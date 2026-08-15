import { storageGet, storageReadBuffer } from "../storage";
import {
  getCreatorProfile,
  markCreatorProfileFailed,
  markCreatorProfileReady,
} from "./repository";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function contentTypeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

async function createElevenLabsInstantVoiceClone(input: {
  name: string;
  sampleKey: string;
}): Promise<{ voiceId: string; requiresVerification: boolean }> {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const sample = await storageReadBuffer(input.sampleKey);
  const form = new FormData();
  form.append("name", input.name);
  form.append("description", "SpyReels creator voice clone");
  form.append("remove_background_noise", "false");
  form.append(
    "files",
    new Blob([new Uint8Array(sample)], { type: contentTypeFromKey(input.sampleKey) }),
    input.sampleKey.split("/").pop() || "voice-sample.mp3"
  );

  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs voice clone failed (${response.status}): ${await response.text()}`);
  }
  const payload = (await response.json()) as {
    voice_id?: string;
    requires_verification?: boolean;
  };
  if (!payload.voice_id) throw new Error("ElevenLabs did not return a voice ID");
  return {
    voiceId: payload.voice_id,
    requiresVerification: Boolean(payload.requires_verification),
  };
}

async function provisionHeyGenAvatar(input: {
  profileId: string;
  creatorName: string;
  trainingVideoKey: string;
}): Promise<{ avatarId: string; providerMetadata: Record<string, unknown> }> {
  const existingDefault = process.env.HEYGEN_DEFAULT_AVATAR_ID?.trim();
  const provisioningWebhook = process.env.HEYGEN_AVATAR_PROVISIONING_WEBHOOK_URL?.trim();

  if (!provisioningWebhook) {
    if (!existingDefault) {
      throw new Error(
        "Configure HEYGEN_AVATAR_PROVISIONING_WEBHOOK_URL for per-user digital twins or HEYGEN_DEFAULT_AVATAR_ID for development"
      );
    }
    return {
      avatarId: existingDefault,
      providerMetadata: { avatarProvisioning: "default_avatar" },
    };
  }

  const trainingVideo = await storageGet(input.trainingVideoKey);
  const response = await fetch(provisioningWebhook, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.AI_STUDIO_WORKER_SECRET
        ? { authorization: `Bearer ${process.env.AI_STUDIO_WORKER_SECRET}` }
        : {}),
    },
    body: JSON.stringify({
      profileId: input.profileId,
      creatorName: input.creatorName,
      trainingVideoUrl: trainingVideo.url,
      consentConfirmed: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Avatar provisioning failed (${response.status}): ${await response.text()}`);
  }
  const payload = (await response.json()) as {
    avatarId?: string;
    avatar_id?: string;
    metadata?: Record<string, unknown>;
  };
  const avatarId = payload.avatarId || payload.avatar_id;
  if (!avatarId) throw new Error("Avatar provisioning did not return an avatar ID");
  return {
    avatarId,
    providerMetadata: {
      avatarProvisioning: "webhook",
      ...(payload.metadata ?? {}),
    },
  };
}

export async function provisionCreatorProfile(input: {
  profileId: string;
  userId: number;
  workspaceId: string;
}): Promise<{ voiceId: string; avatarId: string }> {
  const profile = await getCreatorProfile({
    id: input.profileId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!profile) throw new Error("AI creator profile not found");
  if (!profile.voiceSampleKey) throw new Error("Voice sample upload is missing");
  if (!profile.trainingVideoKey) throw new Error("Training video upload is missing");

  try {
    const [voice, avatar] = await Promise.all([
      createElevenLabsInstantVoiceClone({
        name: `${profile.name} - SpyReels`,
        sampleKey: profile.voiceSampleKey,
      }),
      provisionHeyGenAvatar({
        profileId: profile.id,
        creatorName: profile.name,
        trainingVideoKey: profile.trainingVideoKey,
      }),
    ]);

    await markCreatorProfileReady({
      id: profile.id,
      voiceId: voice.voiceId,
      avatarId: avatar.avatarId,
      providerMetadata: {
        voiceClone: "elevenlabs_ivc",
        voiceRequiresVerification: voice.requiresVerification,
        ...avatar.providerMetadata,
      },
    });

    return { voiceId: voice.voiceId, avatarId: avatar.avatarId };
  } catch (error) {
    await markCreatorProfileFailed({
      id: profile.id,
      error: error instanceof Error ? error.message : "Creator provisioning failed",
    });
    throw error;
  }
}
