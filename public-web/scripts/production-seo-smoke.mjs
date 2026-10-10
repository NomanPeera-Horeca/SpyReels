#!/usr/bin/env node
/**
 * Production SEO smoke: every URL in the live sitemap, browser + Googlebot.
 * Exit 1 on any failure (CI marks the run red).
 *
 *   node scripts/production-seo-smoke.mjs
 *   SEO_SITEMAP_URL=https://spyreels.ai/sitemap.xml node scripts/production-seo-smoke.mjs
 */

const SITEMAP_URL = process.env.SEO_SITEMAP_URL || "https://spyreels.ai/sitemap.xml";
const ORIGIN = "https://spyreels.ai";

const UA = {
  browser:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

function decode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decode(m[1].trim()));
}

function metaContent(html, name) {
  const re = new RegExp(
    `<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']|<meta\\s+[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`,
    "i"
  );
  const m = html.match(re);
  return m ? decode(m[1] || m[2] || "") : null;
}

function canonical(html) {
  const m =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return m ? decode(m[1]) : null;
}

function normalizeUrl(url) {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  let path = u.pathname.replace(/\/$/, "") || "/";
  return `${u.origin}${path === "/" ? "/" : path}`;
}

function isIndexFollow(value) {
  if (!value) return false;
  const v = value.toLowerCase();
  return v.includes("index") && !v.includes("noindex") && v.includes("follow") && !v.includes("nofollow");
}

async function fetchPage(url, uaLabel) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": UA[uaLabel],
    },
    redirect: "follow",
  });
  const headers = Object.fromEntries(response.headers.entries());
  const html = await response.text();
  return { status: response.status, headers, html, finalUrl: response.url };
}

function checkPage(url, uaLabel, result) {
  const failures = [];
  const path = new URL(url).pathname || "/";
  const label = `${path} [${uaLabel}]`;

  if (result.status !== 200) {
    failures.push(`${label}: status ${result.status} (want 200)`);
    return failures;
  }

  const robots = metaContent(result.html, "robots");
  const googlebot = metaContent(result.html, "googlebot");
  const xRobots = result.headers["x-robots-tag"] || null;
  const can = canonical(result.html);

  if (!isIndexFollow(robots)) {
    failures.push(`${label}: meta robots="${robots}" (want index, follow)`);
  }
  // googlebot meta is optional on Vite pages; when present it must allow indexing
  if (googlebot && !isIndexFollow(googlebot)) {
    failures.push(`${label}: meta googlebot="${googlebot}" (want index, follow)`);
  }
  if (xRobots && /noindex/i.test(xRobots)) {
    failures.push(`${label}: X-Robots-Tag="${xRobots}" contains noindex`);
  }
  if (!can) {
    failures.push(`${label}: missing canonical`);
  } else if (normalizeUrl(can) !== normalizeUrl(url)) {
    failures.push(`${label}: canonical "${can}" != self "${url}"`);
  }

  return failures;
}

async function main() {
  console.log(`Fetching sitemap: ${SITEMAP_URL}`);
  const sitemapRes = await fetch(SITEMAP_URL, {
    headers: { "user-agent": UA.browser, accept: "application/xml,text/xml,*/*" },
  });
  if (!sitemapRes.ok) {
    console.error(`Sitemap fetch failed: ${sitemapRes.status}`);
    process.exit(1);
  }
  const locs = parseSitemapLocs(await sitemapRes.text()).filter((loc) =>
    loc.startsWith(ORIGIN)
  );
  console.log(`URLs in sitemap (${ORIGIN}): ${locs.length}`);
  if (locs.length < 1) {
    console.error("No sitemap URLs found");
    process.exit(1);
  }

  const failures = [];
  for (const url of locs) {
    for (const uaLabel of ["browser", "googlebot"]) {
      try {
        const result = await fetchPage(url, uaLabel);
        failures.push(...checkPage(url, uaLabel, result));
        process.stdout.write(".");
      } catch (err) {
        failures.push(`${url} [${uaLabel}]: fetch error ${err?.message || err}`);
        process.stdout.write("E");
      }
    }
  }
  process.stdout.write("\n");

  if (failures.length) {
    console.error("\nPRODUCTION SEO SMOKE FAILED:\n");
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`\n${failures.length} failure(s) across ${locs.length} URL(s).`);
    process.exit(1);
  }

  console.log(`OK: ${locs.length} URLs × 2 user-agents passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
