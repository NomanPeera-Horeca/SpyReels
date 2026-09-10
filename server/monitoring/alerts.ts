import { notifyOwnerViaTelegram } from "../telegramBot";

/**
 * Owner alerting for production failures.
 *
 * PostHog Error Tracking already captures exceptions; this module is the
 * proactive "page the owner" layer. Send a Telegram message to the owner's
 * connected account, throttled so a crashing loop or flaky vendor never
 * floods the chat:
 *
 *  - same (kind + message) is only sent once per 10 minutes
 *  - at most one alert per minute globally
 *  - suppressed occurrences are folded into the next send as a count
 *
 * Fire-and-forget: this never throws into the request/background path.
 */

const GLOBAL_MIN_INTERVAL_MS = 60_000;
const DEDUPE_WINDOW_MS = 10 * 60_000;
const MAX_TEXT_LENGTH = 1800;

const lastAlertByKey = new Map<string, number>();
const suppressedByKey = new Map<string, number>();
const sentByKind = new Map<string, number>();
let lastGlobalAlertAt = 0;
let totalSent = 0;
let totalSuppressed = 0;

export interface AlertContext {
  kind: string;
  message?: string;
  error?: unknown;
  jobId?: string;
}

function shortMessage(input: AlertContext): string {
  let fromErr = "";
  const err = input.error;
  if (err instanceof Error) {
    fromErr = err.message || err.name;
  } else if (err != null) {
    fromErr = typeof err === "string" ? err : String(err);
  }
  return (input.message?.trim() || fromErr.trim() || "unknown error").slice(0, 200);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildTelegramText(
  kind: string,
  message: string,
  input: AlertContext,
  suppressedCount: number
): string {
  const err = input.error;
  const stackTail =
    err instanceof Error && err.stack
      ? err.stack.split("\n").slice(0, 4).join("\n")
      : "";
  const lines: string[] = [
    "[SpyReels Alert] " + escapeHtml(kind),
    "Message: " + escapeHtml(message),
  ];
  if (input.jobId) {
    lines.push("Job: " + escapeHtml(input.jobId));
  }
  if (stackTail.trim()) {
    lines.push("<pre>" + escapeHtml(stackTail) + "</pre>");
  }
  if (suppressedCount > 0) {
    lines.push("(" + String(suppressedCount) + " more suppressed since last)");
  }
  lines.push("UTC: " + new Date().toISOString());
  return lines.join("\n\n").slice(0, MAX_TEXT_LENGTH);
}

export function alertOwnerThrottled(input: AlertContext): void {
  try {
    const message = shortMessage(input);
    const key = `${input.kind}::${message.toLowerCase().slice(0, 140)}`;
    const now = Date.now();

    const sawRecently = (lastAlertByKey.get(key) ?? 0) + DEDUPE_WINDOW_MS > now;
    const globallyThrottled = lastGlobalAlertAt + GLOBAL_MIN_INTERVAL_MS > now;
    if (sawRecently || globallyThrottled) {
      suppressedByKey.set(key, (suppressedByKey.get(key) ?? 0) + 1);
      totalSuppressed += 1;
      return;
    }

    lastAlertByKey.set(key, now);
    lastGlobalAlertAt = now;
    totalSent += 1;
    sentByKind.set(input.kind, (sentByKind.get(input.kind) ?? 0) + 1);

    const suppressedCount = suppressedByKey.get(key) ?? 0;
    suppressedByKey.set(key, 0);

    const trace = input.error instanceof Error ? `\n${input.error.stack ?? ""}` : "";
    console.error(`[Alert] ${input.kind}: ${message}${trace}`);

    void notifyOwnerViaTelegram(
      buildTelegramText(input.kind, message, input, suppressedCount)
    );
  } catch (err) {
    console.error("[monitoring] alert pipeline failed:", err);
  }
}

export function getAlertTelemetry(): {
  totalSent: number;
  totalSuppressed: number;
  byKind: Record<string, number>;
} {
  return {
    totalSent,
    totalSuppressed,
    byKind: Object.fromEntries(sentByKind),
  };
}

/** Express error middleware: alert on any unhandled error, then keep the default behaviour. */
export const expressAlertErrorHandler: import("express").ErrorRequestHandler = (
  err,
  _req,
  _res,
  next
) => {
  alertOwnerThrottled({ kind: "express", error: err });
  next(err);
};