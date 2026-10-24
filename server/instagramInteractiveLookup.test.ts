import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROFILE_LOOKUP_DEADLINE_MS,
} from "@shared/personalization/profileLookup";
import {
  InstagramHandleNotFoundError,
  InstagramPrivateAccountError,
  InstagramProviderError,
  resolveInstagramIdentity,
} from "./instagram";
import { classifyLookupError } from "./personalization/onboarding/profileLookupDeps";
import { profileLookupProviderBudget } from "./personalization/onboarding/profileLookup";

const DEADLINE_MS = PROFILE_LOOKUP_DEADLINE_MS;

function onboardingBudget(signal?: AbortSignal) {
  return {
    ...profileLookupProviderBudget("instagram", DEADLINE_MS),
    signal,
  };
}

function graphProfile(username: string, extras?: { isPrivate?: boolean }) {
  return {
    data: {
      user: {
        id: "42",
        username,
        is_private: extras?.isPrivate ?? false,
        full_name: "Noman Peera",
        biography: "Media studio",
        profile_pic_url: "https://example.com/pic.jpg",
        edge_followed_by: { count: 10 },
        edge_follow: { count: 1 },
        edge_owner_to_timeline_media: { count: 2 },
        is_verified: false,
      },
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function profileCalls(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes("/v1/instagram/profile")).length;
}

function searchCalls(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes("/v1/instagram/search")).length;
}

function installDelayedProfile(delayMs: number, body: unknown = graphProfile("noman_peera")) {
  let signal: AbortSignal | undefined;
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(jsonResponse(200, body)), delayMs);
      const abort = () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      };
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, signal: () => signal };
}

