/**
 * Reads the public website linked on a social profile after suggestions
 * have already been started. The read is not on the confirmation path.
 *
 * The carousel page fetcher is not used here. That helper follows redirects
 * without checking the address, which is unsafe for a link a creator controls.
 */
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { ProfileEvidence, WebsiteBusinessModel, WebsiteIntelligence } from "@shared/personalization/model";
import { publicWebsiteUrl } from "./profileEvidence";

/** No paid provider and no model call. */
export const WEBSITE_INTELLIGENCE_USD = 0;
export const WEBSITE_TIMEOUT_MS = 4_000;
export const WEBSITE_MAX_REDIRECTS = 3;
export const WEBSITE_MAX_BYTES = 64 * 1024;

const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(address, prefix, "ipv4");
}
blockedAddresses.addAddress("255.255.255.255", "ipv4");
blockedAddresses.addAddress("::", "ipv6");
blockedAddresses.addAddress("::1", "ipv6");
blockedAddresses.addSubnet("fc00::", 7, "ipv6");
blockedAddresses.addSubnet("fe80::", 10, "ipv6");
blockedAddresses.addSubnet("ff00::", 8, "ipv6");

export type WebsiteBlockCode =
  | "invalid_url"
  | "blocked_host"
  | "private_address"
  | "ipv6_only"
  | "dns"
  | "timeout"
  | "redirect_limit"
  | "http_status"
  | "unsupported_type"
  | "request"
  | "no_evidence";

export type WebsiteHostAddress = { address: string; family: 4 | 6 };

export type WebsiteResponse = {
  status: number;
  location: string | null;
  contentType: string;
  bodyText: string;
  bytes: number;
};

export type WebsiteReadDeps = {
  resolve: (hostname: string) => Promise<WebsiteHostAddress[]>;
  request: (input: {
    url: URL;
    address: string;
    family: 4 | 6;
    signal: AbortSignal;
    maxBytes: number;
  }) => Promise<WebsiteResponse>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  now?: () => Date;
};

export type WebsiteReadResult =
  | { ok: true; website: WebsiteIntelligence; bytes: number; ms: number }
  | { ok: false; code: WebsiteBlockCode; ms: number };

export type WebsiteIntelligenceStore = {
  loadRunProfileEvidence(runId: string): Promise<ProfileEvidence | null>;
  saveWebsiteIntelligence(runId: string, website: WebsiteIntelligence): Promise<void>;
};

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/** True when the address is not a public unicast target. */
export function isBlockedIpAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpAddress(mapped[1]);
  const family = isIP(address);
  if (family === 4) {
    if (!ipv4Octets(address)) return true;
    return blockedAddresses.check(address, "ipv4");
  }
  if (family === 6) {
    try {
      return blockedAddresses.check(address, "ipv6");
    } catch {
      return true;
    }
  }
  return true;
}

export function blockedHostname(hostname: string): WebsiteBlockCode | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return "blocked_host";
  }
  if (host === "metadata.google.internal" || /^\d+$/.test(host)) return "blocked_host";
  if (isIP(host) && isBlockedIpAddress(host)) return "private_address";
  return null;
}

export function choosePublicAddress(
  addresses: WebsiteHostAddress[]
): { ok: true; address: string; family: 4 } | { ok: false; code: WebsiteBlockCode } {
  const v4 = addresses.filter(item => item.family === 4);
  if (v4.some(item => isBlockedIpAddress(item.address))) return { ok: false, code: "private_address" };
  const usable = v4.filter(item => !isBlockedIpAddress(item.address));
  if (usable.length > 0) return { ok: true, address: usable[0].address, family: 4 };
  if (addresses.length > 0) return { ok: false, code: "ipv6_only" };
  return { ok: false, code: "dns" };
}

function resolveRedirect(current: string, location: string | null): string | null {
  if (!location) return null;
  try {
    return publicWebsiteUrl(new URL(location, current).toString());
  } catch {
    return null;
  }
}

function allowedContentType(value: string): boolean {
  const type = value.toLowerCase();
  return type.includes("text/html") || type.includes("text/plain") || type.includes("application/xhtml");
}

function clip(value: string, max: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max).trim() : cleaned;
}

function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const CTA_PATTERNS: RegExp[] = [
  /\bbook (a|an|your|now)\b/i,
  /\b(shop now|add to cart|get started|sign up|subscribe|enroll|apply now|buy now|start free)\b/i,
  /\b(order|orders|quote|quotes|consultation|consult)\b/i,
  /\bwholesale\b/i,
  /\bdm (me|us|for)\b/i,
];

