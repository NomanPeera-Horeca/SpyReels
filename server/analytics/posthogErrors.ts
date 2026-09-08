import type { ErrorRequestHandler, Express } from "express";
import { PostHog } from "posthog-node";

/**
 * PostHog Error Tracking from the server.
 *
 * Uses the official `posthog-node` SDK's `captureException`, which builds the
 * exact `$exception_list` schema PostHog's Error Tracking processor expects.
 * Previous hand-rolled `$exception_type/$exception_message/$exception_stack_trace`
 * properties were ingested but rejected by the processor
 * (`error_tracking_exception_processing_errors`) — never go back to that.
 * Fire-and-forget; never throws into the request path.
 */

function posthogKey(): string | null {
  return (
    process.env.POSTHOG_API_KEY?.trim() ||
    process.env.VITE_PUBLIC_POSTHOG_TOKEN?.trim() ||
    null
  );
}

function posthogHost(): string {
  const raw = process.env.VITE_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
  return raw.replace(/\/$/, "");
}

export function isServerErrorTrackingEnabled(): boolean {
  return Boolean(posthogKey());
}

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = posthogKey();
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, { host: posthogHost() });
  }
  return client;
}

export async function captureServerException(
  error: unknown,
  extra?: Record<string, unknown>,
  distinctId: string = "spyreels-server"
): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  try {
    await ph.captureExceptionImmediate(error, distinctId, {
      ...extra,
      exception_source: "spyreels_server",
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