/** Default filming/post date for AI Coach saves (next weekday, ~2 days out, 9 AM). */
export function pickDefaultPostSchedule(): { postDate: Date; postTime: string } {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(9, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return { postDate: d, postTime: "09:00" };
}

/**
 * Normalize a script postDate (Date or ISO string) to YYYY-MM-DD for
 * occupancy checks. Prefer the date-only prefix on strings so timezone
 * shifts do not move a calendar day.
 */
export function postDateToOccupiedYmd(
  raw: Date | string | null | undefined
): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString();
  // Noon-local or midnight-UTC date-only values: use UTC calendar day.
  if (/T00:00:00/.test(iso) || /T12:00:00/.test(iso)) {
    return iso.slice(0, 10);
  }
  return toLocalYmd(d);
}

/** Local calendar YYYY-MM-DD (not UTC). */
export function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function dayOrdinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

/**
 * Next open post slot for Remake / Schedule post:
 * start tomorrow; if that local day already has a scheduled script, keep
 * advancing until a free day (up to 60 days).
 */
export function pickNextOpenPostSchedule(
  occupiedYmd: Iterable<string>,
  now: Date = new Date(),
  defaultTime = "12:00"
): { postDate: Date; postTime: string } {
  const occupied = new Set(
    [...occupiedYmd]
      .map((s) => String(s).slice(0, 10))
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
  );
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);

  for (let i = 0; i < 60; i++) {
    const ymd = toLocalYmd(d);
    if (!occupied.has(ymd)) {
      const [h, m] = defaultTime.split(":").map(Number);
      d.setHours(h ?? 12, m ?? 0, 0, 0);
      return { postDate: d, postTime: defaultTime };
    }
    d.setDate(d.getDate() + 1);
  }

  const [h, m] = defaultTime.split(":").map(Number);
  d.setHours(h ?? 12, m ?? 0, 0, 0);
  return { postDate: d, postTime: defaultTime };
}

/** Taplio-style button subtitle: August 22nd, 2026, 12:00 PM */
export function formatSchedulePostButtonSubtitle(
  postDate: Date,
  postTime: string
): string {
  const month = postDate.toLocaleDateString("en-US", { month: "long" });
  const year = postDate.getFullYear();
  const day = dayOrdinal(postDate.getDate());
  const [h, m] = postTime.split(":").map(Number);
  const hour = h ?? 12;
  const minute = m ?? 0;
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  const minPart = `:${String(minute).padStart(2, "0")}`;
  return `${month} ${day}, ${year}, ${h12}${minPart} ${period}`;
}

/** Map 30-day plan card day (1-based) to a calendar date from today. */
export function postDateFromPlanDay(day: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  const offset = Math.max(0, day - 1);
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function formatCoachSaveScheduleLabel(postDate: Date, postTime: string): string {
  const day = postDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const [h, m] = postTime.split(":").map(Number);
  const hour = h ?? 9;
  const minute = m ?? 0;
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  const minPart = minute > 0 ? `:${String(minute).padStart(2, "0")}` : "";
  return `${day}, ${h12}${minPart} ${period}`;
}
