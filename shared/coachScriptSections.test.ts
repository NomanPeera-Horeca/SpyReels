import { describe, expect, it } from "vitest";
import { spokenWhatToSay } from "@shared/coachScriptSections";

describe("spokenWhatToSay", () => {
  it("joins spoken sections into one readable script without HEIT names", () => {
    const text = spokenWhatToSay({
      explain: "Menus get too big.",
      illustrate: "Saturday tickets slow down.",
      teach: "Audit complexity first.",
      cta: "Fix the system before you add payroll.",
    });

    expect(text).toBe(
      "Menus get too big.\n\nSaturday tickets slow down.\n\nAudit complexity first.\n\nFix the system before you add payroll."
    );
    expect(text).not.toMatch(/explain|illustrate|teach/i);
  });

  it("skips empty sections", () => {
    expect(
      spokenWhatToSay({
        explain: "Start here.",
        illustrate: "",
        teach: "  ",
        cta: "End here.",
      })
    ).toBe("Start here.\n\nEnd here.");
  });
});
