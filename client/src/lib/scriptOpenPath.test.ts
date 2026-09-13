import { describe, expect, it } from "vitest";
import { savedScriptOpenPath } from "./scriptOpenPath";

describe("savedScriptOpenPath", () => {
  it("opens ordinary saved scripts in the read-first workspace", () => {
    expect(savedScriptOpenPath({ id: 42 })).toBe("/scripts/42/remake");
  });

  it("opens saved Remakes in the same read-first workspace", () => {
    expect(savedScriptOpenPath({ id: 43, recreatedScriptId: 7 })).toBe(
      "/scripts/43/remake"
    );
  });
});
