# Cursor prompts — Admin Panel Phase 1 (Scope A)

Use with repo root `~/Desktop/reels-dashboard`. PRD: `docs/build-spec/spyreels-admin-prd-scope-a.md` + `spyreels-admin-prd-v4-consolidated.md`. Mockup: `docs/build-spec/spyreels-admin-mockup-v4.html`.

---

## Prompt 1 — Admin gate & shell

Implement admin routing per Scope A: `requireAdmin` middleware using `process.env.ADMIN_EMAIL`; non-admin must get **404** for `/admin/*`. Add `/admin` redirect to `/admin/traffic`. Scaffold a shared admin layout (tab nav for Traffic, Blog Studio, Creators) matching design tokens in the consolidated PRD (Inter, JetBrains Mono, card/pill patterns). Client routes should align with the existing React Router / Vite app structure.

---

## Prompt 2 — Phase 1 migrations & UTM

Add Drizzle migrations for Scope A tables/columns: `blog_versions`, `creator_view_events`, `niche_view_events`, `keyword_opportunities`, `ai_insights`, and new columns on `blog_posts` and `users` (UTM + firstReferrer). Implement UTM capture on signup with `sessionStorage` fallback across OAuth per risk mitigation. Wire minimal tRPC or server handlers to persist UTM fields.

---

## Prompt 3 — View tracking APIs

Add server endpoints (tRPC procedures) to record and aggregate niche/creator view events for Tab 1. Respect admin-only access. Return shapes suitable for “most viewed” lists and UNDER-SUPPLY flags (niches with low creator coverage — define heuristic consistent with existing creator/niche data).

---

## Prompt 4 — Tab 3 Creators (first vertical slice)

Build `/admin/creators` per Scope A: pending approvals, failed scrapes with known error codes, live library table with actions (re-scrape, change niche, view on site, remove), add-creator form with auto-classify. Reuse existing creator/scrape domain logic where possible.

---

## Prompt 5 — Tab 1 Traffic

Build `/admin/traffic`: stat cards, channels + sparklines, funnel, most-viewed niches/creators, blog performance signals, AI Insights card (placeholder data OK until cron exists). Wire to real aggregates where tables exist; stub cron-backed sections with clear TODO if migrations not populated yet.

---

## Prompt 6 — Tab 2 Blog Studio

Build `/admin/blogs` flows: keyword opportunities list, 5-step AI generation modal, draft editor (SEO meta, cover regen hook, em-dash scan, internal links count), version history (last 5), publish with IndexNow ping hook and published list. Integrate existing blog models and OpenAI/Ubersuggest config from env.

---

## Prompt 7 — Crons & AI Insights

Add scheduled jobs (or documented cron entrypoints): daily AI Insights generator (6 AM UTC), weekly keyword opportunities (Sunday 2 AM UTC). Persist to `ai_insights` and `keyword_opportunities`. Harden prompts with structured JSON inputs to reduce numeric hallucinations per consolidated risks.

---

## Prompt 8 — Mobile & QA

Responsive pass for Tabs 1–3 at breakpoints 640 / 700 / 900 px. Fix overflow on tables and modals. Smoke-test admin gate, UTM persistence, and publish → IndexNow path in dev.
