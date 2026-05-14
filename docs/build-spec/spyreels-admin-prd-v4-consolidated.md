# SpyReels Admin Panel — v4 Full PRD (Consolidated)

**Version:** 4 (Final, locked design)
**Build window:** Across 3 phases over 2-3 weeks post-launch
**Total estimated effort:** 45-60 hours
**Visual reference:** `spyreels-admin-mockup-v4.html`

---

## 1. Overview

The SpyReels Admin Panel is a single-page application at `/admin` that replaces Noman's daily multi-tool workflow with one interface. Six tabs, all using the same Xero-style design language: light backgrounds, soft pastels, rounded cards, mobile-first responsive layout.

### The 6 tabs

| # | Tab | Purpose | Build phase |
|---|---|---|---|
| 1 | Traffic | Daily overnight check: visitors, signups, channel attribution, niche/creator popularity | Phase 1 (Scope A) |
| 2 | Blog Studio | Generate blogs end-to-end via Ubersuggest → Claude → DALL-E → publish | Phase 1 (Scope A) |
| 3 | Creators | Add featured creators, approve scrapes, retry failures, manage live library | Phase 1 (Scope A) |
| 4 | Emails | Resend webhook data: deliverability, per-template stats, bounce list | Phase 2 (Scope B) |
| 5 | Users | Plan distribution, consumption, churn, per-user drill-down | Phase 2 (Scope B) |
| 6 | SEO Hub | 6 sub-tabs: Site Health, GSC, Bing, AI Mentions, Bot Crawl, Sitemap | Phase 3 (Scope C) |

### Authoritative source documents

- **Scope A PRD** (`spyreels-admin-prd-scope-a.md`) — Tabs 1, 2, 3 detailed spec
- **Scope B PRD** (`spyreels-admin-prd-scope-b.md`) — Tabs 4, 5 detailed spec
- **Scope C PRD** (`spyreels-admin-prd-scope-c.md`) — Tab 6 detailed spec
- **This document** — overarching architecture, build order, integration patterns

---

## 2. Shared architecture (applies to all 6 tabs)

### 2.1 Auth & routing

All routes auth-gated by `requireAdmin` middleware. Single admin = `process.env.ADMIN_EMAIL`. Non-admin gets 404, not 403.

```
/admin                          → redirects to /admin/traffic
/admin/traffic                  → Tab 1 (Scope A)
/admin/blogs/*                  → Tab 2 (Scope A)
/admin/creators/*               → Tab 3 (Scope A)
/admin/emails/*                 → Tab 4 (Scope B)
/admin/users/*                  → Tab 5 (Scope B)
/admin/seo/{health,gsc,bing,ai-mentions,bots,sitemap} → Tab 6 (Scope C)
```

### 2.2 Design system

Single CSS file with shared variables. All tabs inherit:

