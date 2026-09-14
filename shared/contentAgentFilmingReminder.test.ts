import { describe, expect, it } from "vitest";
import {
  inferFilmingSetupFromProductionNotes,
  resolveFilmingReminderText,
  resolveFilmingSetupText,
} from "./contentAgentFilmingReminder";

const clock = { today: "2026-09-09" };

describe("Content Agent filming reminder", () => {
  it("resolves time and office setup from one natural request", () => {
    const result = resolveFilmingReminderText(
      "Remind me to film Friday at 10 AM in my office",
      clock
    );

    expect(result).toMatchObject({
      ok: true,
      date: "2026-09-11",
      time: "10:00",
      setup: { id: "office", label: "Office" },
    });
  });

  it("asks for filming setup when date and time are known", () => {
    const result = resolveFilmingReminderText(
      "Film Friday at 10 AM",
      clock
    );

    expect(result).toEqual({
      ok: false,
      question: "Where are you filming this one: green screen, room, studio, office, or outside?",
    });
  });

  it("uses an explicit production-note filming location as fallback", () => {
    const result = resolveFilmingReminderText(
      "Film tomorrow morning",
      clock,
      {
        productionNotes: JSON.stringify({ filmingLocation: "green screen" }),
      }
    );

    expect(result).toMatchObject({
      ok: true,
      date: "2026-09-10",
      time: "09:00",
      setup: { id: "green_screen", label: "Green screen" },
    });
  });

  it("does not mistake unrelated Studio copy for a filming location", () => {
    const result = inferFilmingSetupFromProductionNotes(
      JSON.stringify({ notes: "Open this in SpyReels Studio" })
    );
    expect(result).toBeNull();
  });

  it("recognizes the agreed creator filming setups", () => {
    expect(resolveFilmingSetupText("green screen")?.id).toBe("green_screen");
    expect(resolveFilmingSetupText("in my room")?.id).toBe("room_home");
    expect(resolveFilmingSetupText("at the studio")?.id).toBe("studio");
    expect(resolveFilmingSetupText("my office")?.id).toBe("office");
    expect(resolveFilmingSetupText("outside in the park")?.id).toBe("outside");
  });
});
