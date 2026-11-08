import { describe, expect, it } from "vitest";
import { remapPillarIds } from "./linkedProfile";

describe("remapPillarIds", () => {
  it("gives every copied pillar its own new id, so sub-topics follow the right pillar", () => {
    let n = 0;
    const m = remapPillarIds(["a", "b"], () => `new-${++n}`);
    expect(m.get("a")).toBe("new-1");
    expect(m.get("b")).toBe("new-2");
    expect(m.size).toBe(2);
  });
});
