import { describe, expect, it } from "vitest";
import { toSavedListTranscriptionSummary } from "@shared/savedListTranscription";

describe("toSavedListTranscriptionSummary", () => {
  it("strips segments and returns speech metadata", () => {
    const summary = toSavedListTranscriptionSummary({
      status: "completed",
      transcript: "",
      segments: [{ text: "Hello world from segments" }],
      startedAt: null,
    });

    expect(summary).toEqual({
      status: "completed",
      startedAt: null,
      hasSpeech: true,
      wordCount: 4,
      musicHeavy: false,
    });
  });

  it("flags no-speech completed transcriptions", () => {
    const summary = toSavedListTranscriptionSummary({
      status: "completed",
      transcript: "",
      segments: [],
    });

    expect(summary?.hasSpeech).toBe(false);
    expect(summary?.wordCount).toBe(0);
  });
});
