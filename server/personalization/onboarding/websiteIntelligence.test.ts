import http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileEvidence } from "@shared/personalization/model";
import {
  WEBSITE_INTELLIGENCE_USD,
  WEBSITE_MAX_BYTES,
  analyzeWebsitePage,
  blockedHostname,
  choosePublicAddress,
  isBlockedIpAddress,
  pageParts,
  productionWebsiteRequest,
  readPublicWebsite,
  resetWebsiteReadsForTests,
  scheduleWebsiteIntelligence,
  standardWebsitePort,
  startWebsiteIntelligence,
  type WebsiteIntelligenceStore,
  type WebsiteResponse,
} from "./websiteIntelligence";

const PAGE = `<html><head>
<title>Cafe Supply Co</title>
<meta name="description" content="Commercial kitchen equipment for restaurant owners.">
</head><body>
<p>We offer ovens, prep tables, and refrigeration.</p>
<p>Book a showroom visit. Wholesale pricing for restaurant groups.</p>
<p>Helping independent cafes fill more covers.</p>
</body></html>`;

function evidence(): ProfileEvidence {
  return {
    username: "cafe",
    displayName: "Cafe Supply",
    bio: "Commercial kitchen equipment.",
    category: "Product/service",
    cta: null,
    websiteUrl: "https://example.com/menu",
    captions: [],
  };
}

function htmlResponse(body: string, status = 200, location: string | null = null): WebsiteResponse {
  return {
    status,
    location,
    contentType: "text/html; charset=utf-8",
    bodyText: body,
    bytes: Buffer.byteLength(body),
  };
}

