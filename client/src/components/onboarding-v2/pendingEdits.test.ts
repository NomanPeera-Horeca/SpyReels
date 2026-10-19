import { describe, expect, it } from "vitest";
import { decidePendingSave } from "./pendingEdits";

const text = [{ key: "text", required: true }];
const pillar = [
  { key: "title", required: true },
  { key: "description" },
];

describe("decidePendingSave (Continue with an open editor)", () => {
  it("unchanged existing value is skipped (no write)", () => {
    expect(decidePendingSave(text, { text: "Grow" }, { text: "Grow" })).toBe("skip");
  });

  it("an empty new draft is dropped without a write", () => {
    expect(decidePendingSave(text, { text: "" }, { text: "   " })).toBe("skip");
  });

  it("a changed valid value is saved", () => {
    expect(decidePendingSave(text, { text: "Grow" }, { text: "Grow more" })).toBe("save");
    expect(decidePendingSave(text, { text: "" }, { text: "New goal" })).toBe("save");
  });

  it("clearing a value that had content blocks Continue (nothing silently removed)", () => {
    expect(decidePendingSave(text, { text: "Grow" }, { text: "  " })).toBe("block");
  });

  it("a new pillar with a description but no title blocks Continue (text not lost)", () => {
    expect(
      decidePendingSave(pillar, { title: "", description: "" }, { title: "", description: "Gear tips" })
    ).toBe("block");
  });

  it("whitespace-only changes are not a change", () => {
    expect(decidePendingSave(text, { text: "Grow" }, { text: "  Grow  " })).toBe("skip");
  });
});
