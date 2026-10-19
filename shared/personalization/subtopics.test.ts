import { describe, expect, it } from "vitest";
import { visibleSubtopics, withSubtopicRemoved } from "./subtopics";
import { planItemEdit } from "./state";
import type { ItemRecord } from "./state";

const base = { title: "Gear", description: "", viewSharePercent: null };
const withSubs = {
  ...base,
  subtopics: [
    { id: "a", text: "Budget mics", removed: false },
    { id: "b", text: "Lighting setups", removed: false },
  ],
};

describe("pillar subtopics", () => {
  it("shows only subtopics that were not removed", () => {
    const p = withSubtopicRemoved(withSubs, "a", true)!;
    expect(visibleSubtopics(p).map(s => s.id)).toEqual(["b"]);
    expect(p.subtopics!.find(s => s.id === "a")!.removed).toBe(true);
  });

  it("restore brings a removed subtopic back", () => {
    const removed = withSubtopicRemoved(withSubs, "a", true)!;
    const restored = withSubtopicRemoved(removed, "a", false)!;
    expect(visibleSubtopics(restored).map(s => s.id)).toEqual(["a", "b"]);
  });

  it("unknown subtopic id changes nothing", () => {
    expect(withSubtopicRemoved(withSubs, "zzz", true)).toBeNull();
  });

  it("a title or description edit keeps stored subtopics, removed flags included", () => {
    const current = {
      id: "11111111-1111-4111-8111-111111111111",
      kind: "pillar",
      status: "confirmed",
      evidence: "profile_inferred",
      payload: withSubtopicRemoved(withSubs, "a", true)!,
    } as unknown as ItemRecord<"pillar">;
    const plan = planItemEdit(current, { title: "Gear", description: "new", viewSharePercent: null } as never, 1);
    expect(plan.insert.payload.subtopics).toEqual(current.payload.subtopics);
    expect(plan.insert.payload.description).toBe("new");
  });
});