const GOAL_PATTERNS: RegExp[] = [
  /\bmore (clients|customers|bookings|covers|sales|leads|students)\b/i,
  /\bfill (more|the|my|our)\b/i,
  /\bgrow (my|our|the) (business|brand|audience)\b/i,
  /\b(bookings|leads|students|sales)\b/i,
];

const OFFER_PATTERNS: RegExp[] = [
  /\bwe offer\b[^.]{0,140}/i,
  /\bour (services|products)\b[^.]{0,140}/i,
  /\bservices include\b[^.]{0,140}/i,
];

const MODEL_RULES: Array<{ model: WebsiteBusinessModel; pattern: RegExp }> = [
  { model: "ecommerce", pattern: /\b(add to cart|shop now|checkout)\b/i },
  { model: "courses", pattern: /\b(course|courses|bootcamp|cohort|enroll)\b/i },
  { model: "coaching", pattern: /\b(coaching|one-on-one|1:1)\b/i },
  { model: "digital_products", pattern: /\b(digital product|ebook|template pack)\b/i },
  { model: "b2b", pattern: /\b(b2b|enterprise|for teams|wholesale)\b/i },
  { model: "local_service", pattern: /\b(appointment|our restaurant|our salon|our menu)\b/i },
  { model: "b2c", pattern: /\b(b2c|for consumers)\b/i },
];

const CUSTOMER_SKIP = /^(more|you|free|sale|the|a|an|your|our|all|everyone)\b/i;

function uniqueLines(lines: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const clipped = clip(line, 180);
    const key = clipped.toLowerCase();
    if (!clipped || seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= max) break;
  }
  return out;
}

export function analyzeWebsitePage(input: {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  fetchedAt: Date;
}): WebsiteIntelligence {
  const page = [input.title, input.description, input.text].filter(Boolean).join("\n");
  const model = MODEL_RULES.find(rule => rule.pattern.test(page))?.model ?? null;
  const lines = sentences(page);
  const customers: string[] = [];
  const customerPattern = /\b(?:for|helping|we help)\s+([a-z0-9][^.\n]{2,70})/gi;
  for (const match of page.matchAll(customerPattern)) {
    const phrase = clip(match[1] ?? "", 80).replace(/[,:;].*$/, "").trim();
    if (!phrase || CUSTOMER_SKIP.test(phrase)) continue;
    customers.push(phrase);
    if (customers.length >= 3) break;
  }
  return {
    url: input.url,
    fetchedAt: input.fetchedAt.toISOString(),
    title: input.title ? clip(input.title, 120) : null,
    offers: uniqueLines(
      OFFER_PATTERNS.flatMap(pattern => {
        const match = page.match(pattern);
        return match ? [match[0]] : [];
      }),
      3
    ),
    businessModel: model,
    customers: uniqueLines(customers, 3),
    callsToAction: uniqueLines(
      lines.filter(line => CTA_PATTERNS.some(pattern => pattern.test(line))),
      3
    ),
    goalEvidence: uniqueLines(
      lines.filter(line => GOAL_PATTERNS.some(pattern => pattern.test(line))),
      3
    ),
  };
}

export function pageParts(html: string): { title: string | null; description: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const description =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)?.[1] ??
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i)?.[1] ??
    null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4_000);
  return {
    title: title ? clip(title, 120) : null,
    description: description ? clip(description, 300) : null,
    text,
  };
}

function failed(code: WebsiteBlockCode, started: number): WebsiteReadResult {
  return { ok: false, code, ms: Date.now() - started };
}

