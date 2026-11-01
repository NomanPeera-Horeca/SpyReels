import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  getSharedTranscript: vi.fn(),
  saveSharedTranscript: vi.fn(async () => undefined),
}));
vi.mock("./sharedTranscriptStore", async importOriginal => ({
  ...(await importOriginal<typeof import("./sharedTranscriptStore")>()),
  getSharedTranscript: store.getSharedTranscript,
  saveSharedTranscript: store.saveSharedTranscript,
}));

import { transcribeReel } from "../services/transcribeReel";
import { sharedTranscriptKey } from "./sharedTranscriptStore";

describe("shared transcripts", () => {
  beforeEach(() => {
    store.getSharedTranscript.mockReset();
    store.saveSharedTranscript.mockClear();
  });

  it("reuses a saved transcript instead of paying Deepgram again", async () => {
    store.getSharedTranscript.mockResolvedValue({
      status: "ok",
      transcript: "hello world",
      segments: [{ start: 0, end: 1, text: "hello world" }],
      durationSec: 12,
      source: "deepgram",
      partial: false,
    });
    const r = await transcribeReel({
      videoUrl: "https://example.invalid/never-downloaded.mp4",
      shortcode: "ABC",
      cacheKey: { platform: "instagram", sourceId: "ABC" },
    });
    expect(r).toMatchObject({ success: true, transcript: "hello world", durationSec: 12 });
    expect(store.getSharedTranscript).toHaveBeenCalledWith("instagram", "ABC");
    expect(store.saveSharedTranscript).not.toHaveBeenCalled();
  });

  it("reuses a saved 'no speech' result", async () => {
    store.getSharedTranscript.mockResolvedValue({ status: "no_speech", durationSec: 9, source: "deepgram" });
    const r = await transcribeReel({
      videoUrl: "https://example.invalid/x.mp4",
      shortcode: "XYZ",
      cacheKey: { platform: "tiktok", sourceId: "XYZ" },
    });
    expect(r).toMatchObject({ success: false, errorCode: "NO_SPEECH_DETECTED" });
  });

  it("only keys public videos on known platforms", () => {
    expect(sharedTranscriptKey("YouTube", " abc ")).toEqual({ platform: "youtube", sourceId: "abc" });
    expect(sharedTranscriptKey("facebook", "abc")).toBeNull();
    expect(sharedTranscriptKey("tiktok", "")).toBeNull();
  });
});
