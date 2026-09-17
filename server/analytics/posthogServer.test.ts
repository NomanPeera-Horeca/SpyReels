import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturePostHogEvent } from "./posthogServer";

describe("server PostHog capture", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.POSTHOG_PROJECT_TOKEN;
    delete process.env.VITE_PUBLIC_POSTHOG_TOKEN;
    delete process.env.POSTHOG_API_KEY;
    delete process.env.VITE_PUBLIC_POSTHOG_HOST;
    delete process.env.POSTHOG_HOST;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses the project ingestion token instead of the personal API key", async () => {
    process.env.POSTHOG_API_KEY = "phx_personal_should_not_be_used";
    process.env.VITE_PUBLIC_POSTHOG_TOKEN = "phc_project_token";
    process.env.VITE_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await capturePostHogEvent({
      distinctId: "42",
      event: "ai_gateway_tool_executed",
      properties: { ai_source: "chatgpt", ai_tool: "get_usage" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.api_key).toBe("phc_project_token");
    expect(body.api_key).not.toBe("phx_personal_should_not_be_used");
    expect(body.properties).toEqual(
      expect.objectContaining({
        distinct_id: "42",
        ai_source: "chatgpt",
        ai_tool: "get_usage",
        $lib: "spyreels-server",
      })
    );
    expect(body.distinct_id).toBeUndefined();
  });

  it("supports an explicit server project-token override", async () => {
    process.env.POSTHOG_PROJECT_TOKEN = "phc_server_override";
    process.env.VITE_PUBLIC_POSTHOG_TOKEN = "phc_browser_token";

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    await capturePostHogEvent({ distinctId: "7", event: "test_event" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.api_key).toBe("phc_server_override");
  });
});
