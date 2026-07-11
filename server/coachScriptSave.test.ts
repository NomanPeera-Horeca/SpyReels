import { describe, expect, it } from "vitest";
import {
  formatCoachSaveScheduleLabel,
  pickDefaultPostSchedule,
  postDateFromPlanDay,
} from "@shared/coachScriptSave";

describe("coachScriptSave", () => {
  it("pickDefaultPostSchedule returns weekday", () => {
    const { postDate, postTime } = pickDefaultPostSchedule();
    expect(postTime).toBe("09:00");
    expect(postDate.getDay()).not.toBe(0);
    expect(postDate.getDay()).not.toBe(6);
  });

  it("postDateFromPlanDay offsets from today", () => {
    const day3 = postDateFromPlanDay(3);
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const expected = new Date(today);
    expected.setDate(expected.getDate() + 2);
    expect(day3.getDate()).toBe(expected.getDate());
  });

  it("formatCoachSaveScheduleLabel includes day and time", () => {
    const label = formatCoachSaveScheduleLabel(new Date("2026-07-11T12:00:00"), "09:00");
    expect(label).toMatch(/9 AM/);
    expect(label).toMatch(/Jul/);
  });
});
