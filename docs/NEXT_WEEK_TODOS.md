# SpyReels next-week todos

**Week of:** Mon Aug 17 – Fri Aug 21, 2026  
**Source of truth:** keep this file updated. When Noman asks for todos / next week / agenda, read this file and present it.

---

## P0 — ship / unblock (do first)

- [ ] **Tomorrow (Thu Aug 20): Transitional hooks / hook clips SEO + product wedge**
  - Meedro greenfield: `hook clips` (~1300 US/mo) + `transitional hooks` (~590); SpyReels has zero coverage today
  - [ ] Decide page type: Golden Standard blog vs free-tool gallery (prefer one canonical URL)
  - [ ] Draft/ship page covering transitional hooks + hook clips (no MP4 library clone required for v1)
  - [ ] Internal links from viral hooks tool + relevant blogs; GSC request indexing after deploy
  - [ ] Optional later: product pack / Carousel Lab tie-in if we want Meedro-style assets
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

### Distribution / Facebook marketing (P1 — do not skip)

These three channels are **critical** for SpyReels distribution and Facebook ads creative + organic reach. Treat as standing weekly work, not backlog filler.

- [ ] **1. Reddit article + posting**
  - [ ] Write one value-first **long Reddit-style article / guide post** (problem → method → proof; soft SpyReels mention only where on-topic)
  - [ ] Target 2–3 subs (creator / Reels / TikTok / indie SaaS); no spam, no link-dump first comments
  - [ ] Ship at least **1 Reddit post this week**; save thread URLs in a simple tracker so we do not go dark again (last organic Reddit was 2+ months ago)
  - [ ] Optional: turn the same article into a blog canonical later if it is not already covered (cannibalization check first)
- [ ] **2. Posts + backlinks (outreach)**
  - [ ] Run outreach from `docs/spyreels-backlink-outreach-drafts.md` + `docs/spyreels-backlink-outreach-list.csv` (P0/P1 rows first)
  - [ ] Directory submissions from `docs/spyreels-directory-submissions.csv` (Product Hunt, TAAFT, Futurepedia, Toolify, AlternativeTo, SaaSHub, …)
  - [ ] Goal this week: **send / publish at least 5 outreach touches** (guest mention asks, listicle adds, alternative pages) and log replies
  - [ ] Prefer links to live conversion URLs (Viral Reel Finder, viral hooks, transcript tools, key guides) not bare homepage only
- [ ] **3. Social media videos (esp. Facebook / Meta)**
  - [ ] Script and ship short **demo / proof videos** for Facebook + Instagram + (optional) TikTok/YouTube Shorts
  - [ ] Formats: product walkthrough (finder → remake → script), before/after hook, “how creators research Reels,” UGC-style face-to-camera
  - [ ] Export cuts sized for **Facebook Feed + Reels/Stories**; keep a reusable creative folder for ads and organic
  - [ ] Goal this week: **at least 2 finished videos** ready to post and/or use as Meta ad creative
  - [ ] Tie each video to one landing URL + UTM so we can see which creative drives signups

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
  - [x] **Real research teaser funnel (all 3 pages)** — Aug 18: shared `AiScriptGeneratorLanding` + `scriptGenerator.preview` / `claimToStudio`
    - Generate runs real LLM research (Restream-style loading steps)
    - Teaser shows Hook + Engagement only; Insight/CTA locked
    - Signup skips onboarding and lands on `/studio?script={id}` with the full researched script
  - After deploy: GSC request indexing on the three canonicals (+ optionally other free tools for stars refresh)
  - Phase 2 still open: YouTube Shorts script generator page
- [ ] **Transcript free-tool pages (4)** — Instagram / TikTok / YouTube Shorts / YouTube long (acquisition + SEO)
  - Why: SERP for `instagram script` / `* script transcriber` is dominated by **video → text** tools; keep separate from *writing* script generator pages.
  - **Product split (do not blur):**
    - Script generator = **idea → script** (blank topic → HEIT pack → Studio)
    - Transcript = **video URL → text**, then CTA **Remake in your voice** → existing viral onboarding questions → generate remake script in their voice (same path we use today) → land on `/scripts/{id}` with **source reel** on the right and their remade script in the editor
  - Locked primaries + URLs (React wired locally Aug 18; deploy + GSC still open):
    - [x] `/free-tools/instagram-transcript-generator` → `instagram transcript generator`
    - [x] `/free-tools/tiktok-transcript-generator` → `tiktok transcript generator` (secondary: `tiktok script transcriber`)
    - [x] `/free-tools/youtube-shorts-transcript` → `youtube shorts transcript`
    - [x] `/free-tools/youtube-transcript-generator` → `youtube transcript generator`
  - Wedge vs Tokscript/GetTheScript/Transcript365: **full transcript visible without signup** (value first). Conversion CTA is **Remake in your voice** → onboarding → `/scripts/{id}` + source reel. Do not blur/gate the transcript the way script-generator hides Insight/CTA.
  - [x] SEO package + HTML mockups + React wire (paste-URL public preview, remake via collected chain, Free Tools hub + footer + related tools + sitemap/meta)
  - Still open: public file-upload → transcript (upload tab currently routes to Collected after signup); deploy; GSC request indexing
  - Cross-link script generator pages as “writing from an idea” vs these as “steal structure from a video”
