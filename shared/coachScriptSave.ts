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
