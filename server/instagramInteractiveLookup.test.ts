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
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const requestSignal = init?.signal;
      if (requestSignal) signals.push(requestSignal);
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(jsonResponse(200, graphProfile("noman_peera"))), delayMs);
        const abort = () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        };
        if (requestSignal?.aborted) abort();
        else requestSignal?.addEventListener("abort", abort, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget());
    if (delayMs > 6_000) {
      await vi.advanceTimersByTimeAsync(6_000);
      expect(signals[0]?.aborted).toBe(false);
      expect(profileCalls(fetchMock)).toBe(1);
      await vi.advanceTimersByTimeAsync(delayMs - 6_000);
    } else {
      await vi.advanceTimersByTimeAsync(delayMs);
    }
    const identity = await pending;
    expect(identity.resolutionMethod).toBe("profile_handle");
    expect(identity.fallbackUsed).toBe(false);
    expect(identity.username).toBe("noman_peera");
    expect(identity.userId).toBe("42");
    expect(searchCalls(fetchMock)).toBe(0);
    const hedged = delayMs > 6_500;
    expect(profileCalls(fetchMock)).toBe(hedged ? 2 : 1);
    if (hedged) expect(signals[1]?.aborted).toBe(true);
    const attempts = logs.filter(line => line.includes("[Instagram] profile attempt"));
    expect(attempts[0]).toContain(`requested=@noman_peera n=1/2 ms=${delayMs} status=200 detail=ok`);
    const hedge = logs.find(line => line.includes("[Instagram] profile hedge"));
    expect(hedge).toContain(hedged ? "hedge=1" : "hedge=0");
    expect(hedge).toContain("outcome=ok");
    expect(hedge).toContain("winner=1");
    expect(hedge).toContain(hedged ? "extraRequests=1" : "extraRequests=0");
    expect(logs.join("\n")).not.toMatch(/Media studio|Noman Peera|test-key|biography/);
  }

  it("returns the profile before the hedge when the direct request answers at 3 seconds", async () => {
    await expectProfileAt(3_000);
  });

  it("returns the profile when the direct request answers at 8 seconds", async () => {
    await expectProfileAt(8_000);
  });

  it("returns the profile when the direct request answers at 10 seconds", async () => {
    await expectProfileAt(10_000);
  });

  it("returns the profile when the direct request answers at 12 seconds", async () => {
    vi.useFakeTimers();
    let releaseFirst: ((value: Response) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    let calls = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const call = calls;
      return new Promise<Response>((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener("abort", abort, { once: true });
        if (call === 1) {
          firstSignal = init?.signal ?? undefined;
          releaseFirst = resolve;
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget());
    await vi.advanceTimersByTimeAsync(6_000);
    expect(firstSignal?.aborted).toBe(false);
    expect(profileCalls(fetchMock)).toBe(1);
    await vi.advanceTimersByTimeAsync(6_000 - 1);
    expect(firstSignal?.aborted).toBe(false);
    expect(profileCalls(fetchMock)).toBe(2);
    releaseFirst?.(jsonResponse(200, graphProfile("noman_peera")));
    const identity = await pending;
    expect(identity.username).toBe("noman_peera");
    expect(identity.fallbackUsed).toBe(false);
    expect(searchCalls(fetchMock)).toBe(0);
    const attempts = logs.filter(line => line.includes("[Instagram] profile attempt"));
    expect(attempts.some(line => line.includes("n=1/2") && line.includes("status=200 detail=ok"))).toBe(true);
    expect(attempts[0]).toContain("requested=@noman_peera");
    expect(Number(attempts[0]?.match(/ms=(\d+)/)?.[1])).toBeGreaterThanOrEqual(11_999);
    expect(profileCalls(fetchMock)).toBe(2);
    expect(logs.some(line => line.includes("hedge=1") && line.includes("winner=1") && line.includes("extraRequests=1"))).toBe(true);
    expect(logs.join("\n")).not.toMatch(/Media studio|Noman Peera|test-key|biography/);
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
    await vi.advanceTimersByTimeAsync(6_000);
    expect(profileCalls(fetchMock)).toBe(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(profileCalls(fetchMock)).toBe(2);
    const outcome = await settled;
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(InstagramProviderError);
    expect(outcome.error).not.toBeInstanceOf(InstagramHandleNotFoundError);
    expect(outcome.error).toMatchObject({ httpStatus: 408, detail: "timeout" });
    expect(classifyLookupError(outcome.error)).toBe("timeout");
    expect(profileCalls(fetchMock)).toBe(2);
    expect(searchCalls(fetchMock)).toBe(0);
    const attempts = logs.filter(line => line.includes("[Instagram] profile attempt"));
    expect(attempts.filter(line => line.includes("detail=timeout"))).toHaveLength(2);
    expect(logs.some(line => line.includes("hedge=1") && line.includes("outcome=timeout") && line.includes("extraRequests=1"))).toBe(true);
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
    expect(logs.some(line => line.includes("hedge=0") && line.includes("winner=2") && line.includes("extraRequests=1"))).toBe(true);
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
    expect(logs.some(line => line.includes("hedge=0") && line.includes("outcome=rate_limit") && line.includes("extraRequests=1"))).toBe(true);
  });

  it("returns the overlapping profile and cancels the request that is still pending", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const requestSignal = init?.signal;
      if (requestSignal) signals.push(requestSignal);
      const attempt = signals.length;
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(jsonResponse(200, graphProfile("noman_peera"))),
          attempt === 1 ? 20_000 : 1_000
        );
        const abort = () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        };
        if (requestSignal?.aborted) abort();
        else requestSignal?.addEventListener("abort", abort, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget());
    await vi.advanceTimersByTimeAsync(6_500);
    expect(profileCalls(fetchMock)).toBe(2);
    await vi.advanceTimersByTimeAsync(1_000);
    const identity = await pending;
    expect(identity.username).toBe("noman_peera");
    expect(identity.fallbackUsed).toBe(false);
    expect(signals[0]?.aborted).toBe(true);
    expect(searchCalls(fetchMock)).toBe(0);
    expect(logs.some(line => line.includes("hedge=1") && line.includes("winner=2") && line.includes("outcome=ok") && line.includes("extraRequests=1"))).toBe(true);
    expect(logs.join("\n")).not.toMatch(/Media studio|Noman Peera|test-key|biography/);
  });

  it("does not let a temporary provider error cancel the overlapping request", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchMock = vi.fn(() => {
      calls += 1;
      const attempt = calls;
      return new Promise<Response>(resolve => {
        setTimeout(() => {
          resolve(
            attempt === 1
              ? jsonResponse(503, { error: "unavailable" })
              : jsonResponse(200, graphProfile("noman_peera"))
          );
        }, attempt === 1 ? 7_000 : 2_000);
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera", onboardingBudget());
    let settled = false;
    pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await vi.advanceTimersByTimeAsync(7_000);
    expect(profileCalls(fetchMock)).toBe(2);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    const identity = await pending;
    expect(identity.username).toBe("noman_peera");
    expect(logs.some(line => line.includes("hedge=1") && line.includes("winner=2") && line.includes("outcome=ok"))).toBe(true);
    expect(logs.join("\n")).not.toMatch(/unavailable|Media studio|test-key/);
  });

  it("keeps a not-found final when it arrives while the overlap is still pending", async () => {
    vi.useFakeTimers();
    let profiles = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/v1/instagram/search")) {
        return Promise.resolve(jsonResponse(200, { data: { users: [] } }));
      }
      profiles += 1;
      const attempt = profiles;
      return new Promise<Response>((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener("abort", abort, { once: true });
        if (attempt === 1) {
          setTimeout(() => resolve(jsonResponse(404, { error: "not_found" })), 7_000);
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("missing.handle", onboardingBudget());
    const settled = pending.then(
      () => null,
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(7_000);
    const error = await settled;
    expect(error).toBeInstanceOf(InstagramHandleNotFoundError);
    expect(error).not.toBeInstanceOf(InstagramProviderError);
    expect(classifyLookupError(error)).toBe("not_found");
    expect(profileCalls(fetchMock)).toBe(2);
    expect(searchCalls(fetchMock)).toBe(1);
    expect(logs.some(line => line.includes("outcome=not_found"))).toBe(true);
  });

  it("keeps a private account final when it arrives while the overlap is still pending", async () => {
    vi.useFakeTimers();
    let profiles = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      profiles += 1;
      const attempt = profiles;
      return new Promise<Response>((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener("abort", abort, { once: true });
        if (attempt === 1) {
          setTimeout(
            () => resolve(jsonResponse(200, { error: "private", message: "Account is private" })),
            7_000
          );
        } else {
          setTimeout(() => resolve(jsonResponse(200, graphProfile("private.handle"))), 3_000);
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("private.handle", onboardingBudget());
    const settled = pending.then(
      () => null,
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(7_000);
    const error = await settled;
    expect(error).toBeInstanceOf(InstagramPrivateAccountError);
    expect(classifyLookupError(error)).toBe("private");
    expect(profileCalls(fetchMock)).toBe(2);
    expect(searchCalls(fetchMock)).toBe(0);
    expect(logs.some(line => line.includes("outcome=private") && line.includes("winner=1"))).toBe(true);
    expect(logs.join("\n")).not.toMatch(/Account is private|Media studio|test-key/);
  });

  it("does not hedge an unbudgeted Creator Radar profile lookup", async () => {
    vi.useFakeTimers();
    let release: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort, { once: true });
        release = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = resolveInstagramIdentity("noman_peera");
    await vi.advanceTimersByTimeAsync(7_000);
    expect(profileCalls(fetchMock)).toBe(1);
    expect(logs.some(line => line.includes("profile hedge"))).toBe(false);
    release?.(jsonResponse(200, graphProfile("noman_peera")));
    const identity = await pending;
    expect(identity.username).toBe("noman_peera");
    expect(identity.resolutionMethod).toBe("profile_handle");
    expect(profileCalls(fetchMock)).toBe(1);
  });
});
