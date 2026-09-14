import { and, eq } from "drizzle-orm";
import { coachScripts } from "../drizzle/schema";
import {
  resolveFilmingReminderText,
  type FilmingReminderResolution,
} from "@shared/contentAgentFilmingReminder";
import { parseProductionNotes } from "@shared/coachScriptSections";
import {
  getDb,
  getSavedScriptByCoachScriptId,
  getUserPreferences,
} from "./db";
import { filmingReminders, type FilmingReminder } from "./filmingReminderModel";

export type ScheduleFilmingReminderResult =
  | {
      status: "requires_input";
      question: string;
    }
  | {
      status: "completed";
      reminder: FilmingReminder;
      label: string;
    };

function calendarDateInTimezone(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall through to UTC. Stored timezone remains explicit on the reminder.
  }
  return now.toISOString().slice(0, 10);
}

function filmingDirections(productionNotes: string | null | undefined): {
  openingVisual: string | null;
  onScreenText: string | null;
} {
  const notes = parseProductionNotes(productionNotes) ?? {};
  return {
    openingVisual: notes.hookVisualBeat?.trim() || null,
    onScreenText:
      notes.hookOnScreenText?.trim() ||
      notes.textOverlay?.trim() ||
      null,
  };
}

export async function scheduleFilmingReminder(args: {
  userId: number;
  workspaceId: string;
  coachScriptId: number;
  scheduleText: string;
  timezone?: string | null;
  notes?: string | null;
  now?: Date;
}): Promise<ScheduleFilmingReminderResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [script] = await db
    .select()
    .from(coachScripts)
    .where(
      and(
        eq(coachScripts.id, args.coachScriptId),
        eq(coachScripts.workspaceId, args.workspaceId)
      )
    )
    .limit(1);

  if (!script) throw new Error("Script not found");

  const preferences = args.timezone
    ? null
    : await getUserPreferences(args.userId);
  const timezone =
    args.timezone?.trim() ||
    preferences?.timezone?.trim() ||
    "America/Chicago";
  const today = calendarDateInTimezone(args.now ?? new Date(), timezone);

  const resolution: FilmingReminderResolution = resolveFilmingReminderText(
    args.scheduleText,
    { today },
    { productionNotes: script.productionNotes }
  );

  if (!resolution.ok) {
    return {
      status: "requires_input",
      question: resolution.question,
    };
  }

  const saved = await getSavedScriptByCoachScriptId(
    script.id,
    args.workspaceId
  );
  const directions = filmingDirections(script.productionNotes);

  const values = {
    userId: args.userId,
    workspaceId: args.workspaceId,
    coachScriptId: script.id,
    savedScriptId: saved?.id ?? null,
    title: script.title.slice(0, 256),
    filmingDate: resolution.date,
    filmingTime: resolution.time,
    timezone,
    setup: resolution.setup.id,
    setupLabel: resolution.setup.label,
    openingVisual: directions.openingVisual,
    onScreenText: directions.onScreenText,
    notes: args.notes?.trim() || null,
    status: "scheduled" as const,
    reminderSentAt: null,
  };

  await db
    .insert(filmingReminders)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        savedScriptId: values.savedScriptId,
        title: values.title,
        filmingDate: values.filmingDate,
        filmingTime: values.filmingTime,
        timezone: values.timezone,
        setup: values.setup,
        setupLabel: values.setupLabel,
        openingVisual: values.openingVisual,
        onScreenText: values.onScreenText,
        notes: values.notes,
        status: "scheduled",
        reminderSentAt: null,
      },
    });

  const [reminder] = await db
    .select()
    .from(filmingReminders)
    .where(
      and(
        eq(filmingReminders.workspaceId, args.workspaceId),
        eq(filmingReminders.coachScriptId, script.id)
      )
    )
    .limit(1);

  if (!reminder) throw new Error("Could not save filming reminder");

  const details = [resolution.label, `Setup: ${resolution.setup.label}`];
  if (directions.openingVisual) {
    details.push(`Opening visual: ${directions.openingVisual}`);
  }
  if (directions.onScreenText) {
    details.push(`On-screen text: ${directions.onScreenText}`);
  }

  return {
    status: "completed",
    reminder,
    label: details.join("\n"),
  };
}

export async function getFilmingReminderForScript(args: {
  workspaceId: string;
  coachScriptId: number;
}): Promise<FilmingReminder | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [reminder] = await db
    .select()
    .from(filmingReminders)
    .where(
      and(
        eq(filmingReminders.workspaceId, args.workspaceId),
        eq(filmingReminders.coachScriptId, args.coachScriptId)
      )
    )
    .limit(1);

  return reminder ?? null;
}
