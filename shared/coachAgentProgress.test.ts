import { describe, expect, it } from "vitest";
import {
  buildCoachScriptProgressSteps,
  collapseCoachProgressForDisplay,
} from "@shared/coachAgentProgress";

describe("collapseCoachProgressForDisplay", () => {
  it("groups the full generate pipeline into four user-facing stages", () => {
    const steps = buildCoachScriptProgressSteps("hook_angle", "research_grounding");
    const grouped = collapseCoachProgressForDisplay(steps);

    expect(grouped.map((step) => step.label)).toEqual([
      "Understanding your idea",
      "Finding the strongest angle",
      "Writing your script",
      "Polishing the final version",
    ]);
    expect(grouped.map((step) => step.status)).toEqual(["done", "active", "pending", "pending"]);
  });

  it("leaves short pipelines unchanged", () => {
    const steps = [
      { id: "read_profile", label: "Understanding your idea", status: "active" as const },
    ];
    expect(collapseCoachProgressForDisplay(steps)).toEqual(steps);
  });
});
