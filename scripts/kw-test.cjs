/**
 * TEMPORARY: compare ScrapeCreators v2 keyword search with vs without space-stripping.
 * Delete after review.
 *
 * Run from repo root:
 *   node scripts/kw-test.cjs
 *
 * Requires SCRAPECREATORS_API_KEY in .env
 */

require("dotenv").config();

const API_BASE = "https://api.scrapecreators.com";
const SEARCH_PATH = "/v2/instagram/reels/search";
const MAX_RESULTS = 10;
const FETCH_MS = 30_000;

const PHRASES = [
  "deadlift tips",
  "deadlift form",
  "fat loss mistakes",
  "beginner gym workout",
];

/** Mirrors server/instagram.ts searchReelsByKeyword cleaning. */
function cleanQueryProduction(keyword) {
  return keyword.replace(/[#@]/g, "").trim().toLowerCase().replace(/\s+/g, "");
}

/** Same except spaces preserved (single-spaced). */
function cleanQueryPreserveSpaces(keyword) {
  return keyword.replace(/[#@]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function requireApiKey() {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) {
    throw new Error("SCRAPECREATORS_API_KEY is not set in .env");
  }
  return key;
}

function parseItem(raw) {
  if (!raw?.shortcode) return null;
  const owner = raw.owner || {};
  const caption =
    typeof raw.caption === "string"
      ? raw.caption
      : raw.caption?.text || "";
  return {
    shortcode: raw.shortcode,
    caption,
    username: owner.username || "",
    followers: owner.follower_count ?? 0,
    views: raw.video_play_count ?? raw.video_view_count ?? 0,
  };
}

async function fetchSearchPage(query) {
  const apiKey = requireApiKey();
  const url = new URL(`${API_BASE}${SEARCH_PATH}`);
  url.searchParams.set("query", query);
  url.searchParams.set("page", "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    if (text?.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 500) };
      }
    }
    return { status: res.status, data, url: url.toString() };
  } finally {
    clearTimeout(timer);
  }
}

async function searchKeyword(label, rawPhrase, querySent) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${label}`);
  console.log(`  input phrase: "${rawPhrase}"`);
  console.log(`  query param:  "${querySent}"`);
  console.log(`${"=".repeat(72)}`);

  const { status, data, url } = await fetchSearchPage(querySent);
  console.log(`  HTTP ${status}  ${url}`);

  if (status !== 200) {
    console.log(`  ERROR body: ${JSON.stringify(data)?.slice(0, 400)}`);
    return [];
  }

  const reels = Array.isArray(data?.reels) ? data.reels : [];
  console.log(`  reels returned on page 1: ${reels.length}`);

  const parsed = [];
  const seen = new Set();
  for (const raw of reels) {
    const item = parseItem(raw);
    if (!item || seen.has(item.shortcode)) continue;
    seen.add(item.shortcode);
    parsed.push(item);
    if (parsed.length >= MAX_RESULTS) break;
  }

  if (parsed.length === 0) {
    console.log("  (no parseable reels)");
    return parsed;
  }

  parsed.forEach((r, i) => {
    const cap = r.caption.replace(/\s+/g, " ").trim().slice(0, 100);
    console.log(
      `  ${String(i + 1).padStart(2)}. @${r.username.padEnd(20)} followers=${String(r.followers).padStart(8)} views=${String(r.views).padStart(10)}`
    );
    console.log(`      caption: ${cap || "(empty)"}`);
  });

  return parsed;
}

function summarizeDiff(stripped, spaced, phrase) {
  const sSet = new Set(stripped.map((r) => r.shortcode));
  const pSet = new Set(spaced.map((r) => r.shortcode));
  const onlyStripped = stripped.filter((r) => !pSet.has(r.shortcode)).length;
  const onlySpaced = spaced.filter((r) => !sSet.has(r.shortcode)).length;
  const overlap = stripped.filter((r) => pSet.has(r.shortcode)).length;
  console.log(`\n  --- diff for "${phrase}" ---`);
  console.log(`  overlap (same shortcode in top ${MAX_RESULTS}): ${overlap}`);
  console.log(`  only in STRIPPED: ${onlyStripped}`);
  console.log(`  only in SPACED:   ${onlySpaced}`);
  if (overlap === Math.min(stripped.length, spaced.length) && stripped.length === spaced.length) {
    console.log(`  verdict: identical top-${MAX_RESULTS} sets`);
  } else if (overlap === 0 && stripped.length > 0 && spaced.length > 0) {
    console.log(`  verdict: completely different result sets`);
  } else {
    console.log(`  verdict: partial overlap`);
  }
}

async function main() {
  console.log("ScrapeCreators v2 keyword search A/B: production strip vs preserve spaces");
  console.log(`API: ${API_BASE}${SEARCH_PATH}`);
  console.log(`max results per mode: ${MAX_RESULTS}`);

  for (const phrase of PHRASES) {
    const stripped = cleanQueryProduction(phrase);
    const spaced = cleanQueryPreserveSpaces(phrase);

    const resultsStripped = await searchKeyword(
      "MODE A: production (spaces removed)",
      phrase,
      stripped
    );
    await new Promise((r) => setTimeout(r, 1500));

    const resultsSpaced = await searchKeyword(
      "MODE B: spaces preserved",
      phrase,
      spaced
    );

    summarizeDiff(resultsStripped, resultsSpaced, phrase);
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
