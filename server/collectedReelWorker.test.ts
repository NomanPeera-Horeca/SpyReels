import { describe, expect, it } from "vitest";
import { COLLECTED_REEL_MAX_FETCH_ATTEMPTS } from "./collectedReelWorker";

describe("collectedReelWorker constants", () => {
  it("allows enough automatic retries before terminal failure", () => {
    expect(COLLECTED_REEL_MAX_FETCH_ATTEMPTS).toBeGreaterThanOrEqual(12);
  });
});
