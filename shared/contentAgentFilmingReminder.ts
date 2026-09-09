import {
  resolveFilmingScheduleText,
  type FilmingScheduleClock,
} from "./contentAgentFilmingSchedule";

export type FilmingSetupId =
  | "green_screen"
  | "room_home"
  | "studio"
  | "office"
  | "outside"
  | "other";

export type FilmingSetup = {
  id: FilmingSetupId;
  label: string;
};

export type FilmingReminderResolution =
  | {
      ok: true;
      date: string;
      time: string;
      label: string;
      setup: FilmingSetup;
    }
  | {
      ok: false;
      question: string;
    };

const SETUP_QUESTION =
  "Where are you filming this one: green screen, room, studio, office, or outside?";

function setupFromText(value: string): FilmingSetup | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;

  if (/\b(green\s*screen|greenscreen)\b/.test(text)) {
    return { id: "green_screen", label: "Green screen" };
  }
  if (/\b(studio)\b/.test(text)) {
    return { id: "studio", label: "Studio" };
  }
  if (/\b(office|workplace|work space|workspace)\b/.test(text)) {
    return { id: "office", label: "Office" };
  }
  if (/\b(outside|outdoors?|outdoor|street|sidewalk|park|patio)\b/.test(text)) {
    return { id: "outside", label: "Outside" };
  }
  if (/\b(home|room|bedroom|living room)\b/.test(text)) {
    return { id: "room_home", label: "Room / Home" };
  }
  if (/\b(kitchen)\b/.test(text)) {
    return { id: "other", label: "Kitchen" };
  }
  if (/\b(other)\b/.test(text)) {
    return { id: "other", label: "Other" };
  }

  return null;
}

export function resolveFilmingSetupText(value: string): FilmingSetup | null {
  return setupFromText(value);
}

/**
 * Only inspect explicit location-like production-note fields. Do not scan the
 * whole JSON string because product copy such as "Studio" could otherwise be
 * mistaken for the creator's filming location.
 */
export function inferFilmingSetupFromProductionNotes(
  productionNotes: string | null | undefined
): FilmingSetup | null {
  if (!productionNotes?.trim()) return null;

  try {
    const parsed = JSON.parse(productionNotes) as Record<string, unknown>;
    const candidates = [
      parsed.filmingSetup,
      parsed.filmingLocation,
      parsed.location,
      parsed.setting,
      parsed.background,
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      const setup = setupFromText(candidate);
      if (setup) return setup;
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveFilmingReminderText(
  input: string,
  clock: FilmingScheduleClock,
  options: { productionNotes?: string | null } = {}
): FilmingReminderResolution {
  const schedule = resolveFilmingScheduleText(input, clock);
  if (!schedule.ok) return schedule;

  const setup =
    resolveFilmingSetupText(input) ??
    inferFilmingSetupFromProductionNotes(options.productionNotes);

  if (!setup) {
    return { ok: false, question: SETUP_QUESTION };
  }

  return {
    ok: true,
    date: schedule.date,
    time: schedule.time,
    label: schedule.label,
    setup,
  };
}

export const FILMING_SETUP_QUESTION = SETUP_QUESTION;
