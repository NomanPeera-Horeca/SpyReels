import { storagePut, storagePutPresigned } from "../storage";
import type { AiStudioAssetStore } from "./orchestrator";

function decodeDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Invalid data URL");
  const [, contentType = "application/octet-stream", base64, payload] = match;
  return {
    contentType,
    bytes: base64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload)),
  };
}

export class R2AiStudioAssetStore implements AiStudioAssetStore {
  async persistDataUrl(input: { key: string; dataUrl: string; contentType: string }): Promise<string> {
    const decoded = decodeDataUrl(input.dataUrl);
    const stored = await storagePut(input.key, decoded.bytes, input.contentType || decoded.contentType);
    return stored.url;
  }
}

export async function createAiStudioUpload(input: {
  workspaceId: string;
  userId: number;
  profileId: string;
  kind: "training-video" | "voice-sample";
  filename: string;
  contentType: string;
}): Promise<{ key: string; uploadUrl: string; url: string }> {
  const safeName = input.filename
    .replace(/^.*[/\\]/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 120);
  const key = `ai-studio/${input.workspaceId}/profiles/${input.profileId}/${input.kind}-${Date.now()}-${safeName}`;
  return storagePutPresigned(key, input.contentType, 3600);
}
