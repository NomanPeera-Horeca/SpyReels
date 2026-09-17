/** Fire-and-forget PostHog capture from the server (no posthog-node dependency). */

function posthogHost(): string {
  const raw =
    process.env.VITE_PUBLIC_POSTHOG_HOST?.trim() ||
    process.env.POSTHOG_HOST?.trim() ||
    "https://us.i.posthog.com";
  return raw.replace(/\/$/, "");
}

/**
 * PostHog event ingestion requires the project token (phc_...), not the
 * personal API key used by the build/sourcemap API. VITE_PUBLIC_POSTHOG_TOKEN
 * is already the browser project's canonical ingestion token, so the server
 * should use the same value. POSTHOG_PROJECT_TOKEN is supported for an
 * explicit server-only override.
 */
function posthogProjectToken(): string | null {
  return (
    process.env.POSTHOG_PROJECT_TOKEN?.trim() ||
    process.env.VITE_PUBLIC_POSTHOG_TOKEN?.trim() ||
    null
  );
}

export async function capturePostHogEvent(opts: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const apiKey = posthogProjectToken();
  if (!apiKey) return;

  try {
    const res = await fetch(`${posthogHost()}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event: opts.event,
        properties: {
          distinct_id: opts.distinctId,
          ...opts.properties,
          $lib: "spyreels-server",
        },
      }),
    });
    if (!res.ok) {
      const responseText = await res.text().catch(() => "");
      console.warn(
        `[PostHog] capture HTTP ${res.status} for ${opts.event}` +
          (responseText ? ` (${responseText.slice(0, 160)})` : "")
      );
    }
  } catch (err) {
    console.warn("[PostHog] capture failed:", err instanceof Error ? err.message : err);
  }
}

export function posthogDistinctIdForUser(userId: number): string {
  return String(userId);
}
