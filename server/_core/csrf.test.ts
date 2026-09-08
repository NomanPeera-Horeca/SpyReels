import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { csrfOriginGuard } from "./csrf";
import { isAuthIpRateLimited } from "../publicRateLimit";

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: "POST",
    path: "/api/trpc/some.call",
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeResponse() {
  const res = {
    statusCode: 0,
    body: null,
    status: function (code: number) {
      this.statusCode = code;
      return this;
    },
    json: function (body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: { error?: string } | null;
  };
}

function run(req: Request, res: Response) {
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  csrfOriginGuard(req, res, next);
  return nextCalled;
}

describe("csrfOriginGuard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_SERVER_URL = "https://spyreels.ai";
    process.env.SPYREELS_SITE_URL = "";
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    // @ts-expect-error resetting env snapshot
    process.env = originalEnv;
  });

  it("allows safe methods regardless of origin", () => {
    const req = makeRequest({
      method: "GET",
      headers: { origin: "https://evil.example.com" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
    expect(res.statusCode).toBe(0);
  });

  it("allows same-origin POST requests", () => {
    const req = makeRequest({
      headers: { origin: "https://spyreels.ai", host: "spyreels.ai" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
  });

  it("allows POST requests with no Origin header (curl, bots)", () => {
    const req = makeRequest();
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
  });

  it("blocks cross-origin POST requests (the CSRF vector)", () => {
    const req = makeRequest({
      headers: { origin: "https://evil.example.com", host: "spyreels.ai" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("blocks POST requests with a malformed origin", () => {
    const req = makeRequest({
      headers: { origin: "not-a-url", host: "spyreels.ai" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("allows the canonical production origin even when the Host header differs", () => {
    const req = makeRequest({
      headers: {
        origin: "https://spyreels.ai",
        host: "spyreels.ai:443",
      },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
  });

  it("does not apply to signature-verified webhooks", () => {
    const req = makeRequest({
      path: "/api/stripe/webhook",
      headers: { origin: "https://api.stripe.com" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
  });

  it("does not apply to bearer-token extension API routes", () => {
    for (const path of ["/api/ext/ping", "/api/extension/track"]) {
      const req = makeRequest({ path, headers: { origin: "chrome-extension://abc123" } });
      const res = makeResponse();
      expect(run(req, res)).toBe(true);
    }
  });

  it("allows localhost origins in development", () => {
    process.env.NODE_ENV = "development";
    const req = makeRequest({
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
  });

  it("blocks localhost origins in production", () => {
    process.env.NODE_ENV = "production";
    const req = makeRequest({
      headers: { origin: "http://localhost:3000", host: "spyreels.ai" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});

describe("isAuthIpRateLimited", () => {
  it("allows requests under the limit and blocks beyond 20 in 10 minutes", () => {
    for (let i = 0; i < 20; i++) {
      expect(isAuthIpRateLimited("203.0.113.10")).toBe(false);
    }
    expect(isAuthIpRateLimited("203.0.113.10")).toBe(true);
  });

  it("tracks different IPs independently", () => {
    for (let i = 0; i < 22; i++) {
      isAuthIpRateLimited("203.0.113.20");
    }
    expect(isAuthIpRateLimited("203.0.113.21")).toBe(false);
  });
});