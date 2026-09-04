import { describe, expect, it } from "vitest";
import {
  hookOptionsArrivalPlan,
  hookOptionsSheetShowsLoader,
} from "@shared/coachHookOptionsUi";

describe("hookOptionsArrivalPlan", () => {
  it("does not auto-apply any option when variations arrive", () => {
    const plan = hookOptionsArrivalPlan([
      { spokenHook: "Option one hook" },
      { spokenHook: "Option two hook" },
      { spokenHook: "Option three hook" },
    ]);

    expect(plan.selectedIndex).toBeNull();
    expect(plan.autoApplyIndex).toBeNull();
  });

  it("applies nothing when there are no options yet", () => {
    expect(hookOptionsArrivalPlan(null)).toEqual({
      selectedIndex: null,
      autoApplyIndex: null,
    });
    expect(hookOptionsArrivalPlan([])).toEqual({
      selectedIndex: null,
      autoApplyIndex: null,
    });
  });
});

describe("hookOptionsSheetShowsLoader", () => {
  it("shows the in-sheet loader only while waiting for the first options", () => {
    expect(hookOptionsSheetShowsLoader(true, 0)).toBe(true);
    expect(hookOptionsSheetShowsLoader(true, 3)).toBe(false);
    expect(hookOptionsSheetShowsLoader(false, 0)).toBe(false);
  });
});
