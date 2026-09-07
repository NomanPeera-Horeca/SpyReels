/**
 * Tab-session receipt for a /carousels/new?content= launch.
 *
 * generateFromInput does not create a remake row until source resolution and
 * angle generation finish. carouselRemake.list also hides pending/processing
 * rows. After a refresh in that window the aborted request has no remakeId
 * we can poll, so a second generateFromInput would be a duplicate job.
 *
 * Same-tab refresh of the same launch id therefore does not auto-start again.
 * The create form stays prefilled so the user can retry. Once a remakeId
 * exists, refresh resumes that remake. A new hub Create mints a new launch id
 * and is a new intent.
 *
 * React Strict Mode remounts in the same page: startedInThisPage is true, so
 * generate is allowed to restart after the abandoned first invoke.
 */
export const CAROUSEL_LAUNCH_SESSION_KEY = "spyreels:carousel_launch_v1";

export type CarouselLaunchTicket = {
  launchId: string;
  content: string;
  remakeId: number | null;
  startedAt: number;
};

export type CarouselLaunchReplay =
  | { action: "start" }
  | { action: "resume"; remakeId: number }
  | { action: "skip_in_flight" };

const startedInThisPage = new Set<string>();

function normalizeLaunchContent(content: string): string {
  return content.trim();
}

export function createCarouselLaunchId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `launch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function readCarouselLaunchTicket(): CarouselLaunchTicket | null {
  try {
    const raw = sessionStorage.getItem(CAROUSEL_LAUNCH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CarouselLaunchTicket>;
    const launchId =
      typeof parsed.launchId === "string" ? parsed.launchId.trim() : "";
    const content =
      typeof parsed.content === "string" ? normalizeLaunchContent(parsed.content) : "";
    const remakeId =
      typeof parsed.remakeId === "number" &&
      Number.isInteger(parsed.remakeId) &&
      parsed.remakeId > 0
        ? parsed.remakeId
        : null;
    const startedAt =
      typeof parsed.startedAt === "number" && Number.isFinite(parsed.startedAt)
        ? parsed.startedAt
        : 0;
    if (!launchId || !content || startedAt <= 0) return null;
    return { launchId, content, remakeId, startedAt };
  } catch {
    return null;
  }
}

export function writeCarouselLaunchTicket(ticket: CarouselLaunchTicket): void {
  try {
    sessionStorage.setItem(CAROUSEL_LAUNCH_SESSION_KEY, JSON.stringify(ticket));
  } catch {
    /* private mode / blocked storage */
  }
}

export function clearCarouselLaunchTicket(): void {
  try {
    sessionStorage.removeItem(CAROUSEL_LAUNCH_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function markCarouselLaunchStartedInPage(launchId: string): void {
  const id = launchId.trim();
  if (id) startedInThisPage.add(id);
}

export function hasCarouselLaunchStartedInPage(launchId: string): boolean {
  return startedInThisPage.has(launchId.trim());
}

export function resetCarouselLaunchPageStateForTests(): void {
  startedInThisPage.clear();
}

export function markCarouselLaunchStarted(launchId: string, content: string): void {
  const id = launchId.trim();
  const nextContent = normalizeLaunchContent(content);
  if (!id || !nextContent) return;
  const current = readCarouselLaunchTicket();
  writeCarouselLaunchTicket({
    launchId: id,
    content: nextContent,
    remakeId: current?.launchId === id ? current.remakeId : null,
    startedAt: Date.now(),
  });
}

export function bindCarouselLaunchRemake(launchId: string, remakeId: number): void {
  const id = launchId.trim();
  if (!id || !Number.isInteger(remakeId) || remakeId <= 0) return;
  const current = readCarouselLaunchTicket();
  if (!current || current.launchId !== id) return;
  writeCarouselLaunchTicket({ ...current, remakeId });
}

export function resolveCarouselLaunchReplay(args: {
  launchId: string;
  content: string;
  ticket: CarouselLaunchTicket | null;
  startedInThisPage: boolean;
}): CarouselLaunchReplay {
  const launchId = args.launchId.trim();
  const content = normalizeLaunchContent(args.content);
  if (!launchId || !content) return { action: "start" };
  const ticket = args.ticket;
  if (!ticket || ticket.launchId !== launchId) return { action: "start" };
  if (ticket.remakeId != null) {
    return { action: "resume", remakeId: ticket.remakeId };
  }
  if (ticket.content !== content) return { action: "start" };
  if (ticket.startedAt > 0 && !args.startedInThisPage) {
    return { action: "skip_in_flight" };
  }
  return { action: "start" };
}
