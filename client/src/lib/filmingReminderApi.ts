import { getCurrentWorkspaceId } from "@/lib/trpc";
import { resolveAppUrl } from "@/lib/nativeApp";

export type ScheduleFilmingReminderResponse =
  | {
      status: "completed";
      label: string;
      reminder: {
        id: number;
        coachScriptId: number;
        filmingDate: string;
        filmingTime: string;
        timezone: string;
        setup: string;
        setupLabel: string;
        openingVisual?: string | null;
        onScreenText?: string | null;
      };
    }
  | {
      status: "requires_input";
      question: string;
    };

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Fall through to the creator-friendly default.
  }
  return "Could not save the filming reminder.";
}

export async function scheduleAgentFilmingReminder(args: {
  coachScriptId: number;
  scheduleText: string;
  timezone?: string | null;
  notes?: string | null;
}): Promise<ScheduleFilmingReminderResponse> {
  const headers = new Headers({ "content-type": "application/json" });
  const workspaceId = getCurrentWorkspaceId();
  if (workspaceId) headers.set("x-workspace-id", workspaceId);

  const response = await fetch(resolveAppUrl("/api/filming-reminders"), {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({
      coachScriptId: args.coachScriptId,
      scheduleText: args.scheduleText,
      timezone: args.timezone?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as ScheduleFilmingReminderResponse;
}
