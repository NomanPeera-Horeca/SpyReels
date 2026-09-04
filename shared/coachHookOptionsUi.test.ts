import { describe, expect, it } from "vitest";
import { hookOptionsArrivalPlan } from "@shared/coachHookOptionsUi";

describe("hookOptionsArrivalPlan", () => {
  it("does not auto-apply the first option when variations arrive", () => {
    const plan = hookOptionsArrivalPlan([
      { spokenHook: "Option one hook" },
      { spokenHook: "Option two hook" },
      { spokenHook: "Option three hook" },
    ]);

    expect(plan.openSheet).toBe(true);
    expect(plan.selectedIndex).toBeNull();
    expect(plan.autoApplyIndex).toBeNull();
  });

  it("keeps the sheet closed and applies nothing when there are no options", () => {
    expect(hookOptionsArrivalPlan(null)).toEqual({
      openSheet: false,
      selectedIndex: null,
      autoApplyIndex: null,
    });
    expect(hookOptionsArrivalPlan([])).toEqual({
      openSheet: false,
      selectedIndex: null,
      autoApplyIndex: null,
    });
  });
});
