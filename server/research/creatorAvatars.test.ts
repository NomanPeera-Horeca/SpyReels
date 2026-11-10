import { describe, expect, it } from "vitest";
import { pickAvatars } from "./creatorAvatars";

describe("pickAvatars", () => {
  it("keeps the newest saved photo per handle and skips blanks and non-links", () => {
    const m = pickAvatars([
      { handle: "SamStoffel", profilePicUrl: "https://cdn.example/new.jpg" },
      { handle: "samstoffel", profilePicUrl: "https://cdn.example/old.jpg" },
      { handle: "blank", profilePicUrl: "  " },
      { handle: "bad", profilePicUrl: "javascript:alert(1)" },
    ]);
    expect(m.get("samstoffel")).toBe("https://cdn.example/new.jpg");
    expect(m.has("blank")).toBe(false);
    expect(m.has("bad")).toBe(false);
  });
});
