export type FilmingScheduleResolution =
  | {
      ok: true;
      date: string;
      time: string;
      label: string;
    }
  | {
      ok: false;
      question: string;
    };

export type FilmingScheduleClock = {
  /** Creator-local calendar date in YYYY-MM-DD form. */
  today: string;
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseCalendarDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatCalendarDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextWeekday(date: Date, weekday: number): Date {
  const delta = (weekday - date.getUTCDay() + 7) % 7 || 7;
  return addDays(date, delta);
}

function timeLabel(time: string): string {
  const [rawHour, rawMinute] = time.split(":").map(Number);
  const suffix = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  return `${hour}:${String(rawMinute).padStart(2, "0")} ${suffix}`;
}

function dateLabel(date: Date, today: Date): string {
  const dateKey = formatCalendarDate(date);
  if (dateKey === formatCalendarDate(today)) return "Today";
  if (dateKey === formatCalendarDate(addDays(today, 1))) return "Tomorrow";
  const weekday = date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  return weekday;
}

/**
 * Parse the small set of natural schedule phrases SpyReels Agent promises in
 * the filming-reminder conversation. The caller supplies the creator-local
 * calendar date so this utility does not silently assume the server timezone.
 */
export function resolveFilmingScheduleText(
  input: string,
  clock: FilmingScheduleClock
): FilmingScheduleResolution {
  const text = input.trim().toLowerCase();
  const today = parseCalendarDate(clock.today);
  if (!today) {
    return { ok: false, question: "Which day do you want to film it?" };
  }

  let date: Date | null = null;
  if (/\btoday\b/.test(text)) date = today;
  if (/\btomorrow\b/.test(text)) date = addDays(today, 1);

  for (const [name, weekday] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) {
      date = nextWeekday(today, weekday);
      break;
    }
  }

  let hour: number | null = null;
  let minute = 0;
  const explicit = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/);
  if (explicit) {
    hour = Number(explicit[1]);
    minute = Number(explicit[2] ?? 0);
    if (explicit[3] === "pm" && hour !== 12) hour += 12;
    if (explicit[3] === "am" && hour === 12) hour = 0;
  } else if (/\bmorning\b/.test(text)) {
    hour = 9;
  } else if (/\bafter lunch\b/.test(text)) {
    hour = 13;
  } else if (/\blunch\b/.test(text)) {
    hour = 12;
  } else if (/\bafternoon\b/.test(text)) {
    hour = 15;
  } else if (/\bevening\b/.test(text)) {
    hour = 19;
  } else {
    const ambiguous = text.match(/\bat\s+(1[0-2]|0?[1-9])(?::([0-5]\d))?\b/);
    if (ambiguous) {
      const minuteLabel = ambiguous[2] ? `:${ambiguous[2]}` : "";
      return {
        ok: false,
        question: `Do you mean ${Number(ambiguous[1])}${minuteLabel} AM or PM?`,
      };
    }
  }

  if (!date && hour == null) {
    return { ok: false, question: "When do you want to film this Reel?" };
  }
  if (!date) {
    return { ok: false, question: "Which day do you want to film it?" };
  }
  if (hour == null) {
    return { ok: false, question: "What time should I remind you to film it?" };
  }

  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    ok: true,
    date: formatCalendarDate(date),
    time,
    label: `${dateLabel(date, today)} · ${timeLabel(time)}`,
  };
}
