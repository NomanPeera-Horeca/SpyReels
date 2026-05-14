# SpyReels Admin Panel — Scope A PRD (Phase 1)

**Version:** 4 (aligned with `spyreels-admin-prd-v4-consolidated.md`)  
**Tabs:** 1 Traffic · 2 Blog Studio · 3 Creators  
**Visual reference:** `spyreels-admin-mockup-v4.html`  
**Estimated effort:** 15–20 hours over ~3 build days  

---

## 1. Routes & auth

- All routes behind `requireAdmin` (single admin = `process.env.ADMIN_EMAIL`). Non-admin → **404**.
- Routes in this scope:
  - `/admin` → redirect `/admin/traffic`
  - `/admin/traffic` — Tab 1
  - `/admin/blogs/*` — Tab 2
  - `/admin/creators/*` — Tab 3

Shared layout: tab nav, design tokens (see consolidated §2.2).

---

## 2. Database (Scope A)

| Addition | Purpose |
|----------|---------|
| `blog_versions` | Version history per blog (last N saves) |
| `creator_view_events` | Per-creator click tracking |
| `niche_view_events` | Per-niche click tracking |
| `keyword_opportunities` | Weekly Ubersuggest pull |
| `ai_insights` | Daily-generated insight cards |
| `blog_posts` columns | `metaTitle`, `metaDescription`, `canonicalUrl`, `ogImageUrl`, `noIndex`, `sourceKeyword`, `generatedByAi` |
| `users` columns | `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `firstReferrer` |

Full column types and indexes: implement per consolidated architecture; keep migrations reversible.

---

## 3. Tab 1 — Traffic

**Purpose:** Daily overnight check — visitors, signups, channel attribution, niche/creator popularity.

**UI (summary):**

- Greeting + **AI Insights** card (clickable; routes to relevant tabs per consolidated cross-tab table).
- Four stat cards: visitors, signups, paid customers, affiliate signups.
- Channels table with sparklines (UTM-attributed).
- Conversion funnel (5 steps).
- Most viewed niches — include **UNDER-SUPPLY** flag for niches lacking creators.
- Most viewed creators grid.
- Blog performance with **DOUBLE DOWN** signal.

**Data:** Polled tRPC per consolidated freshness table (real-time vs daily aggregates). UTM must survive OAuth: prefer `sessionStorage` pattern noted in risks.

---

## 4. Tab 2 — Blog Studio

**Purpose:** End-to-end blog pipeline: Ubersuggest → Claude → DALL-E → publish.

**UI (summary):**

- Keyword opportunity cards (weekly Ubersuggest refresh).
- AI generation: **5-step modal** (research → write → image → SEO → ready).
- Draft preview + editor: cover image (regenerate via AI prompt), SEO meta box, em-dash scan, internal links count.
- Version history (e.g. last 5 per blog).
- **Edit with AI** modal.
- Publish: `isPublished=true`, ping **IndexNow**, update sitemap hooks as applicable.
- Published list with per-blog analytics.

**Crons (this scope):** AI Insights daily 6 AM UTC; Keyword opportunities weekly Sunday 2 AM UTC (see consolidated §6).

---

## 5. Tab 3 — Creators

**Purpose:** Featured creators, scrape approvals, failures, live library.

**UI (summary):**

- Add creator form with auto-classify.
- Failed scrapes (Bug #64 patterns: `handle_not_found`, `account_private`, IG session issues).
- Pending approval cards: niche suggestion, thumbnail preview, push live.
- Live library: re-scrape, change niche, view on site, remove.

**Integrations:** Failed scrape for paid user → link to user profile (Tab 5) when Tab 5 exists.

---

## 6. Environment variables (Scope A)

See consolidated §5 — minimum: `ADMIN_EMAIL`, `UBERSUGGEST_API_KEY`, `OPENAI_API_KEY` (DALL-E), plus existing app secrets for auth/DB.

---

## 7. Definition of done (Scope A)

Admin can, within ~5 minutes each:

- **Traffic:** Answer what happened overnight, signup channels, hot niches/creators, blog signals.
- **Blog:** Pick keyword, run pipeline, edit, publish with IndexNow ping.
- **Creators:** Add/approve/manage library and handle failed scrapes.

Mobile responsive pass complete for these three tabs.

---

## 8. Reference

Authoritative cross-phase content: **`spyreels-admin-prd-v4-consolidated.md`**.
