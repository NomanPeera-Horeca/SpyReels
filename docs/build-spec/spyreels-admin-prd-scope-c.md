# SpyReels Admin Panel — Scope C PRD (Phase 3)

**Version:** 4 (aligned with `spyreels-admin-prd-v4-consolidated.md`)  
**Tab:** 6 SEO Hub (6 sub-sections)  
**Visual reference:** `spyreels-admin-mockup-v4.html`  
**Estimated effort:** 20–25 hours over ~5 build days  

---

## 1. Routes & auth

Same `requireAdmin` rules as consolidated §2.1.

Routes in this scope:

- `/admin/seo/health` — Site Health  
- `/admin/seo/gsc` — Google Search Console  
- `/admin/seo/bing` — Bing Webmaster  
- `/admin/seo/ai-mentions` — AI Mentions Tracker  
- `/admin/seo/bots` — Bot Crawl  
- `/admin/seo/sitemap` — Sitemap / IndexNow  

(Exact path segment names may match repo routing; keep consistent with consolidated §2.1.)

---

## 2. Database (Scope C)

| Table | Purpose |
|-------|---------|
| `seo_health_snapshots` | Daily site health check results |
| `gsc_daily_metrics` | Cached GSC data |
| `bing_daily_metrics` | Cached Bing data |
| `ai_mention_runs` | Full LLM responses per prompt per engine |
| `ai_mention_prompts` | ~10 tracked prompts (editable) |
| `bot_crawl_log` | Bot User-Agent hits (middleware) |
| `sitemap_submissions` | Log of GSC/Bing/IndexNow submissions |

---

## 3. Sub-tab summaries (from v4 design)

### 01 — Site Health

Five cards: Page Speed, Schema, Core Web Vitals, SSL, Indexability. **Today’s recommended action** callout. Cron: daily 4 AM UTC (consolidated §6).

### 02 — GSC

Connected badge; four metric tiles; top 10 queries with **Reddit strategy** hits highlighted.

### 03 — Bing

Purple callout (ChatGPT-via-Bing); metric layout aligned with GSC.

### 04 — AI Mentions Tracker

Three engine cards (scores per spec); competitor leaderboard with **SpyReels at #3** (honest placement); 10 prompts with per-engine ✓/✕. Weekly cron Sunday 3 AM UTC.

### 05 — Bot Crawl

Bar chart: 7 bots, 30-day activity. **Stale badges** for Google-Extended / Applebot-Extended (14+ days no crawl). Link to Sitemap section.

### 06 — Sitemap

Rows: GSC, Bing, IndexNow — re-submit actions; daily auto-resubmit; IndexNow ping on blog publish (Tab 2 integration).

---

## 4. Middleware & infra

- **Bot crawl middleware:** log every qualifying bot hit to `bot_crawl_log` (real-time).
- **IndexNow:** key persisted per ops runbook; avoid deploy loss (consolidated risk).

---

## 5. Environment variables (Scope C)

GSC OAuth client/secret/refresh token, PageSpeed API key, Gemini (AI mentions), Bing Webmaster API key, `BING_SITE_URL`, Perplexity API key, `INDEXNOW_API_KEY` — see consolidated §5.

---

## 6. Definition of done (Scope C)

Weekly Monday check: site health, Google, Bing, AI engines, stale bots, sitemap/IndexNow state — all answerable within the SEO Hub without leaving `/admin`.

Final **mobile pass** across all six tabs (including A/B from prior phases).

---

## 7. Reference

Authoritative cross-phase content: **`spyreels-admin-prd-v4-consolidated.md`**.
