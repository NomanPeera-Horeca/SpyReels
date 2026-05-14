# SpyReels Admin Panel — Cursor Prompt Series (Phase 3 / SEO Hub)

Phase 3 builds the **SEO Hub** tab: one top-level tab, **six sub-sections** (01 Site Health → 06 Sitemap / IndexNow). PRD: `docs/build-spec/spyreels-admin-prd-scope-c.md` + `spyreels-admin-prd-v4-consolidated.md`. Mockup: `docs/build-spec/spyreels-admin-mockup-v4.html`.

Repo root: `~/Desktop/reels-dashboard`.

---

## Prompt 1 — Phase 3 migrations (Scope C)

Add Drizzle SQL + `drizzle/schema.ts` for: `seo_health_snapshots`, `gsc_daily_metrics`, `bing_daily_metrics`, `ai_mention_prompts`, `ai_mention_runs`, `bot_crawl_log`, `sitemap_submissions`. Include indexes for time-range queries (snapshot/metric dates, `bot_crawl_log.botFamily` + `createdAt`, foreign key from `ai_mention_runs.promptId` → `ai_mention_prompts.id`).

---

## Prompt 2 — Bot crawl middleware

Add Express (or framework) middleware that classifies known SEO/AI bot User-Agents and INSERTs lightweight rows into `bot_crawl_log` (bot family key, truncated UA, path, method). Avoid logging authenticated admin HTML or static assets if that would be noisy — tune allow/deny list per PRD.

---

## Prompt 3 — Site Health cron + UI (01)

Daily job (4 AM UTC): run PageSpeed (or stub), schema/CWV/SSL/indexability checks, write `seo_health_snapshots` with **today’s recommended action**. Build `/admin/seo/health`: five status cards + callout. Surface `GOOGLE_PAGESPEED_API_KEY` in `.env.example` when wired.

---

## Prompt 4 — GSC OAuth + daily sync + UI (02)

Implement GSC OAuth token storage (refresh token in env or DB secret table — follow consolidated §5). Daily sync → `gsc_daily_metrics`. UI: connected badge, four tiles, top queries table with **Reddit strategy** row highlight heuristic.

---

## Prompt 5 — Bing Webmaster + UI (03)

Daily sync → `bing_daily_metrics`. UI mirrors GSC with purple **ChatGPT-via-Bing** callout. `BING_WEBMASTER_API_KEY`, `BING_SITE_URL`.

---

## Prompt 6 — AI Mentions weekly runner + UI (04)

Seed ~10 rows in `ai_mention_prompts`. Weekly cron (Sunday 3 AM UTC): call ChatGPT / Perplexity / Gemini per prompt; persist `ai_mention_runs` (full text + optional parsed score). UI: three engine summary cards, competitor table (SpyReels **#3** placement per design), per-prompt ✓/✕ grid.

---

## Prompt 7 — Bot Crawl + Sitemap UI (05–06)

**Bots:** 30-day bar chart by bot family; stale badges for Google-Extended / Applebot-Extended (14+ days). Link to Sitemap. **Sitemap:** rows for GSC, Bing, IndexNow; manual re-submit actions; log rows in `sitemap_submissions`. Wire blog publish (Tab 2) → IndexNow ping when `INDEXNOW_API_KEY` is set.

---

## Prompt 8 — Mobile pass & env docs

Responsive pass for all six SEO sub-routes at 640 / 700 / 900 px. Update `.env.example` with all Phase 3 keys from consolidated §5. Smoke-test cron idempotency and webhook-less flows in dev.
