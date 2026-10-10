/**
 * SEO contract extractor for public-web regression baselines.
 * Normalized, stable JSON compared in CI.
 */

export type SeoContract = {
  path: string;
  status: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  googlebot: string | null;
  verification: {
    google: string | null;
  };
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  h1: string | null;
  hreflang: Array<{ lang: string; href: string }>;
  jsonLd: unknown[];
};

/** Headers that make CI/local Next emit production indexing (index, follow). */
export const SEO_INDEXING_REQUEST_HEADERS = {
  "x-forwarded-host": "spyreels.ai",
} as const;

const SITE_ORIGIN = "https://spyreels.ai";

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function attrMap(tagAttrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tagAttrs))) {
    out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return out;
}

/** Deep-sort object keys / array order for stable JSON diffs. */
export function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = normalizeJson(record[key]);
    }
    return sorted;
  }
  return value;
}

function extractMeta(html: string): {
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  googlebot: string | null;
  googleVerification: string | null;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  hreflang: Array<{ lang: string; href: string }>;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : null;

  const metas: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\s+([^>]+?)\/?>/gi)) {
    const attrs = attrMap(match[1]);
    const key = (attrs.name || attrs.property || attrs.itemprop || "").toLowerCase();
    if (key && "content" in attrs) metas[key] = decodeHtmlEntities(attrs.content);
  }

  let canonical: string | null = null;
  const hreflang: Array<{ lang: string; href: string }> = [];
  for (const match of html.matchAll(/<link\s+([^>]+?)\/?>/gi)) {
    const attrs = attrMap(match[1]);
    const rel = (attrs.rel || "").toLowerCase();
    if (rel.split(/\s+/).includes("canonical") && attrs.href) {
      canonical = decodeHtmlEntities(attrs.href);
    }
    if (rel.split(/\s+/).includes("alternate") && attrs.hreflang && attrs.href) {
      hreflang.push({
        lang: decodeHtmlEntities(attrs.hreflang),
        href: decodeHtmlEntities(attrs.href),
      });
    }
  }
  hreflang.sort((a, b) => a.lang.localeCompare(b.lang) || a.href.localeCompare(b.href));

  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  for (const [key, value] of Object.entries(metas)) {
    if (key.startsWith("og:")) openGraph[key.slice(3)] = value;
    if (key.startsWith("twitter:")) twitter[key.slice(8)] = value;
  }

  return {
    title,
    description: metas.description ?? null,
    canonical,
    robots: metas.robots ?? null,
    googlebot: metas.googlebot ?? null,
    googleVerification: metas["google-site-verification"] ?? null,
    openGraph: Object.fromEntries(Object.entries(openGraph).sort(([a], [b]) => a.localeCompare(b))),
    twitter: Object.fromEntries(Object.entries(twitter).sort(([a], [b]) => a.localeCompare(b))),
    hreflang,
  };
}

function extractH1(html: string): string | null {
  // Prefer first H1 not inside a [hidden] / aria-hidden="true" block.
  for (const match of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const before = html.slice(Math.max(0, match.index! - 400), match.index!);
    const inHidden =
      /id=["']seo-crawler-snapshot["'][^>]*>[\s\S]*$/i.test(before) ||
      /hidden(?:\s|=|>|\/)/i.test(before.slice(-120)) ||
      /aria-hidden=["']true["'][\s\S]*$/i.test(before.slice(-200));
    if (inHidden) continue;
    const text = stripTags(match[1]);
    if (text) return text;
  }
  // Fallback: crawler snapshot (Vite SSR shell).
  const snap = html.match(
    /id=["']seo-crawler-snapshot["'][^>]*>[\s\S]*?<h1\b[^>]*>([\s\S]*?)<\/h1>/i
  );
  if (snap) {
    const text = stripTags(snap[1]);
    if (text) return text;
  }
  return null;
}

function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      blocks.push(normalizeJson(JSON.parse(raw)));
    } catch {
      blocks.push({ __parseError: true, raw });
    }
  }
  // Stable order by @type then JSON string.
  return blocks.sort((a, b) => {
    const ta =
      a && typeof a === "object" && !Array.isArray(a)
        ? String((a as Record<string, unknown>)["@type"] ?? "")
        : "";
    const tb =
      b && typeof b === "object" && !Array.isArray(b)
        ? String((b as Record<string, unknown>)["@type"] ?? "")
        : "";
    return ta.localeCompare(tb) || JSON.stringify(a).localeCompare(JSON.stringify(b));
  });
}

export function extractSeoContract(html: string, path: string, status: number): SeoContract {
  const meta = extractMeta(html);
  return {
    path,
    status,
    title: meta.title,
    description: meta.description,
    canonical: meta.canonical,
    robots: meta.robots,
    googlebot: meta.googlebot,
    verification: {
      google: meta.googleVerification,
    },
    openGraph: meta.openGraph,
    twitter: meta.twitter,
    h1: extractH1(html),
    hreflang: meta.hreflang,
    jsonLd: extractJsonLd(html),
  };
}

/** Canonical must be absolute spyreels.ai URL for this path. */
export function canonicalMatchesPath(canonical: string | null, path: string): boolean {
  if (!canonical) return false;
  try {
    const url = new URL(canonical);
    const expected = new URL(path === "/" ? "/" : path, SITE_ORIGIN);
    return (
      url.origin === SITE_ORIGIN &&
      url.pathname.replace(/\/$/, "") === expected.pathname.replace(/\/$/, "") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) =>
    decodeHtmlEntities(m[1].trim())
  );
}

export function sitemapContainsPath(locs: string[], path: string): boolean {
  const target = new URL(path === "/" ? "/" : path, SITE_ORIGIN).href.replace(/\/$/, "");
  return locs.some((loc) => loc.replace(/\/$/, "") === target);
}

export { SITE_ORIGIN };
