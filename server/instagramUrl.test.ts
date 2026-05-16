import { describe, expect, it } from "vitest";
import {
  extractAllInstagramReelShortcodes,
  parseInstagramReelShortcode,
} from "./instagramUrl";

describe("parseInstagramReelShortcode", () => {
  it("parses standard /reel/ URLs", () => {
    expect(parseInstagramReelShortcode("https://www.instagram.com/reel/ABC123/")).toBe(
      "ABC123"
    );
  });

  it("parses /username/reel/ URLs from mobile Copy link", () => {
    expect(
      parseInstagramReelShortcode("https://www.instagram.com/somecreator/reel/DC4XkjKyK6_/")
    ).toBe("DC4XkjKyK6_");
  });

  it("parses /p/ post URLs", () => {
    expect(parseInstagramReelShortcode("https://www.instagram.com/p/XYZ789/")).toBe(
      "XYZ789"
    );
  });

  it("returns null for non-Instagram URLs", () => {
    expect(parseInstagramReelShortcode("https://google.com")).toBeNull();
  });
});

describe("extractAllInstagramReelShortcodes", () => {
  it("extracts multiple shortcodes including username paths", () => {
    const text =
      "https://www.instagram.com/reel/AAA111/\nhttps://www.instagram.com/user/reel/BBB222/";
    expect(extractAllInstagramReelShortcodes(text).sort()).toEqual(["AAA111", "BBB222"]);
  });
});
