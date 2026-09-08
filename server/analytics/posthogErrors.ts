import type { ErrorRequestHandler, Express } from "express";
import { capturePostHogEvent, posthogDistinctIdForUser } from "./posthogServer";

/**
 * PostHog Error Tracking from the server.
 *
 * Sends `$exception` events (the format PostHog's Error Tracking UI reads)
 * using the existing hand-rolled capture utility — no posthog-node SDK.
 * Fire-and-forget; never throws into the request path.
 */

export function isServerErrorTrackingEnabled(): boolean {
  return Boolean(
    process.env.POSTHOG_API_KEY?.trim() || process.env.VITE_PUBLIC_POSTHOG_TOKEN?.trim()
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : String(error);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function truncated(value: string | undefined, max: number): string | undefined {
  return value && value.length > max ? value.slice(0, max) : value;
}

export async function captureServerException(
  error: unknown,
  extra?: Record<string, unknown>,
  distinctId: string = "spyreels-server"
): Promise<void> {
  if (!isServerErrorTrackingEnabled()) return;
  try {
    await capturePostHogEvent({
      distinctId,
      event: "$exception",
      properties: {
        $exception_type: errorName(error),
        $exception_message: truncated(errorMessage(error), 2000),
        $exception_stack_trace: truncated(errorStack(error), 200_000),
        $exception_source: "spyreels_server",
        level: "error",
        ...extra,
      },
    });
  } catch (err) {
    console.warn("[PostHog] exception capture failed:", err);
  }
}

let registered = false;

/** Global uncaught exception + unhandled rejection hooks. Idempotent. */
export function registerServerErrorMonitoring() {
  if (registered) return;
  registered = true;

  process.on("uncaughtException", err => {
    void captureServerException(err, { kind: "uncaughtException" });
  });
  process.on("unhandledRejection", reason => {
    void captureServerException(reason, { kind: "unhandledRejection" });
  });
}

/**
 * Express error middleware: forward every unhandled error after `next(new Error(...))`
 * or a thrown error in a handler to PostHog, then keep the default behaviour.
 * Must be registered AFTER all routes.
 */
export const posthogExpressErrorHandler: ErrorRequestHandler = (
  err,
  _req,
  _res,
  next
) => {
  if (!isServerErrorTrackingEnabled()) {
    next(err);
    return;
  }
  void captureServerException(err, { kind: "express" }).finally(() => next(err));
};

/**
 * Attach the error handler to the app. No-op when PostHog error tracking is
 * disabled. Call after all routes/middleware.
 */
export function registerPostHogExpressErrors(app: Express) {
  if (!isServerErrorTrackingEnabled()) return;
  app.use(posthogExpressErrorHandler);
}