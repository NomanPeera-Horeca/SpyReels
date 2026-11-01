import { describe, expect, it, vi } from "vitest";
import { cleanViralFormat } from "../../../shared/viralFormats";
import { cosineSimilarity } from "../embeddings";
import { frameCountFor, parseAnalysis, planFrameTimes } from "../frames";
import { buildVideoPrompt, cleanVideoReading, creatorTopicsFromVideos } from "../videoUnderstanding";
import { youtubeVideoIdFromUrl } from "../../youtube";

describe("frames", () => {
  it("parses duration, scene changes and silence from ffmpeg output", () => {
    const stderr = [
      "  Duration: 00:00:20.00, start: 0.000000, bitrate: 54 kb/s",
      "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono",
      "[Parsed_showinfo_1 @ 0x1] n:   0 pts:  76800 pts_time:5       duration:512",
      "[Parsed_showinfo_1 @ 0x1] n:   1 pts: 153600 pts_time:10      duration:512",
      "[silencedetect @ 0x2] silence_end: 20 | silence_duration: 10.0156",
    ].join("\n");
    const a = parseAnalysis(stderr);
    expect(a.durationSec).toBe(20);
    expect(a.sceneTimes).toEqual([5, 10]);
    expect(a.soundRatio).toBeCloseTo(0.5, 1);
  });

  it("has no sound when there is no audio stream", () => {
    expect(parseAnalysis("  Duration: 00:00:12.00, start: 0").soundRatio).toBe(0);
  });

  it("always includes the hook and snaps the rest to scene changes", () => {
    const times = planFrameTimes(20, [5, 10, 15], 8);
    expect(times.slice(0, 2)).toEqual([0.5, 2]);
    expect(times).toContain(5.2);
    expect(times).toContain(10.2);
    expect(times).toContain(15.2);
    expect(times.length).toBe(8);
  });

  it("never sends two frames closer than 0.7s", () => {
    const times = planFrameTimes(3, [], 8);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(0.7);
  });

  it("uses 3-5 frames with clear speech and 8-10 otherwise", () => {
    expect(frameCountFor({ durationSec: 15, clearSpeech: true })).toBe(3);
    expect(frameCountFor({ durationSec: 55, clearSpeech: true })).toBe(5);
    expect(frameCountFor({ durationSec: 30, clearSpeech: false })).toBe(8);
    expect(frameCountFor({ durationSec: 75, clearSpeech: true })).toBe(9);
    expect(frameCountFor({ durationSec: 200, clearSpeech: false })).toBe(10);
  });
});

describe("video reading", () => {
  const known = new Set(["ai-tools", "menu-pricing"]);

  it("keeps a real summary, known topics and a known format", () => {
    expect(
      cleanVideoReading(
        { summary: "  Three ChatGPT prompts that write a restaurant's weekly specials.  ", topics: ["ai-tools", "menu-pricing", "nope"], format: "Listicle" },
        known
      )
    ).toEqual({
      summary: "Three ChatGPT prompts that write a restaurant's weekly specials.",
      topics: ["ai-tools", "menu-pricing"],
      format: "listicle",
    });
  });

  it("rejects an answer without a summary", () => {
    expect(cleanVideoReading({ summary: "ok", topics: ["ai-tools"] }, known)).toBeNull();
    expect(cleanVideoReading(null, known)).toBeNull();
  });

  it("maps unknown formats to other", () => {
    expect(cleanViralFormat("talking head opinion")).toBe("talking_head_opinion");
    expect(cleanViralFormat("documentary")).toBe("other");
  });

  it("puts the transcript first and marks the caption as a weak hint", () => {
    const prompt = buildVideoPrompt({
      platform: "tiktok",
      creator: "@chefmike",
      transcript: "Here are three prompts...",
      creatorTopics: ["ai-tools"],
      foundVia: ['search for "AI tools" in Tech'],
      caption: "you won't believe this 😱",
      frameCount: 4,
      frameNote: "4_frames",
    });
    const lines = prompt.split("\n");
    expect(lines[1]).toMatch(/^TRANSCRIPT \(strongest signal\): Here are three prompts/);
    expect(lines.at(-1)).toMatch(/^CAPTION\/TITLE\/HASHTAGS \(weak hint/);
  });
});

describe("creator topics from their videos", () => {
  it("keeps topics seen in 2+ videos, most common first, max 3", () => {
    expect(
      creatorTopicsFromVideos([
        ["ai-tools", "tech-news"],
        ["ai-tools"],
        ["ai-tools", "coding-tips"],
        ["coding-tips", "tech-news"],
        ["gaming"],
      ])
    ).toEqual(["ai-tools", "coding-tips", "tech-news"]);
    expect(creatorTopicsFromVideos([["a"], ["b"]])).toEqual([]);
  });
});

describe("helpers", () => {
  it("reads YouTube ids from every URL shape", () => {
    expect(youtubeVideoIdFromUrl("https://www.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeVideoIdFromUrl("https://youtu.be/abcdefghijk?t=3")).toBe("abcdefghijk");
    expect(youtubeVideoIdFromUrl("https://www.youtube.com/watch?feature=x&v=abcdefghijk")).toBe("abcdefghijk");
    expect(youtubeVideoIdFromUrl("https://example.com")).toBeNull();
  });

  it("measures meaning similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([], [1])).toBe(0);
  });
});

describe("embeddings pause", () => {
  it("stops calling OpenAI for a while after it refuses", async () => {
    const { embedTexts, resetEmbeddingPauseForTests } = await import("../embeddings");
    resetEmbeddingPauseForTests();
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 })
    );
    expect(await embedTexts(["a"])).toBeNull();
    expect(await embedTexts(["b"])).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
    resetEmbeddingPauseForTests();
    process.env.OPENAI_API_KEY = prev;
  });
});
