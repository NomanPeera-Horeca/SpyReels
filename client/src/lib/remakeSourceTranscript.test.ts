import { describe, expect, it } from "vitest";
import {
  formatRemakeSourceTime,
  normalizeRemakeSourceSegments,
} from "./remakeSourceTranscript";

describe("remake source transcript helpers", () => {
  it("normalizes timestamped transcript segments", () => {
    expect(
      normalizeRemakeSourceSegments([
        { start: 7.4, end: 10, text: "Second point" },
        { start: 0, end: 4, text: "Opening line" },
      ])
    ).toEqual([
      { startSeconds: 0, text: "Opening line" },
      { startSeconds: 7.4, text: "Second point" },
    ]);
  });

  it("supports millisecond timestamps without inventing missing timestamps", () => {
    expect(
      normalizeRemakeSourceSegments([
        { startMs: 2500, text: "Timed" },
        { text: "No timing" },
      ])
    ).toEqual([{ startSeconds: 2.5, text: "Timed" }]);
  });

  it("unwraps provider segment containers", () => {
    expect(
      normalizeRemakeSourceSegments({
        segments: [{ start_time: "12", transcript: "A line" }],
      })
    ).toEqual([{ startSeconds: 12, text: "A line" }]);
  });

  it("formats short and long timestamps", () => {
    expect(formatRemakeSourceTime(0)).toBe("00:00");
    expect(formatRemakeSourceTime(65.9)).toBe("01:05");
    expect(formatRemakeSourceTime(3661)).toBe("1:01:01");
  });
});
