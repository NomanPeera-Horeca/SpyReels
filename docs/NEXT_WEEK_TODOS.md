# SpyReels next-week todos

**Week of:** Mon Aug 17 – Fri Aug 21, 2026  
**Source of truth:** keep this file updated. When Noman asks for todos / next week / agenda, read this file and present it.

---

## P0 — ship / unblock (do first)

- [x] Run prod migration `drizzle/0084_collected_reels_platform.sql` (Collected Reels platform column) — verified on maglev Aug 17: column + index present; IG/TikTok/YouTube rows live
- [x] **Backfill / refresh viral video data for big creators** (Gary Vee–tier public demos) — done Aug 17 on maglev
  - [x] Identify stale high-profile handles (Gary Vee class + other hero demo accounts)
  - [x] Re-scrape public demo heroes: `garyvee`, `humphreytalks`, `russellbrunson`, `codiesanchez` (4/4 success, ~98 featured_reels, R2 thumbs/videos)
  - [x] Confirm freshness: newest posts Aug 8–16 (was ~Apr / Feb stale)
  - [ ] **Remakeable talk/business batch:** scrape run finished Aug 17 (~63 min): **3/14 success** (neilpatel, sahilbloom, naval → 90 featured_reels). **11 hard failures** after Instagram fetch (MySQL “connection closed” / ECONNRESET / R2 DNS) — retry those accounts, then transcribe → mark `viralFlag` only on spoken reels
    - Failures to retry: danmartell, thebudgetnista, grantcardone, ryanserhant, aliabdaal, thedankoe, therealbrianmark, dailystoic, jayshetty, the.holistic.psychologist, yung_pueblo
    - Excludes music/sports-highlight mega celebs
- [ ] GSC after deploy of indexing harden (`459b23c`):
  - [ ] Validate soft 404 / duplicate fixes in Page indexing
  - [ ] **Request indexing** only on canonical URLs (never noindexed legacy duplicates)
  - [ ] Spot-check homepage if Popular Guides links changed crawl discovery
- [x] QA mobile finders after `4696dd7` (automated Playwright Aug 17 — iPhone 14 + Pixel 7 vs prod):
  - [x] `/features/viral-reel-finder`
  - [x] TikTok viral finder page
  - [x] YouTube Shorts viral finder page
  - Result: **no layout crush / no horizontal overflow**; input + Find CTA stack correctly; screenshots in `docs/qa/mobile-finders-2026-08-17/`
  - Minor: header “Start free” tap height ~36px (nav, not hero); TikTok hero may show spinner on first paint if live demo prefetch runs
  - Script to re-run: `pnpm exec tsx scripts/mobile-finder-qa.ts`

## P1 — conversion / growth

- [x] **Viral Hook Generator rebuild** (`/free-tools/viral-hooks`) — mockup approved and wired to React (keep generate/unlock/expand API)
  - [x] Confirm primary keyword + DataForSEO volumes (US)
  - [x] SEO body + meta + StoryCut-style layout shipped in `HookGenerator.tsx` (title/description, FAQ + FAQ schema, SoftwareApplication schema, RelatedToolsGrid, product bridge CTAs)
  - [x] GSC **Request indexing** on `https://spyreels.ai/free-tools/viral-hooks` (done manually)
- [ ] **Hook Generator Templates library** (product roadmap / good-to-have → acquisition)
  - Inspiration: IG / Later-style “hook generator templates for content creators” grids (curiosity, hot takes, numbered steals, 1K vs 1M hooks, etc.)
  - Goal: browsable gallery of proven hook templates (with social proof / pattern labels) users can tap → fill → generate / copy
  - Work: research viral hook template patterns → seed a template catalog → UI in free tool and/or in-app → optional public SEO page that ranks for “hook templates”
  - Wedge vs static Google Docs guides: SpyReels templates are interactive + expand into full scripts / finder remakes
