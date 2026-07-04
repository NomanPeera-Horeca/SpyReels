import { describe, expect, it } from "vitest";
import { scriptFilmPath, shouldAutoOpenFilm } from "@shared/scriptFilm";

describe("scriptFilm", () => {
  it("builds film path with query param", () => {
    expect(scriptFilmPath(42)).toBe("/scripts/42?film=1");
  });

  it("detects film auto-open from search string", () => {
    expect(shouldAutoOpenFilm("?film=1")).toBe(true);
    expect(shouldAutoOpenFilm("film=1&tab=edit")).toBe(true);
    expect(shouldAutoOpenFilm("?film=0")).toBe(false);
    expect(shouldAutoOpenFilm("")).toBe(false);
  });
});