describe("website address checks", () => {
  beforeEach(() => {
    resetWebsiteReadsForTests();
  });

  it("allows only http on 80 and https on 443", () => {
    expect(standardWebsitePort(new URL("https://example.com/menu"))).toBe(true);
    expect(standardWebsitePort(new URL("https://example.com:443/menu"))).toBe(true);
    expect(standardWebsitePort(new URL("http://example.com/menu"))).toBe(true);
    expect(standardWebsitePort(new URL("http://example.com:80/menu"))).toBe(true);
    expect(standardWebsitePort(new URL("https://example.com:8443/menu"))).toBe(false);
    expect(standardWebsitePort(new URL("http://example.com:8080/menu"))).toBe(false);
    expect(standardWebsitePort(new URL("https://example.com:80/menu"))).toBe(false);
    expect(standardWebsitePort(new URL("http://example.com:443/menu"))).toBe(false);
  });

  it("blocks loopback, link-local, private, and metadata addresses", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.1.2.3")).toBe(true);
    expect(isBlockedIpAddress("172.16.0.5")).toBe(true);
    expect(isBlockedIpAddress("192.168.1.8")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("0177.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("203.0.113.10")).toBe(true);
    expect(blockedHostname("localhost")).toBe("blocked_host");
    expect(blockedHostname("metadata.google.internal")).toBe("blocked_host");
    expect(blockedHostname("127.0.0.1")).toBe("private_address");
  });

  it("refuses a host that resolves to any private address", () => {
    expect(
      choosePublicAddress([
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.4", family: 4 },
      ]).ok
    ).toBe(false);
    expect(choosePublicAddress([{ address: "2001:4860:4860::8888", family: 6 }])).toEqual({
      ok: false,
      code: "ipv6_only",
    });
    expect(choosePublicAddress([{ address: "1.1.1.1", family: 4 }])).toEqual({
      ok: true,
      address: "1.1.1.1",
      family: 4,
    });
  });
});

describe("website page reading", () => {
  it("keeps offers, customers, calls to action, and goal lines from the page", () => {
    const parts = pageParts(PAGE);
    const website = analyzeWebsitePage({
      url: "https://example.com/menu",
      title: parts.title,
      description: parts.description,
      text: parts.text,
      fetchedAt: new Date("2026-10-24T16:00:00.000Z"),
    });
    expect(website).toMatchObject({
      url: "https://example.com/menu",
      title: "Cafe Supply Co",
      businessModel: "b2b",
    });
    expect(website.offers[0]).toMatch(/We offer ovens/);
    expect(website.customers).toEqual(expect.arrayContaining(["restaurant owners"]));
    expect(website.callsToAction.some(line => /Book a showroom visit/.test(line))).toBe(true);
    expect(website.goalEvidence.some(line => /fill more covers/.test(line))).toBe(true);
    expect(JSON.stringify(website).length).toBeLessThan(2_000);
  });

  it("does not request a redirect target that resolves to a private address", async () => {
    const requested: string[] = [];
    const result = await readPublicWebsite("https://example.com/menu", {
      resolve: async hostname => {
        if (hostname === "example.com") return [{ address: "1.1.1.1", family: 4 }];
        return [{ address: "169.254.169.254", family: 4 }];
      },
      request: async input => {
        requested.push(input.address);
        return htmlResponse("", 302, "http://169.254.169.254/latest/meta-data");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("private_address");
    expect(requested).toEqual(["1.1.1.1"]);
  });

  it("pins the request to the public address it already checked", async () => {
    const seen: string[] = [];
    const result = await readPublicWebsite("https://shop.example/menu", {
      resolve: async () => [{ address: "1.1.1.1", family: 4 }],
      request: async input => {
        seen.push(`${input.url.hostname}@${input.address}`);
        return htmlResponse(PAGE);
      },
      now: () => new Date("2026-10-24T16:00:00.000Z"),
    });
    expect(seen).toEqual(["shop.example@1.1.1.1"]);
    expect(result.ok && result.website.businessModel).toBe("b2b");
    expect(WEBSITE_INTELLIGENCE_USD).toBe(0);
  });

  it("does not connect when the profile link or a redirect uses a nonstandard port", async () => {
    const requested: string[] = [];
    const direct = await readPublicWebsite("https://example.com:8443/menu", {
      resolve: async () => {
        requested.push("resolve");
        return [{ address: "1.1.1.1", family: 4 }];
      },
      request: async () => {
        requested.push("request");
        return htmlResponse(PAGE);
      },
    });
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.code).toBe("blocked_port");
    expect(requested).toEqual([]);

    const redirected = await readPublicWebsite("https://example.com/menu", {
      resolve: async () => [{ address: "1.1.1.1", family: 4 }],
      request: async input => {
        requested.push(input.url.port || "443");
        return htmlResponse("", 302, "https://example.com:8443/admin");
      },
    });
    expect(redirected.ok).toBe(false);
    if (!redirected.ok) expect(redirected.code).toBe("blocked_port");
    expect(requested).toEqual(["443"]);
  });

  it("rejects a body over the byte cap instead of reading a partial page", async () => {
    const result = await readPublicWebsite("https://example.com/menu", {
      maxBytes: 32,
      resolve: async () => [{ address: "1.1.1.1", family: 4 }],
      request: async () => ({
        ...htmlResponse(PAGE),
        bytes: 70_000,
        truncated: true,
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("response_too_large");
    expect(WEBSITE_MAX_BYTES).toBe(64 * 1024);
  });

  it("stops a hanging DNS lookup inside the same budget and does not connect", async () => {
    const requested: string[] = [];
    const started = Date.now();
    const result = await readPublicWebsite("https://example.com/", {
      timeoutMs: 40,
      resolve: () => new Promise(() => {}),
      request: async input => {
        requested.push(input.address);
        return htmlResponse(PAGE);
      },
    });
    expect(Date.now() - started).toBeLessThan(180);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("timeout");
    expect(requested).toEqual([]);
  });

  it("stops a stalled read inside one timeout budget", async () => {
    const started = Date.now();
    const result = await readPublicWebsite("https://example.com/", {
      timeoutMs: 40,
      resolve: async () => [{ address: "1.1.1.1", family: 4 }],
      request: input =>
        new Promise((_resolve, reject) => {
          input.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    });
    expect(Date.now() - started).toBeLessThan(180);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("timeout");
  });
});

describe("website scheduling", () => {
  beforeEach(() => {
    resetWebsiteReadsForTests();
  });

  it("returns after suggestions are queued and does not wait for the page", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const started = Date.now();
    await scheduleWebsiteIntelligence({
      enqueueSuggestions: async () => {
        order.push("enqueue");
      },
      websiteUrl: "https://example.com/menu",
      start: () => {
        order.push("start");
        void gate.then(() => order.push("fetch"));
      },
    });
    expect(Date.now() - started).toBeLessThan(30);
    expect(order).toEqual(["enqueue", "start"]);
    release();
    await gate;
    expect(order).toEqual(["enqueue", "start", "fetch"]);
  });

  it("stores the read without a second fetch when that url is already saved", async () => {
    let reads = 0;
    let writes = 0;
    let checked = false;
    const store: WebsiteIntelligenceStore = {
      async loadRunProfileEvidence() {
        checked = true;
        return {
          ...evidence(),
          website: {
            url: "https://example.com/menu",
            fetchedAt: "2026-10-24T16:00:00.000Z",
            title: "Cafe Supply Co",
            offers: [],
            businessModel: "b2b",
            customers: [],
            callsToAction: [],
            goalEvidence: [],
          },
        };
      },
      async saveWebsiteIntelligence() {
        writes += 1;
      },
    };
    startWebsiteIntelligence({
      runId: "run-1",
      url: "https://example.com/menu",
      store,
      read: async () => {
        reads += 1;
        return { ok: false, code: "request", ms: 1 };
      },
    });
    await vi.waitFor(() => expect(checked).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(reads).toBe(0);
    expect(writes).toBe(0);
  });

  it("stores a finished read after the profile evidence is already saved", async () => {
    let savedTitle: string | null = null;
    const store: WebsiteIntelligenceStore = {
      async loadRunProfileEvidence() {
        return evidence();
      },
      async saveWebsiteIntelligence(_runId, website) {
        savedTitle = website.title;
      },
    };
    startWebsiteIntelligence({
      runId: "run-1",
      url: "https://example.com/menu",
      store,
      read: async () => ({
        ok: true,
        bytes: 120,
        ms: 12,
        website: analyzeWebsitePage({
          url: "https://example.com/menu",
          ...pageParts(PAGE),
          fetchedAt: new Date("2026-10-24T16:00:00.000Z"),
        }),
      }),
    });
    await vi.waitFor(() => expect(savedTitle).toBe("Cafe Supply Co"));
  });

  it("does not start a second read while the same run is already reading", async () => {
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const read = async () => {
      reads += 1;
      await gate;
      return { ok: false as const, code: "request" as const, ms: 1 };
    };
    const store: WebsiteIntelligenceStore = {
      async loadRunProfileEvidence() {
        return evidence();
      },
      async saveWebsiteIntelligence() {},
    };
    startWebsiteIntelligence({ runId: "run-same", url: "https://example.com/menu", store, read });
    startWebsiteIntelligence({ runId: "run-same", url: "https://example.com/menu", store, read });
    await vi.waitFor(() => expect(reads).toBe(1));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(reads).toBe(1);
    release();
  });
});

describe("website response cap", () => {
  it("returns a bounded failure from the live reader when the body exceeds 64 KB", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<title>Cafe Supply Co</title>We offer ovens.");
      res.write("x".repeat(200));
      res.end();
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const response = await productionWebsiteRequest({
        url: new URL(`http://127.0.0.1:${port}/`),
        address: "127.0.0.1",
        family: 4,
        signal: AbortSignal.timeout(1_000),
        maxBytes: 64,
      });
      expect(response.truncated).toBe(true);
      expect(response.bodyText).toBe("");
      expect(response.bytes).toBeGreaterThan(64);
    } finally {
      await new Promise(resolve => server.close(() => resolve(undefined)));
    }
  });
});
