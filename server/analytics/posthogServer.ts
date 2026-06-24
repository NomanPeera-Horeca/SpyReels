/** Fire-and-forget PostHog capture from the server (no posthog-node dependency). */

function posthogHost(): string {
  const raw = process.env.VITE_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
  return raw.replace(/\/$/, "");
}

function posthogApiKey(): string | null {
  return (
    process.env.POSTHOG_API_KEY?.trim() ||
    process.env.VITE_PUBLIC_POSTHOG_TOKEN?.trim() ||
    null
  );
}

export async function capturePostHogEvent(opts: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const apiKey = posthogApiKey();
  if (!apiKey) return;

  try {
    const res = await fetch(`${posthogHost()}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event: opts.event,
        distinct_id: opts.distinctId,
        properties: {
          ...opts.properties,
          $lib: "spyreels-server",
        },
      }),
    });
    if (!res.ok) {
      console.warn(`[PostHog] capture HTTP ${res.status} for ${opts.event}`);
    }
  } catch (err) {
    console.warn("[PostHog] capture failed:", err instanceof Error ? err.message : err);
  }
}

export function posthogDistinctIdForUser(userId: number): string {
  return String(userId);
}