- [ ] **Comparison pages hub (Choppity-style)** — SEO + acquisition
  - Inspiration: Choppity “Comparisons” list (`Choppity vs OpusClip`, `vs CapCut`, `vs Submagic`, `vs VEED`, …)
  - Goal: public `/compare` (or `/comparisons`) index + individual **SpyReels vs X** Golden Standard pages that rank for “SpyReels alternative” / “X vs SpyReels” / “best X alternative for Reels”
  - First wave candidates (pick 4–6 after DataForSEO + intent check):
    - Transcript / script extract: Tokscript, GetTheScript, Transcript365, SpeakApp, Choppity
    - Script write: ScrollScript, ChatGPT-only workflows (position carefully)
    - Clip / caption tools creators confuse with remake: CapCut, Submagic, OpusClip, VEED (only where SpyReels wedge is clear: spy → remake → Studio, not timeline editing)
    - Finder-class: Viral Video Finder (if fair-use / brand-safe)
  - Work: keyword + cannibalization check → shared comparison template (table + who-wins + FAQ + CTA) → hub index → footer/internal links → GSC on each canonical
  - Do **not** invent fake feature claims; honest SpyReels wedge only
- [ ] **SpyReels inside Claude / ChatGPT (MCP or equivalent)** — acquisition + retention (Tokscript-style)
  - Inspiration: [Tokscript](https://tokscript.com/instagram-transcript-generator) “works inside Claude and ChatGPT” (MCP) — pull transcripts / profile / video analysis in chat
  - Goal: let creators use SpyReels research (transcript, finder remake cues, script expand) from Claude/ChatGPT without leaving the chat
  - Work: scope MCP vs custom GPT vs Claude connector → auth model → which tools to expose first (transcript URL, viral finder by handle, script from idea) → docs + marketing callout on transcript/script pages
  - Do **not** copy Tokscript branding; keep SpyReels wedge (research → remake → Studio)
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
- [ ] Directory submissions — see **Distribution / Facebook marketing** §2 above (same CSV)
- [ ] Backlink outreach — see **Distribution / Facebook marketing** §2 above (same drafts + list)
- [ ] Decide which finder hero mockups in `docs/mockups/` to ship vs kill (handle preview, typewriter, remake CTA, Perplexity-style, first-visit toast)
- [ ] **Blog publishing sprint** — no new posts for a long stretch; ship a small batch this week
  - [ ] Pick 2–4 keywords that do not cannibalize existing slugs (DataForSEO + GSC)
  - [ ] Draft/publish following `docs/BLOG_PUBLISH_CHECKLIST.md` + Golden Standard (H1, FAQs, internal links, meta, `sourceKeyword`)
  - [ ] Wire hubs if needed (`BLOG_RELATED_SLUGS`, homepage `POPULAR_GUIDES`, redirects)
  - [ ] After deploy: sitemap check + GSC **Request indexing** on canonical URLs only
  - [x] How-to search Reels guide (`guide-how-to-search-reels-on-instagram`) — inserted DB id=87 Aug 19; **after deploy: sitemap check + GSC Request indexing**
- [ ] Reddit — see **Distribution / Facebook marketing** §1 above (article + weekly cadence)

## P2 — product polish / bugs

- [x] **Remake output language = English** (Sep 26): non-English source transcripts still remake into English spoken scripts (`remakeOutputLanguage.ts`)
- [x] **Deepgram detect_language for non-English source audio** (Oct 3): STT no longer forces `language=en`; empty no-speech rows are retriable; no-voice CTA is Retry not Save for Inspiration (`d96e8b3` on main, Render deployed)
- [x] **Creator Radar refresh → durable jobs** (reliability; exposed by host-split deploy churn Sep 26)
  - Shipped: `creator_radar_refresh` on `durable_jobs`; API enqueues; serial web claimer resumes after deploy; scrape tables stay UI source of truth
  - Docs: `docs/deploy-notes/creator-radar-durable-refresh.md`
  - Rollback: `DURABLE_QUEUE_CREATOR_RADAR_REFRESH_ENABLED=false`
  - Optional later: dedicated worker + `CREATOR_RADAR_REFRESH_WEB_WORKER=false`
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

- [ ] **Ready-to-post pack outside Remake** (parked Oct 3 — Noman: do later)
  - Problem: caption, B-roll matches, and Opening Hook (9:16 Frame0) are hard or impossible to use without reopening the Remake modal; there is **no Instagram upload/publish** today
  - Goal: a surface outside Remake (Script Editor pack and/or My Scripts card) where creators can see/copy:
    - generated caption (+ hashtags)
    - saved B-roll clips (hydrate from `broll_generations`)
    - opening hook / Frame0 preview
  - Out of scope for now: Meta/Instagram direct publish
- [x] **Remake Phase A integrity** (approved Oct 3): X-only dismiss; hydrate B-roll on Remake open; quiet card center play; meta → details drawer; status chip when remake exists (Dashboard / Collected / Saved)

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

- [x] **Host split live** (Sep 26): `spyreels.ai` marketing vs `app.spyreels.ai` product; OAuth/cookies/CSRF; Telegram webhook on app origin; stuck Creator Radar jobs manually recovered
- [x] GSC indexing harden: 404 junk URLs, absolute blog 301s, crawl paths (`459b23c`)
- [x] TikTok/YouTube remake parity + multi-platform research reliability (`bd9cd41`)
- [x] Finder mobile hero polish + shared `FinderHandleForm` (`4696dd7`)

---

## How to use with Cursor

Say any of: **“todos”**, **“next week”**, **“agenda”**, **“what’s next”**.  
Agent should open this file and list open items (P0 → P3), then ask which to start.
