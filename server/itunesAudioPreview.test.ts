import { describe, expect, it } from "vitest";
import { resolveItunesAudioPreview } from "./itunesAudioPreview";

describe("resolveItunesAudioPreview", () => {
  it("returns a preview URL for a real track search", async () => {
    const result = await resolveItunesAudioPreview({
      title: "Lo-fi study beats",
      artist: "Dreamy Lo-Fi Girl",
    });
    expect(result).not.toBeNull();
    expect(result?.previewUrl).toMatch(/^https:\/\//);
  }, 15_000);

  it("returns null for empty title", async () => {
    expect(await resolveItunesAudioPreview({ title: "   " })).toBeNull();
  });
});
