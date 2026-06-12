import { describe, expect, it, vi } from "vitest";
import {
  assertLibraryTranscriptionReadyOnce,
  evaluateRemakeabilityGate,
  isTranscriptionReadyForRecreate,
  libraryEasedPercent,
  libraryRemakeButtonLabel,
  libraryRemakeKey,
  LIBRARY_TRANSCRIBE_MAX,
  waitForLibraryTranscriptionReady,
} from "@/lib/libraryRemakeChainCore";

describe("libraryRemakeKey", () => {
  it("keys user, featured, and collected sources", () => {
    expect(libraryRemakeKey({ source: "user", reelId: 42 })).toBe("user:42");
    expect(libraryRemakeKey({ source: "featured", featuredReelId: 7 })).toBe("featured:7");
    expect(libraryRemakeKey({ source: "collected", collectedReelId: 99 })).toBe("collected:99");
  });
});

describe("isTranscriptionReadyForRecreate", () => {
  it("accepts completed with transcript text", () => {
    expect(
      isTranscriptionReadyForRecreate({ status: "completed", transcript: "hello world" })
    ).toBe(true);
  });

  it("rejects completed with segment text only (no transcript field)", () => {
    expect(
      isTranscriptionReadyForRecreate({
        status: "completed",
        transcript: "",
        segments: [{ text: "spoken words here" }],
      })
    ).toBe(false);
  });

  it("rejects whitespace-only transcript", () => {
    expect(
      isTranscriptionReadyForRecreate({ status: "completed", transcript: "   ", segments: [] })
    ).toBe(false);
  });

  it("rejects completed with empty transcript and no segments", () => {
    expect(
      isTranscriptionReadyForRecreate({ status: "completed", transcript: "", segments: [] })
    ).toBe(false);
  });

  it("rejects processing", () => {
    expect(isTranscriptionReadyForRecreate({ status: "processing", transcript: "x" })).toBe(false);
  });
});

describe("assertLibraryTranscriptionReadyOnce", () => {
  it("returns immediately when already ready (no poll)", async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: "completed",
      transcript: "enough words for remake",
    });
    await assertLibraryTranscriptionReadyOnce(fetch, { reelId: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws no-voice on terminal completed empty", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: "completed", transcript: "", segments: [] });
    await expect(assertLibraryTranscriptionReadyOnce(fetch, { reelId: 1 })).rejects.toThrow(
      /No voice detected/
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when still processing (parent said ready but server disagrees)", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: "processing", transcript: null });
    await expect(assertLibraryTranscriptionReadyOnce(fetch, { reelId: 1 })).rejects.toThrow(
      /not ready yet/
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws no-voice on completed segments-only without transcript", async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: "completed",
      transcript: "",
      segments: [{ text: "spoken words here" }],
    });
    await expect(assertLibraryTranscriptionReadyOnce(fetch, { reelId: 1 })).rejects.toThrow(
      /No voice detected/
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("waitForLibraryTranscriptionReady", () => {
  it("polls until ready", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: "processing" })
      .mockResolvedValueOnce({ status: "completed", transcript: "done" });

    await waitForLibraryTranscriptionReady(fetch, { reelId: 1 }, { pollMs: 0, maxAttempts: 5 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws no-voice on terminal completed empty after poll", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: "completed", transcript: "", segments: [] });
    await expect(
      waitForLibraryTranscriptionReady(fetch, { reelId: 1 }, { pollMs: 0, maxAttempts: 2 })
    ).rejects.toThrow(/No voice detected/);
  });

  it("throws no-voice on completed segments-only without transcript", async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: "completed",
      transcript: "",
      segments: [{ text: "spoken words here" }],
    });
    await expect(
      waitForLibraryTranscriptionReady(fetch, { reelId: 1 }, { pollMs: 0, maxAttempts: 2 })
    ).rejects.toThrow(/No voice detected/);
  });

  it("throws on failed status", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: "failed" });
    await expect(
      waitForLibraryTranscriptionReady(fetch, { reelId: 1 }, { pollMs: 0, maxAttempts: 2 })
    ).rejects.toThrow(/Transcription failed/);
  });

  it("times out when never ready", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: "processing" });
    await expect(
      waitForLibraryTranscriptionReady(fetch, { reelId: 1 }, { pollMs: 0, maxAttempts: 2 })
    ).rejects.toThrow(/timed out/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("libraryEasedPercent", () => {
  it("uses LIBRARY_TRANSCRIBE_MAX for transcribing band ceiling", () => {
    const atMax = libraryEasedPercent("transcribing", LIBRARY_TRANSCRIBE_MAX, LIBRARY_TRANSCRIBE_MAX);
    expect(atMax).toBeLessThan(65);
    expect(atMax).toBeGreaterThanOrEqual(25);
  });
});

describe("evaluateRemakeabilityGate", () => {
  it("proceeds for long enough transcript", () => {
    const tx = {
      status: "completed",
      transcript: "one two three four five six seven eight",
      segments: [],
    };
    expect(evaluateRemakeabilityGate(tx)).toEqual({ proceed: true });
  });

  it("stops for too_short heuristic", () => {
    const tx = { status: "completed", transcript: "hi there", segments: [] };
    expect(evaluateRemakeabilityGate(tx).proceed).toBe(false);
  });

  it("honors Tier-2 classification", () => {
    const tx = {
      status: "completed",
      transcript: "one two three four five six seven eight nine",
      segments: [],
    };
    const result = evaluateRemakeabilityGate(tx, {
      classifiedAt: new Date(),
      suggestedAction: "save_inspiration",
      classificationReason: "Music-heavy reel",
    });
    expect(result).toEqual({
      proceed: false,
      classificationReason: "Music-heavy reel",
    });
  });
});

describe("libraryRemakeButtonLabel", () => {
  it("returns Remake now when idle", () => {
    expect(libraryRemakeButtonLabel({ stage: "idle", progressPercent: 0 })).toBe("Remake now");
  });

  it("shows percent while generating", () => {
    expect(libraryRemakeButtonLabel({ stage: "generating", progressPercent: 72 })).toBe(
      "Generating… 72%"
    );
  });
});
