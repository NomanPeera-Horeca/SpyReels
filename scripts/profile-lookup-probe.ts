/**
 * Live health check of onboarding profile lookups. Runs the exact production
 * lookup (lookupPublicProfile + productionLookupDeps) for a fixed list of real
 * public accounts on Instagram, TikTok and YouTube, sequentially, and prints
 * one line per account plus a per-platform summary.
 *
 * Read-only: no database, no avatar or thumbnail mirroring. Needs
 * SCRAPECREATORS_API_KEY. Each lookup costs a few provider credits.
 *
 *   pnpm exec tsx scripts/profile-lookup-probe.ts [--only=instagram]
 */
import type { SocialPlatform } from "../shared/personalization/model";
import { lookupPublicProfile } from "../server/personalization/onboarding/profileLookup";
import { productionLookupDeps } from "../server/personalization/onboarding/profileLookupDeps";

const ACCOUNTS: Record<SocialPlatform, string[]> = {
  instagram: [
    // large brands and creators
    "instagram", "natgeo", "nasa", "nike", "starbucks", "cristiano", "garyvee", "hormozi", "mkbhd", "tasty",
    "gordongram", "humansofny", "bonappetitmag",
    // real SpyReels onboarding accounts (succeeded before)
    "noman_peera", "danielg", "greglav", "justyn.ai", "portuguesconkaique",
    // failed today, plus spelling variants of the first one
    "sistamedia.agency", "hanzalah_web__creator", "hanzalah_web_creator", "hanzalah.web.creator",
  ],
  tiktok: [
    "khaby.lame", "charlidamelio", "mrbeast", "nike", "nba", "gordonramsayofficial", "garyvee", "zachking",
    "tiktok", "noman_peera",
  ],
  youtube: [
    "@MrBeast", "@mkbhd", "@veritasium", "@GordonRamsay", "@NASA", "@garyvee", "@TED", "@kurzgesagt",
    "@LinusTechTips", "@AlexHormozi",
  ],
};

async function main() {
  if (!process.env.SCRAPECREATORS_API_KEY) throw new Error("SCRAPECREATORS_API_KEY is not set.");
  const onlyFlag = process.argv.find(a => a.startsWith("--only="))?.slice(7);
  // PROBE_HANDLES="instagram:a,b;tiktok:c" checks just those accounts instead of the fixed list.
  const custom = (process.env.PROBE_HANDLES ?? "").trim();
  if (custom) {
    for (const p of Object.keys(ACCOUNTS) as SocialPlatform[]) ACCOUNTS[p] = [];
    for (const part of custom.split(";")) {
      const [p, list] = part.split(":");
      if (p && list && p.trim() in ACCOUNTS) {
        ACCOUNTS[p.trim() as SocialPlatform] = list.split(",").map(h => h.trim()).filter(Boolean);
      }
    }
  }
  const platforms = (Object.keys(ACCOUNTS) as SocialPlatform[]).filter(
    p => (!onlyFlag || p === onlyFlag) && ACCOUNTS[p].length > 0
  );
  // No mirroring: the probe must not write to storage.
  const deps = { ...productionLookupDeps(), mirrorAvatar: async (_h: string, url: string) => url, mirrorThumbnails: async <T,>(items: T[]) => items };
  const summary: Record<string, { ok: number; total: number; reasons: Record<string, number>; ms: number[] }> = {};
  let user = 900_000;
  for (const platform of platforms) {
    const s = (summary[platform] = { ok: 0, total: 0, reasons: {}, ms: [] });
    for (const handle of ACCOUNTS[platform]) {
      const started = Date.now();
      let line: Record<string, unknown>;
      try {
        // A fresh user id per lookup keeps the per-user hourly limit out of the test.
        const r = await lookupPublicProfile({ userId: ++user, platform, handle, deps: deps as never });
        const ms = Date.now() - started;
        s.ms.push(ms);
        if (r.ok) {
          s.ok += 1;
          line = { platform, handle, ok: true, ms, username: r.profile.handle, followers: r.profile.followerCount, posts: r.profile.recentPosts?.length ?? 0, private: r.profile.isPrivate ?? false };
        } else {
          s.reasons[r.reason] = (s.reasons[r.reason] ?? 0) + 1;
          line = { platform, handle, ok: false, ms, reason: r.reason };
        }
      } catch (err) {
        const ms = Date.now() - started;
        s.ms.push(ms);
        s.reasons.threw = (s.reasons.threw ?? 0) + 1;
        line = { platform, handle, ok: false, ms, reason: "threw", message: err instanceof Error ? err.message.slice(0, 160) : String(err) };
      }
      s.total += 1;
      console.log(`PROBE ${JSON.stringify(line)}`);
    }
  }
  for (const [platform, s] of Object.entries(summary)) {
    const sorted = [...s.ms].sort((a, b) => a - b);
    console.log(`SUMMARY ${JSON.stringify({ platform, ok: s.ok, total: s.total, failures: s.reasons, medianMs: sorted[Math.floor(sorted.length / 2)] ?? null, maxMs: sorted[sorted.length - 1] ?? null })}`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
