import { describe, expect, it } from "vitest";
import { libraryPerformanceSignal } from "./libraryPerformance";

describe("library performance pill", () => {
  it("shows N× only for a multiple measured against the creator's usual views", () => {
    const base = { relevanceLabel: "Viral in Tech" };
    expect(libraryPerformanceSignal({ ...base, viralMultiple: 12.7, viralBasis: "usual_views" })).toEqual({
      kind: "performance",
      label: "12×",
      description: "12× this creator's usual views · Viral in Tech",
    });
    expect(libraryPerformanceSignal({ ...base, viralMultiple: 40, viralBasis: "followers" })).toBeNull();
    expect(libraryPerformanceSignal({ ...base, viralMultiple: 3, viralBasis: "usual_views" })).toBeNull();
    expect(libraryPerformanceSignal(base)).toBeNull();
  });
});
