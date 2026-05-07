import { describe, expect, it } from "vitest";
import { coerceInstagramTakenAtRaw } from "./instagram";

describe("coerceInstagramTakenAtRaw", () => {
  it("parses unix seconds as number", () => {
    const d = coerceInstagramTakenAtRaw(1736294201)!;
    expect(d.getTime()).toBe(1736294201000);
  });

  it("parses unix seconds as numeric string (not Invalid Date)", () => {
    const d = coerceInstagramTakenAtRaw("1736294201")!;
    expect(d.getTime()).toBe(1736294201000);
  });

  it("preserves millis when number >= 1e12", () => {
    const ms = 1736294201123;
    const d = coerceInstagramTakenAtRaw(ms)!;
    expect(d.getTime()).toBe(ms);
  });

  it("parses millis as numeric string", () => {
    const msStr = String(1736294201123);
    const d = coerceInstagramTakenAtRaw(msStr)!;
    expect(d.getTime()).toBe(1736294201123);
  });
});