- Color palette: brand (#2E5BFF), green (#00B894), coral (#FF6B6B), amber (#F59E0B), violet (#8B5CF6)
- Typography: Inter (UI), JetBrains Mono (numbers and code)
- Card pattern: white surface, soft shadow, 16px radius
- Pill pattern: small colored badges for status/category
- Mobile breakpoints: 640px (phones), 700px (small tablets), 900px (tablets)

UI primitives reused everywhere: Button, Input, Select, Card, Pill, StatChip, Sparkline, Table, Modal.

### 2.3 Cross-tab integrations

| From | To | Pattern |
|---|---|---|
| Tab 1 AI Insights | Any tab | Insights are clickable and route to relevant tab |
| Tab 1 Most-viewed creators | Tab 3 Live library | Click a creator → opens their detail in Tab 3 |
| Tab 2 Publish action | Tab 6 IndexNow | Publishing a blog auto-pings IndexNow |
| Tab 3 Failed scrape | Tab 5 User detail | If a failed scrape belongs to a paid user, link to their profile |
| Tab 4 Email recipient | Tab 5 User detail | Click recipient email → opens their user profile |
| Tab 5 Per-user view | Tab 4 Email history | User profile shows full email timeline |
| Tab 6 Section 5 (bots) | Tab 6 Section 6 (sitemap) | "Bot hasn't crawled in 14d" → links to sitemap submission |

### 2.4 Data freshness strategy

| Data type | Strategy |
|---|---|
| Real-time (current visitors, latest emails) | Polled via tRPC every 30 seconds when tab is active |
| Daily aggregates (channel breakdown, plan distribution) | Cached 5 min, refresh button forces re-fetch |
| Weekly aggregates (top queries, AI mentions, blog performance) | Cached 1 hour |
| AI Insights | Generated daily 6 AM UTC, displayed until next morning |
| Site Health snapshots | Generated daily 4 AM UTC |
| GSC/Bing sync | Daily 5 AM UTC |
| AI Mentions Tracker | Weekly Sundays 3 AM UTC |
| Bot Crawl log | Real-time (Express middleware writes on every request) |

---

## 3. Database additions summary

Full schemas in Scope A/B/C PRDs. Summary of new tables:

### From Scope A (Phase 1)
- `blog_versions` — version history per blog
- `creator_view_events` — per-creator click tracking
- `niche_view_events` — per-niche click tracking
- `keyword_opportunities` — weekly Ubersuggest pull
- `ai_insights` — daily-generated insight cards
- New columns on `blog_posts`: metaTitle, metaDescription, canonicalUrl, ogImageUrl, noIndex, sourceKeyword, generatedByAi
- New columns on `users`: utmSource, utmMedium, utmCampaign, utmTerm, utmContent, firstReferrer

### From Scope B (Phase 2)
- `email_events` — every Resend webhook event
- `email_templates` — known template metadata
- New column on `users`: isTestAccount

### From Scope C (Phase 3)
- `seo_health_snapshots` — daily site health checks
- `gsc_daily_metrics` — cached GSC data
- `bing_daily_metrics` — cached Bing data
- `ai_mention_runs` — full LLM responses per prompt per engine
- `ai_mention_prompts` — 10 tracked prompts (editable)
- `bot_crawl_log` — every bot User-Agent hit
- `sitemap_submissions` — log of each push to GSC/Bing/IndexNow

**Total: 13 new tables, ~10 column additions across 2 existing tables.**

---

## 4. Build phases & order

### Phase 1: Scope A (Wednesday-Friday, 15-20 hours)

**Day 1 (Wed afternoon, 5-6h):**
1. Auth middleware (`requireAdmin`)
2. Database migrations for Phase 1
3. UTM capture on signup
4. Niche + creator view tracking endpoints
5. Skeleton `/admin` layout with tab nav

**Day 2 (Thu, 6-8h):**
6. Tab 3: Featured Creators (smallest, builds confidence)
7. Tab 1: Traffic Dashboard

**Day 3 (Fri, 5-6h):**
8. Tab 2: Blog Studio
9. AI Insights cron
10. Sunday keyword opportunities cron
11. Mobile responsive pass

**Validation:** Use the admin daily for 3-4 days. Adjust patterns based on real usage before moving to Phase 2.

### Phase 2: Scope B (following Mon-Wed, 10-15 hours)

**Day 4 (5-6h):**
12. Database migrations for Phase 2
13. Resend webhook endpoint + signature verification
14. Update all `resend.emails.send` calls to pass template tags
15. Backfill email templates

**Day 5 (5-6h):**
16. Tab 4: Emails Dashboard
17. Per-template stats sub-view
18. Bounce list

**Day 6 (4-5h):**
19. Tab 5: Users Dashboard
20. User table with filters
21. Per-user detail page
22. Test account auto-classification

### Phase 3: Scope C (Thu-Sat that same week, 20-25 hours)

**Day 7 (4-5h):**
23. Database migrations for Phase 3
24. Bot Crawl middleware (instant data starts)
25. Sitemap submission flow + IndexNow key

**Day 8 (5-6h):**
26. Site Health 5-card checks + cron
27. PageSpeed Insights integration

**Day 9 (4-5h):**
28. GSC OAuth + daily sync + UI
29. Bing API + UI

**Day 10 (5-6h):**
30. AI Mentions: 3 engine integrations + parsing + storage
31. AI Mentions UI

**Day 11 (3-4h):**
32. Bot Crawl UI (chart, table, alert badges)
33. Final mobile pass across all 6 tabs

---

## 5. Key environment variables

```
# Auth
ADMIN_EMAIL=nomanpeera@gmail.com

# Phase 1
UBERSUGGEST_API_KEY=...
OPENAI_API_KEY=...                          # for DALL-E images

# Phase 2
RESEND_WEBHOOK_SECRET=...
RESEND_API_KEY=...                          # already exists

# Phase 3
GOOGLE_SEARCH_CONSOLE_CLIENT_ID=...
GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET=...
GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN=...
GOOGLE_PAGESPEED_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...           # for Gemini AI mentions
BING_WEBMASTER_API_KEY=...
BING_SITE_URL=https://spyreels.ai
PERPLEXITY_API_KEY=...
INDEXNOW_API_KEY=...                        # generate a UUID
```

---

## 6. Cron jobs summary

| Cron | Schedule | What it does |
|---|---|---|
| AI Insights generator | Daily 6 AM UTC | Pulls last 7 days metrics, sends to Claude, caches 3-5 insights |
| Site Health checker | Daily 4 AM UTC | Runs all 5 health checks, INSERT into seo_health_snapshots |
| GSC daily sync | Daily 5 AM UTC | Refreshes GSC data via API |
| Bing daily sync | Daily 5 AM UTC | Same for Bing |
| Sitemap auto-resubmit | Daily 6 AM UTC | Re-submits to GSC + Bing |
| Keyword opportunities | Weekly Sunday 2 AM UTC | Pulls fresh Ubersuggest data |
| AI Mentions runner | Weekly Sunday 3 AM UTC | Runs 10 prompts × 3 engines, ~$0.50/week |
| Stripe reconciliation | Daily 7 AM UTC | Syncs Stripe subscription status to local users table |
| Resend reconciliation | Daily 8 AM UTC | Catches any missed webhook events via GET /emails |

---

## 7. Tab-by-tab summary (full specs in linked PRDs)

### Tab 1 — Traffic
- Greeting + AI Insights card (clickable, routes to other tabs)
- 4 stat cards: visitors, signups, paid customers, affiliate signups
- Channels table with sparklines (UTM-attributed)
- Conversion funnel (5 steps)
- Most viewed niches (with UNDER-SUPPLY flag for niches lacking creators)
- Most viewed creators grid
- Blog performance with DOUBLE DOWN signal

### Tab 2 — Blog Studio
- Keyword opportunities cards (Ubersuggest, weekly refresh)
- AI generation flow: 5-step modal (research → write → image → SEO → ready)
- Draft preview with full editor: cover image (regen via AI prompt), SEO meta box, em-dash scan, internal links count
- Version history (last 5 saved per blog)
- Edit with AI modal
- Publish flow (sets isPublished=true, pings IndexNow, updates sitemap)
- Published list with per-blog analytics

### Tab 3 — Creators
- Add new creator form with auto-classify
- Failed scrapes section (Bug #64 patterns: handle_not_found, account_private, IG session issue)
- Pending approval cards with niche suggestion + thumbnail preview + push live action
- Live library table with re-scrape, change niche, view on site, remove

### Tab 4 — Emails
- Health pulse card (green/amber/red based on bounce rate + webhook freshness)
- 4 stat cards: sent, delivery rate, open rate, click rate
- Per-template performance table with rate bars
- Recent emails table with filter chips (All/Delivered/Opened/Clicked/Bounced)
- Hard bounce list with manual resolve/remove actions

### Tab 5 — Users
- 4 stat cards: total, paid (with MRR), test accounts, churned
- Plan distribution donut chart with clickable segments
- Consumption stats: scripts, scrapes, transcriptions (monthly with sparklines)
- 12-month signups vs paid vs cancellations line chart
- User table with filters, search, per-user actions
- Per-user detail page (`/admin/users/:id`): profile, consumption, email history, activity timeline, admin actions (reset password, mark test, reset limits, force logout, soft delete)
- "Exclude test accounts" toggle (ON by default)

### Tab 6 — SEO Hub (6 sub-sections)

**01 Site Health** — 5 cards: Page Speed, Schema, Core Web Vitals, SSL, Indexability. Today's recommended action.

**02 GSC** — Connected badge, 4 metric tiles, top 10 queries with Reddit strategy hits highlighted.

**03 Bing** — Purple callout explaining ChatGPT-via-Bing connection. Same metric layout as GSC.

**04 AI Mentions Tracker** — Three engine cards (ChatGPT 3/10, Perplexity 5/10, Gemini 2/10). Competitor leaderboard with SpyReels honest at #3 highlighted in violet. 10 tracked prompts with per-engine ✓/✕ checks.

**05 Bot Crawl** — Bar chart of 7 bots' 30-day activity. Google-Extended and Applebot-Extended flagged with stale badges (14+ days). Auto-callout linking to Section 06.

**06 Sitemap** — Three rows (GSC, Bing, IndexNow). Re-submit buttons. Auto-resubmit daily. IndexNow pings instantly on blog publish.

---

## 8. Design choices worth flagging (from your v4 spec)

These were called out in the spec and kept intentionally in v4:

1. **Live pulse dot** in Emails health card — communicates "this dashboard is live" without explaining it
2. **Section numbering 01-06** in SEO Hub — turns weekly check-in into a checklist
3. **Competitor leaderboard puts SpyReels at #3, not #1** — honest, not flattering. Seeing Meedro at #1 every Monday morning is the kick that drives content work
4. **Alert badges on stale bots** — silent killer that would otherwise cost 6 months of lost AI engine visibility before noticing
5. **Section 1 only 5 cards, two yellow** — shows the warning state visually so it's not a hypothetical

---

## 9. Risks summary

| Risk | Mitigation |
|---|---|
| UTM lost across OAuth redirects | sessionStorage (Scope A) |
| Resend webhook delays or duplicates | Daily reconciliation cron (Scope B) |
| GSC OAuth tokens expire | Daily sync keeps token alive (Scope C) |
| AI engines return inconsistent answers | Weekly runs + 4-week rolling averages (Scope C) |
| IndexNow key file lost in redeploy | Commit to repo's static directory (Scope C) |
| Ubersuggest API rate limits | Fall back to Claude estimate, note in UI (Scope A) |
| AI Insights hallucinate numbers | Structured JSON input + explicit "if sparse, say so" prompt (Scope A) |
| Test accounts pollute stats | "Exclude test" toggle ON by default everywhere (Scope B) |
| Cron jobs silently fail | Health-check ping to a monitoring URL after each cron (all phases) |

---

## 10. Definition of done (v4 complete)

When all 3 phases ship, Noman opens `/admin` and within 5 minutes per tab can answer:

**Tab 1 (Monday morning):** What happened overnight? Where are signups coming from? Which niches and creators are users gravitating to?

**Tab 2 (any day):** What blog should I write today? What's the draft AI generated overnight? Should I publish or edit?

**Tab 3 (twice a week):** Which featured creators should I add? Did any scrapes fail? Which niches need more creators?

**Tab 4 (Monday morning):** Did all my emails arrive? Are any templates underperforming? Anyone bouncing?

**Tab 5 (Monday morning):** Who signed up this week? Who churned? Who's at risk of churning? What's MRR?

**Tab 6 (weekly check, Monday):** Is the site healthy? How am I doing in Google? Bing? ChatGPT/Perplexity/Gemini? Which bots are stale?

If all 6 are true, v4 is done and we move from build mode to growth mode.

---

## 11. Total cumulative effort

- Phase 1 (Scope A): 15-20 hours, 3 days
- Phase 2 (Scope B): 10-15 hours, 3 days
- Phase 3 (Scope C): 20-25 hours, 5 days
- **Total: 45-60 hours across 11 build days**

Realistic calendar with sequential build: ~2.5 weeks of focused work, or ~3 weeks part-time.

After v4 ships, the admin panel is **feature-complete for the foreseeable future.** Any further additions should be evaluated at $5K MRR with real user data, not now.
