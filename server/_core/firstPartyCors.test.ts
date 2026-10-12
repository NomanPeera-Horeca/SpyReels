import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { firstPartyApiCors } from "./firstPartyCors";

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    path: "/api/trpc/hookGenerator.generate",
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeResponse() {
  const headers = new Map<string, string>();
  const res = {
    statusCode: 0,
    headers,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end() {
      return this;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    headers: Map<string, string>;
  };
}

function run(req: Request, res: Response) {
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  firstPartyApiCors(req, res, next);
  return nextCalled;
}

describe("firstPartyApiCors", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      SPYREELS_SITE_URL: "https://spyreels.ai",
      SPYREELS_APP_ORIGIN: "https://app.spyreels.ai",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("adds credentialed CORS for apex origin calling the product API", () => {
    const req = makeRequest({
      headers: { origin: "https://spyreels.ai" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://spyreels.ai"
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("answers OPTIONS preflight for allowed first-party origins", () => {
    const req = makeRequest({
      method: "OPTIONS",
      headers: {
        origin: "https://spyreels.ai",
        "access-control-request-headers": "content-type,x-workspace-id",
      },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(false);
    expect(res.statusCode).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "x-workspace-id"
    );
  });

  it("does not open CORS to unknown origins", () => {
    const req = makeRequest({
      headers: { origin: "https://evil.example.com" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
    expect(res.headers.get("access-control-allow-origin")).toBeUndefined();
  });

  it("skips non-API paths", () => {
    const req = makeRequest({
      path: "/pricing",
      headers: { origin: "https://spyreels.ai" },
    });
    const res = makeResponse();
    expect(run(req, res)).toBe(true);
    expect(res.headers.get("access-control-allow-origin")).toBeUndefined();
  });
});
