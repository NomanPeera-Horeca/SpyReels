import { describe, expect, it } from "vitest";
import {
  formatCoachSaveScheduleLabel,
  formatSchedulePostButtonSubtitle,
  pickDefaultPostSchedule,
  pickNextOpenPostSchedule,
  postDateFromPlanDay,
  postDateToOccupiedYmd,
  toLocalYmd,
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
    const minExpected = new Date(today);
    minExpected.setDate(minExpected.getDate() + 2);
    // The function pushes weekend dates to the next weekday.
    expect(day3.getDay()).not.toBe(0);
    expect(day3.getDay()).not.toBe(6);
    expect(day3.getTime()).toBeGreaterThanOrEqual(minExpected.getTime());
    if (minExpected.getDay() !== 0 && minExpected.getDay() !== 6) {
      expect(day3.getDate()).toBe(minExpected.getDate());
    }
  });

  it("formatCoachSaveScheduleLabel includes day and time", () => {
    const label = formatCoachSaveScheduleLabel(new Date("2026-07-11T12:00:00"), "09:00");
    expect(label).toMatch(/9 AM/);
    expect(label).toMatch(/Jul/);
  });

  it("pickNextOpenPostSchedule defaults to tomorrow", () => {
    const now = new Date(2026, 7, 21, 10, 0, 0); // Aug 21 local
    const { postDate, postTime } = pickNextOpenPostSchedule([], now);
    expect(postTime).toBe("12:00");
    expect(toLocalYmd(postDate)).toBe("2026-08-22");
  });

  it("pickNextOpenPostSchedule skips occupied tomorrow", () => {
    const now = new Date(2026, 7, 21, 10, 0, 0); // Aug 21
    const { postDate } = pickNextOpenPostSchedule(["2026-08-22"], now);
    expect(toLocalYmd(postDate)).toBe("2026-08-23");
  });

  it("postDateToOccupiedYmd prefers date-only prefix", () => {
    expect(postDateToOccupiedYmd("2026-08-22T00:00:00.000Z")).toBe("2026-08-22");
    expect(postDateToOccupiedYmd("2026-08-22")).toBe("2026-08-22");
  });

  it("formatSchedulePostButtonSubtitle matches Taplio style", () => {
    const label = formatSchedulePostButtonSubtitle(
      new Date(2026, 7, 22, 12, 0, 0),
      "12:00"
    );
    expect(label).toBe("August 22nd, 2026, 12:00 PM");
  });
});
