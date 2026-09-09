import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createContext } from "./_core/context";
import {
  getFilmingReminderForScript,
  scheduleFilmingReminder,
} from "./filmingReminders";

const scheduleBodySchema = z.object({
  coachScriptId: z.number().int().positive(),
  scheduleText: z.string().trim().min(1).max(1000),
  timezone: z.string().trim().min(1).max(64).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const scriptIdParamSchema = z.coerce.number().int().positive();

async function authenticatedContext(req: Request, res: Response) {
  const context = await createContext({ req, res });
  if (!context.user || !context.workspaceId) {
    res.status(401).json({ error: "Sign in to manage filming reminders." });
    return null;
  }
  return context;
}

/**
 * Small authenticated API used by the Content Agent runtime.
 *
 * Filming reminders intentionally live outside the publishing-calendar fields.
 * A request can return requires_input when the creator still needs to provide
 * a date, time, or filming setup. The Agent must keep that clarification in the
 * same schedule_filming action instead of presenting a false success receipt.
 */
export function registerFilmingReminderRoutes(app: Express): void {
  app.post("/api/filming-reminders", async (req, res) => {
    const context = await authenticatedContext(req, res);
    if (!context) return;

    const parsed = scheduleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Tell Agent when and where you want to film this Reel.",
      });
    }

    try {
      const result = await scheduleFilmingReminder({
        userId: context.user.id,
        workspaceId: context.workspaceId,
        coachScriptId: parsed.data.coachScriptId,
        scheduleText: parsed.data.scheduleText,
        timezone: parsed.data.timezone,
        notes: parsed.data.notes,
      });
      return res.json(result);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Could not save the filming reminder.";
      const status = message === "Script not found" ? 404 : 500;
      return res.status(status).json({ error: message });
    }
  });

  app.get("/api/filming-reminders/:coachScriptId", async (req, res) => {
    const context = await authenticatedContext(req, res);
    if (!context) return;

    const parsedId = scriptIdParamSchema.safeParse(req.params.coachScriptId);
    if (!parsedId.success) {
      return res.status(400).json({ error: "Invalid script id." });
    }

    try {
      const reminder = await getFilmingReminderForScript({
        workspaceId: context.workspaceId,
        coachScriptId: parsedId.data,
      });
      return res.json({ reminder });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Could not load the filming reminder.";
      return res.status(500).json({ error: message });
    }
  });
}
