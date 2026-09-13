import { describe, expect, it } from "vitest";
import { savedScriptOpenPath } from "./scriptOpenPath";

describe("savedScriptOpenPath", () => {
  it("opens an ordinary saved script in the canonical reader", () => {
    expect(savedScriptOpenPath({ id: 42 })).toBe("/scripts/42");
  });

  it("opens a saved remake in the same canonical reader", () => {
    expect(savedScriptOpenPath({ id: 77, recreatedScriptId: 9001 })).toBe("/scripts/77");
  });
});