- [ ] **Find Creators / Creator Discovery marketing landing page** (acquisition) — **tomorrow (Aug 18)**
  - Source: product already live in staging/app at `/discovery` (`CreatorDiscovery.tsx`)
  - Goal: public SEO + conversion page (not just gated app UI) so cold traffic can land, understand, and sign up
  - Pitch: **Find Instagram creators in any niche** to spy on, understand structure, and remake their content (not hire UGC / run brand campaigns)
  - **Competitor research (do before mockup):**
    - [ ] [Collabstr](https://collabstr.com) search/marketplace (UGC filters, creator cards, niche browse) — note what to steal for discovery UX vs ignore (price/hire intent)
    - [ ] [Upfluence free tool](https://www.upfluence.com/find-instagram-influencers-free) “Find Instagram Creators In Any Location” — location-led free-tool LP pattern
    - [ ] [Hypefy](https://business.hypefy.ai) brand onboarding / discovery flow — what they collect and how they position for brands
    - Deliverable: short notes in plan/mockup brief (filters, hero CTA, wedge vs hire-marketplace)
  - Work: keyword research → competitor notes → mockup → Golden Standard page → footer/free-tools/related tools → GSC
  - Note: `/discovery` is app-private / robots Disallow; marketing URL should be a separate public path (e.g. `/features/find-creators`) that CTAs into signup → `/discovery`
- [x] **Script Generator marketing pages** (acquisition + SEO) — hub + TikTok + Instagram wired Aug 17
  - Live routes: `/free-tools/ai-script-generator`, `/free-tools/tiktok-script-generator`, `/free-tools/instagram-reels-script-generator`
  - Schema: SoftwareApplication + **aggregateRating 4.5 / 12000** + Free offer (ElevenLabs-style SERP) also backfilled on Hooks, B-roll, finders, homepage, Brand Coach, 30-day plan
  - After deploy: GSC request indexing on the three canonicals (+ optionally other free tools for stars refresh)
  - Phase 2 still open: YouTube Shorts script generator page
- [ ] **Transcript free-tool pages (3)** — Instagram / YouTube / TikTok (acquisition + SEO)
  - Why: SERP for `instagram script` is dominated by **Reel → text / transcript** tools (SpeakApp, GetTheScript, Tokscript); PASF also shows `script generator from video`. Separate intent from *writing* scripts.
  - Ship as **three Golden Standard pages** (not one thin hub):
    - [ ] Instagram Reel transcript generator (Reels to text / paste URL)
    - [ ] YouTube transcript / Shorts transcript page
    - [ ] TikTok transcript generator
  - Product wedge: transcript → spy structure → remake / expand into SpyReels script (not “no login forever” commodity clone)
  - Work: keyword research per platform → cannibalization check → mockups → routes under `/free-tools/` → Free Tools hub + footer + related tools → GSC
  - Sequence: after Script Generator page ships (or parallel once Script Generator is approved)
- [ ] **30-Day Content Plan marketing landing page** (acquisition + SEO)
  - Product lives in-app at `/plan` (goal + platforms → Generate My 30-Day Plan)
  - Public route already exists at `/features/30-day-content-plan` (`ThirtyDayContentPlanFeature.tsx`) — audit vs Golden Standard; rebuild/improve if thin or not converting
  - Goal: cold traffic understands “niche + goal → full month of ideas” in ~2 folds, then CTA into signup → `/plan`
  - Work: keyword research (DataForSEO) → mockup (shared PublicHeader/PublicFooter) → ship → footer/related tools/internal links → GSC index canonical
- [x] Signup / AuthDialog split-layout redesign (VVF-style card: form left, testimonials right; SpyReels purple; wired Aug 17 in `AuthDialog.tsx`; placeholder quotes TBD swap later)
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
- [x] Stripe / checkout investigation (Aug 17) — **WORKING**, low volume (not a dead billing path)
  - Evidence: active Pro sub (user 31463, period end 2026-09-04); checkout still creates `stripeCustomerId` on abandoned starts
  - PostHog `checkout_completed` is missing/sparse (analytics gap), do not treat as proof checkout is broken
  - Optional: Noman smoke-test Upgrade → Stripe Checkout → confirm webhook 200; improve PostHog server capture if desired
  - Closed vague `todo.md` “Stripe not working” as investigate-done (working)
- [ ] History / Account Monitoring: show clear error message on failed scrape jobs
- [ ] Replace temp SVG `RelatedToolsGrid` thumbs with real product preview images
- [ ] Commit or discard untracked drafts still sitting local (outreach CSVs, mockups, preview HTML) so the repo stays clean
- [x] AI Coach empty state: stop dumping niche bio; Claude-style composer (`AiCoachCommandShell`)

## P3 — backlog (only if P0–P2 clear)

- [ ] **Buzzli competitive teardown → SpyReels roadmap** (LinkedIn “SpyReels-class” product)
  - Competitor: [buzzli.io](https://buzzli.io/) — personal branding + LinkedIn content stack (agents, viral posts, carousels, profile analysis, credits)
  - **Research spike (1–2 sessions):** walk Agents Marketplace, Viral Posts, Carousels, Profile Analyzer, Idea/Post Generation, Personalized Content Plan, GPT Mode onboarding; note pricing/credits and what actually ships vs vapor
  - **Steal / adapt for SpyReels (do not clone LinkedIn):**
    - **GPT Mode onboarding:** copy prompt → paste ChatGPT/Claude JSON → auto-fill Brand Coach / niche / voice (faster than a long form; pairs with Postbeam voice-train idea)
    - **Agents Marketplace pattern:** packaged “jobs” (e.g. weekly niche research → script ideas, news → Reel hooks, competitor watch → remake queue) vs one generic chat
    - **Viral Posts library:** already our wedge on short-form; compare their browse/filter/recreate UX and credit gating
    - **Profile analysis:** IG/TikTok/YT channel audit → gaps + content plan (we have finder + 30-day plan; they sell “profile → strategy”)
    - **Scheduled / autopilot posts:** optional later; SpyReels today stops at remake/script/carousel (posting automation is a different product bet)
  - Deliverable: short notes in this file or `docs/competitive-buzzli.md` with P0/P1 product bets only (ignore LinkedIn-only surface)
- [ ] **Voice brand-train interview (optional)** — later SpyReels differentiator
  - Inspiration: Postbeam “Meet Marv” onboarding (`/onboarding/interview`): optional voice call to train AI on the creator’s voice, stories, and style (skip + finish later OK; min session length)
  - Product fit: feed Brand Coach / remake / carousel / script gen so output sounds like *them*, not generic AI
  - Scope later: onboarding step and/or Settings “train my voice”; Retell (or similar) call → transcript → durable voice profile; never block signup
  - Note: optional + highly recommended framing; do not ship until Brand Coach persistence and remake quality baselines are solid
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