export async function readPublicWebsite(rawUrl: string, deps: WebsiteReadDeps): Promise<WebsiteReadResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? WEBSITE_TIMEOUT_MS);
  const maxRedirects = deps.maxRedirects ?? WEBSITE_MAX_REDIRECTS;
  const maxBytes = deps.maxBytes ?? WEBSITE_MAX_BYTES;
  try {
    let current = publicWebsiteUrl(rawUrl);
    if (!current) return failed("invalid_url", started);
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      if (controller.signal.aborted) return failed("timeout", started);
      const url = new URL(current);
      const hostCode = blockedHostname(url.hostname);
      if (hostCode) return failed(hostCode, started);
      let addresses: WebsiteHostAddress[];
      try {
        addresses = await deps.resolve(url.hostname);
      } catch {
        return failed("dns", started);
      }
      const chosen = choosePublicAddress(addresses);
      if (!chosen.ok) return failed(chosen.code, started);
      let response: WebsiteResponse;
      try {
        response = await Promise.race([
          deps.request({
            url,
            address: chosen.address,
            family: chosen.family,
            signal: controller.signal,
            maxBytes,
          }),
          new Promise<never>((_resolve, reject) => {
            if (controller.signal.aborted) {
              reject(new Error("aborted"));
              return;
            }
            controller.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          }),
        ]);
      } catch {
        return failed(controller.signal.aborted ? "timeout" : "request", started);
      }
      if (response.status >= 300 && response.status < 400) {
        if (hop === maxRedirects) return failed("redirect_limit", started);
        const next = resolveRedirect(current, response.location);
        if (!next) return failed("invalid_url", started);
        current = next;
        continue;
      }
      if (response.status < 200 || response.status >= 300) return failed("http_status", started);
      if (!allowedContentType(response.contentType)) return failed("unsupported_type", started);
      const parts = pageParts(response.bodyText);
      const website = analyzeWebsitePage({
        url: publicWebsiteUrl(rawUrl) ?? current,
        title: parts.title,
        description: parts.description,
        text: parts.text,
        fetchedAt: deps.now?.() ?? new Date(),
      });
      return { ok: true, website, bytes: response.bytes, ms: Date.now() - started };
    }
    return failed("redirect_limit", started);
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveWebsiteHost(hostname: string): Promise<WebsiteHostAddress[]> {
  if (isIP(hostname)) {
    const family = isIP(hostname) === 6 ? 6 : 4;
    return [{ address: hostname, family }];
  }
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows.map(row => ({ address: row.address, family: row.family === 6 ? 6 : 4 }));
}

export function productionWebsiteRequest(input: {
  url: URL;
  address: string;
  family: 4 | 6;
  signal: AbortSignal;
  maxBytes: number;
}): Promise<WebsiteResponse> {
  const lib = input.url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: input.url.protocol,
        hostname: input.url.hostname,
        servername: input.url.hostname,
        port: input.url.port || undefined,
        path: `${input.url.pathname}${input.url.search}`,
        method: "GET",
        headers: {
          Host: input.url.host,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "User-Agent": "SpyReels/1.0",
        },
        lookup: ((_hostname, _options, callback) => {
          callback(null, input.address, input.family);
        }) as LookupFunction,
        signal: input.signal,
      },
      res => {
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          const body = Buffer.concat(chunks).subarray(0, input.maxBytes);
          const location = res.headers.location;
          resolve({
            status: res.statusCode ?? 0,
            location: typeof location === "string" ? location : null,
            contentType: typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : "",
            bodyText: body.toString("utf8"),
            bytes: body.length,
          });
        };
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > input.maxBytes) {
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - input.maxBytes))));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", finish);
        res.on("close", finish);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function readAndStore(input: {
  runId: string;
  url: string;
  store: WebsiteIntelligenceStore;
  read: (url: string) => Promise<WebsiteReadResult>;
}): Promise<void> {
  const existing = await input.store.loadRunProfileEvidence(input.runId);
  if (!existing) {
    console.info("[personalization] website_intelligence", { code: "no_evidence", costUsd: WEBSITE_INTELLIGENCE_USD });
    return;
  }
  if (existing.website?.url === input.url) return;
  const result = await input.read(input.url);
  if (!result.ok) {
    console.info("[personalization] website_intelligence", {
      code: result.code,
      ms: result.ms,
      costUsd: WEBSITE_INTELLIGENCE_USD,
    });
    return;
  }
  await input.store.saveWebsiteIntelligence(input.runId, result.website);
  console.info("[personalization] website_intelligence", {
    code: "stored",
    ms: result.ms,
    bytes: result.bytes,
    costUsd: WEBSITE_INTELLIGENCE_USD,
  });
}

/** Starts the read and returns immediately. Suggestion enqueue must already have been called. */
export function startWebsiteIntelligence(input: {
  runId: string;
  url: string;
  store: WebsiteIntelligenceStore;
  read?: (url: string) => Promise<WebsiteReadResult>;
}): void {
  const read = input.read ?? (url => readPublicWebsite(url, {
    resolve: resolveWebsiteHost,
    request: productionWebsiteRequest,
  }));
  void readAndStore({ ...input, read }).catch(err => {
    console.warn("[personalization] website_intelligence", {
      code: err instanceof Error ? err.name : "error",
      costUsd: WEBSITE_INTELLIGENCE_USD,
    });
  });
}

/**
 * Runs suggestion enqueue first. The website start is not awaited,
 * so a slow page cannot hold the confirmation response.
 */
export async function scheduleWebsiteIntelligence(input: {
  enqueueSuggestions: () => Promise<void>;
  websiteUrl: string | null;
  start: (url: string) => void;
}): Promise<void> {
  await input.enqueueSuggestions();
  if (input.websiteUrl) input.start(input.websiteUrl);
}
