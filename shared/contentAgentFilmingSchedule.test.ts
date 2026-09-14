import { describe, expect, it } from "vitest";
import { resolveFilmingScheduleText } from "./contentAgentFilmingSchedule";

const clock = { today: "2026-09-09" };

describe("resolveFilmingScheduleText", () => {
  it("resolves a creator-local today time", () => {
    expect(resolveFilmingScheduleText("today at 4pm", clock)).toEqual({
      ok: true,
      date: "2026-09-09",
      time: "16:00",
      label: "Today · 4:00 PM",
    });
  });

  it("resolves tomorrow morning without a date picker", () => {
    expect(resolveFilmingScheduleText("tomorrow morning", clock)).toEqual({
      ok: true,
      date: "2026-09-10",
      time: "09:00",
      label: "Tomorrow · 9:00 AM",
    });
  });

  it("resolves the next named weekday", () => {
    expect(resolveFilmingScheduleText("Friday after lunch", clock)).toEqual({
      ok: true,
      date: "2026-09-11",
      time: "13:00",
      label: "Friday · 1:00 PM",
    });
  });

  it("asks AM or PM instead of guessing an ambiguous clock time", () => {
    expect(resolveFilmingScheduleText("today at 4", clock)).toEqual({
      ok: false,
      question: "Do you mean 4 AM or PM?",
    });
  });

  it("asks for the missing day when only a time is supplied", () => {
    expect(resolveFilmingScheduleText("at 4pm", clock)).toEqual({
      ok: false,
      question: "Which day do you want to film it?",
    });
  });

  it("asks a natural follow-up when no schedule information is present", () => {
    expect(resolveFilmingScheduleText("schedule this", clock)).toEqual({
      ok: false,
      question: "When do you want to film this Reel?",
    });
  });
});
