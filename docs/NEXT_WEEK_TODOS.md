# SpyReels next-week todos

**Week of:** Mon Aug 17 – Fri Aug 21, 2026  
**Source of truth:** keep this file updated. When Noman asks for todos / next week / agenda, read this file and present it.

---

## P0 — ship / unblock (do first)

- [ ] Run prod migration `drizzle/0084_collected_reels_platform.sql` (Collected Reels platform column)
- [ ] **Backfill / refresh viral video data for big creators** (Gary Vee–tier and similar)
  - Problem: product says “viral” but many tracked accounts have not been updated in ~3 months (stale Reels/TikTok/Shorts)
  - [ ] Identify stale high-profile handles (Gary Vee class + other hero demo accounts)
  - [ ] Re-scrape / backfill recent videos so finder + discovery demos show fresh outliers
  - [ ] Confirm UI dates / last-updated reflect the refresh (no “viral” claims on dead data)
- [ ] GSC after deploy of indexing harden (`459b23c`):
  - [ ] Validate soft 404 / duplicate fixes in Page indexing
  - [ ] **Request indexing** only on canonical URLs (never noindexed legacy duplicates)
  - [ ] Spot-check homepage if Popular Guides links changed crawl discovery
- [ ] QA mobile finders after `4696dd7` on clean Safari + Chrome (no password-manager extensions):
  - [ ] `/features/viral-reel-finder`
  - [ ] TikTok viral finder page
  - [ ] YouTube Shorts viral finder page
  - Confirm icon/input/CTA stack, readable “or try” copy, no layout crush

## P1 — conversion / growth

- [x] **Viral Hook Generator rebuild** (`/free-tools/viral-hooks`) — mockup approved and wired to React (keep generate/unlock/expand API)
  - [x] Confirm primary keyword + DataForSEO volumes (US)
  - [ ] Approve HTML mockup → ship SEO body + meta + StoryCut-style layout (SpyReels wedge)
  - [ ] Related tools + product bridge CTA; GSC index canonical
- [ ] **Hook Generator Templates library** (product roadmap / good-to-have → acquisition)
  - Inspiration: IG / Later-style “hook generator templates for content creators” grids (curiosity, hot takes, numbered steals, 1K vs 1M hooks, etc.)
  - Goal: browsable gallery of proven hook templates (with social proof / pattern labels) users can tap → fill → generate / copy
  - Work: research viral hook template patterns → seed a template catalog → UI in free tool and/or in-app → optional public SEO page that ranks for “hook templates”
  - Wedge vs static Google Docs guides: SpyReels templates are interactive + expand into full scripts / finder remakes
- [ ] **Find Creators / Creator Discovery marketing landing page** (acquisition)
  - Source: product already live in staging/app at `/discovery` (`CreatorDiscovery.tsx`)
  - Goal: public SEO + conversion page (not just gated app UI) so cold traffic can land, understand, and sign up
  - Work: keyword research (DataForSEO) → mockup → Golden Standard page → route in footer/free-tools/related tools → GSC
  - Pitch wedge from PRD: “Find your competitors and steal their viral hooks” (lookalike / niche creator search)
  - Note: `/discovery` is currently app-private / robots Disallow; marketing URL should be a separate public path (e.g. `/features/find-creators` or similar) that CTAs into signup → `/discovery`
- [ ] **Script Generator marketing landing page** (acquisition + SEO)
  - Today: script generator only lives in-app, so it cannot rank organically
  - Goal: public Golden Standard page that ranks for script-generator / Reel script / AI script intents and CTAs into signup → in-app generator
  - Work: keyword research (DataForSEO, cannibalization check vs hooks / blog) → mockup → page + meta + schema → footer/related tools/internal links → GSC index canonical
- [ ] **30-Day Content Plan marketing landing page** (acquisition + SEO)
  - Product lives in-app at `/plan` (goal + platforms → Generate My 30-Day Plan)
  - Public route already exists at `/features/30-day-content-plan` (`ThirtyDayContentPlanFeature.tsx`) — audit vs Golden Standard; rebuild/improve if thin or not converting
  - Goal: cold traffic understands “niche + goal → full month of ideas” in ~2 folds, then CTA into signup → `/plan`
  - Work: keyword research (DataForSEO) → mockup (shared PublicHeader/PublicFooter) → ship → footer/related tools/internal links → GSC index canonical
