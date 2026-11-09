import { afterEach, describe, expect, it } from "vitest";
import {
  librarySourceEnabled,
  shouldStartLibraryTranscription,
  toTranscriptionStatus,
  type LibraryTranscript,
} from "./libraryTranscripts";
import { audienceLine } from "../personalization/activeNiche";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const row = (over: Partial<LibraryTranscript>): LibraryTranscript => ({
  candidateId: 7,
  status: "processing",
  transcript: null,
  segments: null,
  errorMessage: null,
  startedAt: new Date(NOW - 60_000),
  ...over,
});

describe("library source switch", () => {
  const before = process.env.REMAKE_LIBRARY_SOURCE;
  afterEach(() => {
    if (before === undefined) delete process.env.REMAKE_LIBRARY_SOURCE;
    else process.env.REMAKE_LIBRARY_SOURCE = before;
  });
  it("is off unless set to on", () => {
    delete process.env.REMAKE_LIBRARY_SOURCE;
    expect(librarySourceEnabled()).toBe(false);
    process.env.REMAKE_LIBRARY_SOURCE = "true";
    expect(librarySourceEnabled()).toBe(false);
    process.env.REMAKE_LIBRARY_SOURCE = "on";
    expect(librarySourceEnabled()).toBe(true);
  });
});

describe("shouldStartLibraryTranscription", () => {
  it("starts when the video was never transcribed", () => {
    expect(shouldStartLibraryTranscription(null, NOW)).toBe(true);
  });
  it("reuses a finished transcript (no new download, no usage charge)", () => {
    expect(shouldStartLibraryTranscription(row({ status: "completed", transcript: "hello" }), NOW)).toBe(false);
  });
  it("retries a finished but empty transcript", () => {
    expect(shouldStartLibraryTranscription(row({ status: "completed", transcript: "  " }), NOW)).toBe(true);
  });
  it("retries after a failure", () => {
    expect(shouldStartLibraryTranscription(row({ status: "failed" }), NOW)).toBe(true);
  });
  it("waits for a fresh run started by someone else", () => {
    expect(shouldStartLibraryTranscription(row({ startedAt: new Date(NOW - 5 * 60_000) }), NOW)).toBe(false);
  });
  it("takes over a run stuck for more than 15 minutes", () => {
    expect(shouldStartLibraryTranscription(row({ startedAt: new Date(NOW - 16 * 60_000) }), NOW)).toBe(true);
    expect(shouldStartLibraryTranscription(row({ startedAt: null }), NOW)).toBe(true);
  });
});

describe("toTranscriptionStatus", () => {
  it("returns the shape the remake chain reads from transcribe.status", () => {
    expect(toTranscriptionStatus(null)).toBeNull();
    expect(
      toTranscriptionStatus(row({ status: "completed", transcript: "hi", segments: [{ start: 0, text: "hi" }] }))
    ).toEqual({ id: 7, status: "completed", transcript: "hi", segments: [{ start: 0, text: "hi" }], errorMessage: null });
  });
});

describe("audienceLine (new-onboarding audience used by Adapt to my niche)", () => {
  it("joins who and outcome", () => {
    expect(audienceLine({ who: "New moms", outcome: "lose baby weight" })).toBe("New moms, wants to lose baby weight");
  });
  it("uses who alone, and ignores empty payloads", () => {
    expect(audienceLine({ who: " Gym beginners " })).toBe("Gym beginners");
    expect(audienceLine({ outcome: "x" })).toBeNull();
    expect(audienceLine(null)).toBeNull();
  });
});
