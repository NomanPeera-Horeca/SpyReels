/**
 * Pull US search volumes for Tokscript keyword list via DataForSEO.
 * Uses DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD from env (or HorecaFlow .env.local).
 *
 *   pnpm exec tsx --env-file=.env scripts/pull-tokscript-keyword-volumes.ts
 *   # or with HorecaFlow env:
 *   pnpm exec tsx --env-file=/Users/nomanpeera/horecaflow2.0/horecaflow2.0/.env.local scripts/pull-tokscript-keyword-volumes.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LOGIN = process.env.DATAFORSEO_LOGIN || "";
const PASSWORD = process.env.DATAFORSEO_PASSWORD || "";
const AUTH = Buffer.from(`${LOGIN}:${PASSWORD}`).toString("base64");
const LOCATION_CODE = 2840;
const LANGUAGE_CODE = "en";
const OUT = join(process.cwd(), "docs/tokscript-keyword-volumes.json");
const RAW = join(process.cwd(), "docs/_tokscript_kw_raw.txt");

async function dfsPost(path: string, body: unknown[]): Promise<any> {
  const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${AUTH}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || (json.status_code && json.status_code >= 40000)) {
    throw new Error(`DataForSEO ${path}: ${json.status_message || res.statusText}`);
  }
  return json;
}

function classify(kw: string): { coverage: string; note: string } {
  const k = kw.toLowerCase();
  if (
    /\b(tokscript|tokaudit|talkscript|transcriptik|claptools|submagic|kapwing|elevenlabs|kome|gettranscribe|get.?transcribe|ytscribe|youtranscripts|transcription 24|tiktokenizer|kkscript|getscript|transcript\.?com)\b/.test(
      k
    )
  ) {
    return { coverage: "SKIP", note: "competitor brand / navigational" };
  }
  if (
    /ripper|story downloader|caption copy|caption download|can you text on tiktok|how to generate tiktok link/.test(
      k
    )
  ) {
    return { coverage: "SKIP", note: "wrong intent (download/abuse/unrelated)" };
  }
  if (/extract audio|audio from tiktok|translator|translate tiktok|summarizer/.test(k)) {
    return { coverage: "SKIP", note: "audio extract / translate / summarize (not our core)" };
  }
  if (
    /script converter|script copy|script extract$|link to script|url to transcript|link to transcript|transcript link|download transcript$|transcript downloader$|transcript extractor$|transcript generator$/.test(
      k
    )
  ) {
    return { coverage: "PARTIAL", note: "generic; absorb in existing tool FAQs" };
  }
  if (
    /tik\s*tok.*(transcript|transcribe|to text|to transcript|speech to text|subtitle|caption)/.test(k) ||
    /(transcript|transcribe).*(tik\s*tok)/.test(k)
  ) {
    return { coverage: "HAVE", note: "/free-tools/tiktok-transcript-generator" };
  }
  if (
    /tik\s*tok.*(script generator|video script|to script|script writer|script extractor|script downloader|ai tiktok script)/.test(
      k
    ) ||
    /(script tiktok|tiktok video script)/.test(k)
  ) {
    return {
      coverage: "HAVE",
      note: "/free-tools/tiktok-script-generator (writing) — distinct from transcript",
    };
  }
  if (
    /tik\s*tok.*(extractor|converter|copier|to text converter)/.test(k) &&
    !/transcript|script/.test(k)
  ) {
    return { coverage: "PARTIAL", note: "vague converter; map to transcript tool" };
  }
  if (
    /(instagram|ig|reels?).*(transcript|to text|to transcript|transcribe)/.test(k) ||
    /(transcript|transcribe).*(instagram|ig|reels?)/.test(k)
  ) {
    return { coverage: "HAVE", note: "/free-tools/instagram-transcript-generator" };
  }
  if (
    /instagram script(?! generator)|instagram script downloader|instagram script writer|script for instagram reels|instagram script$/.test(
      k
    )
  ) {
    return {
      coverage: "HAVE",
      note: "/free-tools/instagram-reels-script-generator (+ transcript if extract intent)",
    };
  }
  if (/instagram script generator/.test(k)) {
    return { coverage: "HAVE", note: "/free-tools/instagram-reels-script-generator" };
  }
  if (
    /youtube shorts.*(transcript|transcribe|to transcript)/.test(k) ||
    /(transcript|transcribe).*(youtube short)/.test(k) ||
    /youtube short transcript|transcribe youtube short/.test(k)
  ) {
    return { coverage: "HAVE", note: "/free-tools/youtube-shorts-transcript" };
  }
  if (
    /youtube.*(transcript|transcribe|transcription)/.test(k) ||
    /(transcript|transcribe).*(youtube|yt)\b/.test(k)
  ) {
    return { coverage: "HAVE", note: "/free-tools/youtube-transcript-generator" };
  }
  if (/script youtube|youtube.*script generator/.test(k)) {
    return { coverage: "PARTIAL", note: "YouTube script writing page not shipped (Phase 2)" };
  }
  if (/how to extract transcript from video|transcribe video link/.test(k)) {
    return { coverage: "PARTIAL", note: "generic how-to; one guide or FAQ on tools" };
  }
  if (/get the script/.test(k)) {
    return { coverage: "PARTIAL", note: "brand-ish / tool; competitor GetTheScript" };
  }
  if (/reels transcript|reel transcript/.test(k)) {
    return { coverage: "HAVE", note: "/free-tools/instagram-transcript-generator" };
  }
  return { coverage: "GAP", note: "no clear SpyReels page" };
}

async function main() {
  if (!LOGIN || !PASSWORD) {
    throw new Error("Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD");
  }
  if (!existsSync(RAW)) {
    throw new Error(`Missing ${RAW}`);
  }
  const kws = [
    ...new Set(
      readFileSync(RAW, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim().toLowerCase().replace(/\s+/g, " "))
        .filter(Boolean)
    ),
  ];
  console.log(`keywords=${kws.length}`);

  const volJson = await dfsPost("keywords_data/google_ads/search_volume/live", [
    { keywords: kws, location_code: LOCATION_CODE, language_code: LANGUAGE_CODE },
  ]);
  console.log(`ads cost≈$${volJson.cost ?? "?"} status=${volJson.status_code}`);
  const by: Record<string, any> = {};
  for (const r of volJson.tasks?.[0]?.result || []) {
    const kw = String(r.keyword || "").toLowerCase();
    by[kw] = {
      ads_volume: r.search_volume ?? null,
      cpc: r.cpc ?? null,
      competition: r.competition ?? null,
    };
  }

  const ovJson = await dfsPost("dataforseo_labs/google/keyword_overview/live", [
    { keywords: kws, location_code: LOCATION_CODE, language_code: LANGUAGE_CODE },
  ]);
  console.log(`labs cost≈$${ovJson.cost ?? "?"} status=${ovJson.status_code}`);
  let items: any[] = [];
  for (const block of ovJson.tasks?.[0]?.result || []) {
    if (block?.items) {
      items = block.items;
      break;
    }
    if (block?.keyword) items.push(block);
  }
  for (const item of items) {
    const kw = String(item.keyword || "").toLowerCase();
    const info = item.keyword_info || {};
    const props = item.keyword_properties || {};
    const intent = item.search_intent_info || {};
    by[kw] = {
      ...(by[kw] || {}),
      labs_volume: info.search_volume ?? null,
      kd: props.keyword_difficulty ?? null,
      intent: intent.main_intent ?? null,
    };
  }

  const out = kws.map((keyword) => {
    const d = by[keyword] || {};
    const volume =
      typeof d.ads_volume === "number"
        ? d.ads_volume
        : typeof d.labs_volume === "number"
          ? d.labs_volume
          : 0;
    const { coverage, note } = classify(keyword);
    return {
      keyword,
      ads_volume: d.ads_volume ?? null,
      labs_volume: d.labs_volume ?? null,
      kd: d.kd ?? null,
      intent: d.intent ?? null,
      cpc: d.cpc ?? null,
      volume,
      coverage,
      note,
    };
  });

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`wrote ${OUT}`);

  const buckets = ["HAVE", "PARTIAL", "GAP", "SKIP"] as const;
  for (const b of buckets) {
    const rows = out.filter((r) => r.coverage === b);
    const vol = rows.reduce((s, r) => s + (r.volume || 0), 0);
    console.log(`${b}: ${rows.length} kws | ${vol} vol`);
  }

  console.log("\nTOP 40");
  for (const r of [...out].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 40)) {
    console.log(`${String(r.volume).padStart(6)} | ${r.coverage.padEnd(7)} | ${r.keyword}`);
  }

  console.log("\nPARTIAL/GAP vol>=50");
  for (const r of [...out]
    .filter((x) => (x.coverage === "PARTIAL" || x.coverage === "GAP") && (x.volume || 0) >= 50)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))) {
    console.log(`${String(r.volume).padStart(6)} | ${r.coverage.padEnd(7)} | ${r.keyword} | ${r.note}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