- [ ] Signup / AuthDialog split-layout redesign (YouTube finder is shipped; wait for Noman to greenlight, then build VVF-style split: form left, social proof right, SpyReels tokens only)
- [ ] **Carousel Library growth pack**
  - [ ] Research / steal patterns from viral carousel posts (IG / LinkedIn / TikTok carousels that actually perform)
  - [ ] Add a batch of new templates into Carousel Library (not one-offs; enough variety for niches SpyReels already serves)
  - [ ] **Marketing landing page** for Carousel Library (SEO + acquisition channel)
    - Keyword research (DataForSEO) → Golden Standard page → route + footer/related tools → CTA into signup / app Carousel Library
    - GSC request indexing on canonical after ship
- [ ] Directory submissions from `docs/spyreels-directory-submissions.csv` (Product Hunt, TAAFT, Futurepedia, Toolify, AlternativeTo, SaaSHub, …)
- [ ] Backlink outreach from `docs/spyreels-backlink-outreach-drafts.md` + list CSV
- [ ] Decide which finder hero mockups in `docs/mockups/` to ship vs kill (handle preview, typewriter, remake CTA, Perplexity-style, first-visit toast)
- [ ] **Blog publishing sprint** — no new posts for a long stretch; ship a small batch this week
  - [ ] Pick 2–4 keywords that do not cannibalize existing slugs (DataForSEO + GSC)
  - [ ] Draft/publish following `docs/BLOG_PUBLISH_CHECKLIST.md` + Golden Standard (H1, FAQs, internal links, meta, `sourceKeyword`)
  - [ ] Wire hubs if needed (`BLOG_RELATED_SLUGS`, homepage `POPULAR_GUIDES`, redirects)
  - [ ] After deploy: sitemap check + GSC **Request indexing** on canonical URLs only
- [ ] **Reddit posting** — last post was 2+ months ago; restart a light, non-spam cadence
  - [ ] Pick 2–3 relevant subs (creator / Reels / TikTok / indie SaaS) where SpyReels is genuinely useful
  - [ ] Draft value-first posts or comments (problem → what you tried → tool only if asked or clearly on-topic)
  - [ ] Ship at least 1 post this week; track links/threads so we do not go dark again

## P2 — product polish / bugs

- [ ] **B-Roll Library in-app redesign** (`/b-roll` or Create → B-Roll Library)
  - Landing / marketing page is fine; **in-app UI is raw** (plain script list, no visual hierarchy, feels unfinished)
  - [ ] Competitive + UX research (how top B-roll / stock-match tools present script → beats → clips)
  - [ ] Mockup a polished flow: script picker, beat preview, clip grid/player, generation status
  - [ ] Ship redesign matching SpyReels app chrome (not just marketing aesthetics)
- [ ] Stripe integration not working — investigate and fix (`todo.md`)
- [ ] History / Account Monitoring: show clear error message on failed scrape jobs
- [ ] Replace temp SVG `RelatedToolsGrid` thumbs with real product preview images
- [ ] Commit or discard untracked drafts still sitting local (outreach CSVs, mockups, preview HTML) so the repo stays clean
- [x] AI Coach empty state: stop dumping niche bio; Claude-style composer (`AiCoachCommandShell`)

## P3 — backlog (only if P0–P2 clear)

- [ ] REWRITE toolbar leftovers in `todo.md` (grade/timing/delivery cues parity) if still incomplete in product
- [ ] SEO follow-through on homepage vs Viral Reel Finder traffic shift (internal links, hubs, not more duplicate posts)
- [ ] Track `.cursor/rules/internal-linking-on-new-pages.mdc` if we want it in git (currently untracked)

---

## Done recently (do not re-open unless regressing)

- [x] GSC indexing harden: 404 junk URLs, absolute blog 301s, crawl paths (`459b23c`)
- [x] TikTok/YouTube remake parity + multi-platform research reliability (`bd9cd41`)
- [x] Finder mobile hero polish + shared `FinderHandleForm` (`4696dd7`)

---

## How to use with Cursor

Say any of: **“todos”**, **“next week”**, **“agenda”**, **“what’s next”**.  
Agent should open this file and list open items (P0 → P3), then ask which to start.