describe("interactive Instagram profile lookup", () => {
  const logs: string[] = [];

  beforeEach(() => {
    process.env.SCRAPECREATORS_API_KEY = "test-key";
    logs.length = 0;
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(String(message ?? ""));
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function expectProfileAt(delayMs: number) {
    vi.useFakeTimers();
    const { fetchMock, signal } = installDelayedProfile(delayMs);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget());
    if (delayMs > 8_000) {
      await vi.advanceTimersByTimeAsync(8_000);
      expect(signal()?.aborted).toBe(false);
      expect(profileCalls(fetchMock)).toBe(1);
    }
    await vi.advanceTimersByTimeAsync(delayMs > 8_000 ? delayMs - 8_000 : delayMs);
    const identity = await pending;
    expect(identity.resolutionMethod).toBe("profile_handle");
    expect(identity.fallbackUsed).toBe(false);
    expect(identity.username).toBe("noman_peera");
    expect(identity.userId).toBe("42");
    expect(profileCalls(fetchMock)).toBe(1);
    expect(searchCalls(fetchMock)).toBe(0);
    const attempts = logs.filter(line => line.includes("[Instagram] profile attempt"));
    expect(attempts).toEqual([
      expect.stringContaining(`requested=@noman_peera n=1/2 ms=${delayMs} status=200 detail=ok`),
    ]);
    expect(attempts.join("\n")).not.toMatch(/Media studio|Noman Peera|test-key|biography/);
  }

  it("returns the profile when the direct request answers at 8 seconds", async () => {
    await expectProfileAt(8_000);
  });

  it("returns the profile when the direct request answers at 10 seconds", async () => {
    await expectProfileAt(10_000);
  });

  it("returns the profile when the direct request answers at 12 seconds", async () => {
    vi.useFakeTimers();
    let release: ((value: Response) => void) | undefined;
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener("abort", abort, { once: true });
        release = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget());
    await vi.advanceTimersByTimeAsync(8_000);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(4_000 - 1);
    expect(signal?.aborted).toBe(false);
    expect(profileCalls(fetchMock)).toBe(1);
    release?.(jsonResponse(200, graphProfile("noman_peera")));
    const identity = await pending;
    expect(identity.username).toBe("noman_peera");
    expect(identity.fallbackUsed).toBe(false);
    expect(profileCalls(fetchMock)).toBe(1);
    expect(searchCalls(fetchMock)).toBe(0);
    const attempts = logs.filter(line => line.includes("[Instagram] profile attempt"));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toContain("status=200 detail=ok");
    expect(attempts[0]).toContain("requested=@noman_peera");
    expect(Number(attempts[0]?.match(/ms=(\d+)/)?.[1])).toBeGreaterThanOrEqual(11_999);
  });

  it("classifies a still-open profile request at the deadline as timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget());
    const settled = pending.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );
    await vi.advanceTimersByTimeAsync(8_000);
    expect(profileCalls(fetchMock)).toBe(1);
    await vi.advanceTimersByTimeAsync(4_000);
    const outcome = await settled;
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(InstagramProviderError);
    expect(outcome.error).not.toBeInstanceOf(InstagramHandleNotFoundError);
    expect(outcome.error).toMatchObject({ httpStatus: 408, detail: "timeout" });
    expect(classifyLookupError(outcome.error)).toBe("timeout");
    expect(profileCalls(fetchMock)).toBe(1);
    expect(searchCalls(fetchMock)).toBe(0);
    const attempts = logs.filter(line => line.includes("[Instagram] profile attempt"));
    expect(attempts.some(line => line.includes("detail=timeout"))).toBe(true);
    expect(attempts.join("\n")).not.toMatch(/Media studio|test-key/);
  });

  it("cancels the in-flight profile request without starting another", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget(controller.signal));
    const settled = pending.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(profileCalls(fetchMock)).toBe(1);
    controller.abort();
    const outcome = await settled;
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(InstagramProviderError);
    expect(outcome.error).not.toBeInstanceOf(InstagramHandleNotFoundError);
    expect(classifyLookupError(outcome.error)).toBe("timeout");
    expect(profileCalls(fetchMock)).toBe(1);
    expect(searchCalls(fetchMock)).toBe(0);
  });

  it("retries a fast rate limit and then returns the profile", async () => {
    vi.useFakeTimers();
    let profiles = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path !== "/v1/instagram/profile") {
        throw new Error(`unexpected path ${path}`);
      }
      profiles += 1;
      if (profiles === 1) return jsonResponse(429, { error: "rate_limit" });
      return jsonResponse(200, graphProfile("noman_peera"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget());
    await vi.runAllTimersAsync();
    const identity = await pending;
    expect(identity.username).toBe("noman_peera");
    expect(profileCalls(fetchMock)).toBe(2);
    expect(searchCalls(fetchMock)).toBe(0);
    const attempts = logs.filter(line => line.includes("[Instagram] profile attempt"));
    expect(attempts[0]).toContain("n=1/2");
    expect(attempts[0]).toContain("detail=rate_limit");
    expect(attempts[1]).toContain("n=2/2");
    expect(attempts[1]).toContain("detail=ok");
  });

  it("keeps a real not-found, private account, and exhausted rate limit distinct from timeout", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/v1/instagram/profile") return jsonResponse(404, { error: "not_found" });
      if (path === "/v1/instagram/search") return jsonResponse(200, { data: { users: [] } });
      throw new Error(`unexpected path ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveInstagramIdentity("missing.handle", onboardingBudget())).rejects.toBeInstanceOf(
      InstagramHandleNotFoundError
    );
    expect(classifyLookupError(new InstagramHandleNotFoundError("missing.handle"))).toBe("not_found");
    expect(searchCalls(fetchMock)).toBe(1);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { error: "private", message: "Account is private" }))
    );
    const privateError = await resolveInstagramIdentity("private.handle", onboardingBudget()).then(
      () => null,
      (error: unknown) => error
    );
    expect(privateError).toBeInstanceOf(InstagramPrivateAccountError);
    expect(classifyLookupError(privateError)).toBe("private");

    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(429, { error: "too many requests" })));
    const pending = resolveInstagramIdentity("limited.handle", onboardingBudget());
    const rateSettled = pending.then(
      () => null,
      (error: unknown) => error
    );
    await vi.runAllTimersAsync();
    const rateError = await rateSettled;
    expect(rateError).toBeInstanceOf(InstagramProviderError);
    expect(rateError).not.toBeInstanceOf(InstagramHandleNotFoundError);
    expect(classifyLookupError(rateError)).toBe("rate_limited");
  });
});
