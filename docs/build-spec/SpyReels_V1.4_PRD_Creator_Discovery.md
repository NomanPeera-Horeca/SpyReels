# SpyReels V1.4 PRD: Creator Discovery Engine

**Bug #:** 64
**Priority:** P0 (blocks ICP expansion beyond curated library)
**Target Release:** V1.4
**Owner:** Noman Peera (Cursor build)
**Status:** Draft, ready for engineering kickoff
**Last updated:** May 13, 2026

---

## 1. Problem Statement

### 1.1 The objection

A Reddit user surfaced the single biggest gap in SpyReels' current positioning:

> "You say spy on competitors' viral video, but how do we know who my competitors are? If a person targets restaurant owners, how the fuck do I know who that person is, then put his handle, and only THEN find out his viral reels?"

This is correct. Today, SpyReels' value proposition is bottlenecked by the curated featured-accounts library (currently 50-100 accounts across a limited number of niches). For any user whose niche is not in our library, SpyReels has nothing to offer until they manually identify competitor handles, which is the hardest job in the whole workflow.

### 1.2 Why this matters strategically

This is a repositioning, not just a feature.

- **Old pitch:** "We curate viral creators for you."
- **New pitch:** "Find your competitors and steal their viral hooks."

The second is a 10x bigger market. A curated library is a feature. Creator discovery is the moat, because it makes SpyReels useful for any niche, not just the ones we manually seeded.

### 1.3 What competitors do

| Tool | Discovery Method | Database Size | Pricing | ICP |
|------|------------------|---------------|---------|-----|
| Modash | AI search + filters + lookalike | 380M+ profiles | $16,200/yr API minimum | Brands looking for creators to pay |
| Meedro | Limited discovery, mostly library-based | Smaller | Credit-based | Creators copying viral content |
| ViralFindr | None | Library only | Subscription | Creators |
| Influencers.club | Lookalike + email enrichment | Large | Enterprise | Brands |
| **SpyReels (today)** | None (curated library only) | ~50-100 accounts | $X/mo | Nano/micro creators copying viral content |
| **SpyReels (V1.4)** | Lookalike + audience search | Unlimited (live scrape) | Same | Same |

### 1.4 Out of scope for this release

- Audience demographics scoring (Modash's specialty, not our ICP need)
- Email enrichment / contact discovery (we are not building an outreach tool)
- Brand collaboration mapping
- TikTok and YouTube discovery (Instagram only for V1.4, add later)

---

## 2. Engine Decision

### 2.1 Requirements

The discovery engine must:

1. Return Instagram accounts similar to a seed handle (lookalike), reliably
2. Return accounts that match an audience description (audience search) - V1.5
3. Be affordable at our current MRR (target: under $200/month at V1.4 launch volume)
4. Use Instagram's own signals where possible (so lookalikes are real, not algorithmically guessed by a third party with stale data)
5. Be scriptable from our existing Node/TypeScript backend
6. Return enough data per profile to display a metrics card before the user spends a scrape credit

### 2.2 Options evaluated

**Option A: Modash Discovery API**
- Pros: Industry leader, 380M database, AI search, real lookalike endpoint, enterprise reliability
- Cons: **$16,200/year minimum, annual commitment.** Designed for brands not creators. ICP mismatch on most fields (audience demographics, fake follower detection, email finder, contact details). Massive overkill for our use case.
- Verdict: Not viable until post Series A.

**Option B: ScrapeCreators (current vendor)**
- Pros: Already integrated, $10 per 5,000 credits, pay-as-you-go, no rate limits, founder is responsive.
- Cons: **No Instagram lookalike endpoint exists.** Their Instagram coverage (12 endpoints) includes Profile, Posts, Reels, Search Reels (via Google), Transcripts, Comments. The "similar accounts" feature exists for TikTok (Followers, Following, Search Users) but not for Instagram.
- Verdict: Keep using for profile enrichment, NOT viable for lookalike.

**Option C: Apify - Instagram Related Person Scraper**
- Actor: `automation-lab/instagram-related-person-scraper` (or equivalent in the marketplace)
- Pros: **Scrapes Instagram's own "Suggested Accounts" algorithm directly** (the list you see when you click the arrow next to "Follow" on any IG profile). This is the gold standard for lookalikes because it uses Instagram's signal, not a third-party guess. Returns: username, bio, follower count, category, profile URL. Pay-per-run pricing. ~$0.05 per profile scraped at typical rates.
- Cons: New vendor relationship. Apify actor reliability depends on the actor maintainer. Need to verify actor uptime before committing.
- Verdict: **Recommended primary engine for lookalike.**

**Option D: Influencers.club API**
- Pros: Has a dedicated lookalike feature for IG, large database, email enrichment.
- Cons: Pricing not public, requires sales call. Likely $500+/month minimum. ICP mismatch (built for brands).
- Verdict: Hold as a backup if Apify reliability is poor.

**Option E: Self-built (scrape followers, find audience overlap)**
- Pros: Full control, no vendor dependency, learning value.
- Cons: 4-6 weeks of engineering. Risk of getting blocked. We are a one-person shop. Time better spent on product, not infrastructure.
- Verdict: No, not at this stage.

### 2.3 Final engine recommendation

**Hybrid stack:**

| Job | Engine | Cost estimate at 1,000 lookalike searches/month |
|------|--------|---------|
| Lookalike (find similar accounts) | Apify Instagram Related Person Scraper | ~$50/month |
| Profile enrichment (get metrics for results) | ScrapeCreators (already in stack) | ~$20/month |
| Audience search (V1.5) | ScrapeCreators Search Reels by keyword + dedup creators | ~$15/month |
| **Total V1.4 incremental cost** | | **~$70-100/month** |

This is ~5% the cost of Modash, uses Instagram's own algorithm for lookalikes, and reuses the ScrapeCreators integration that already works.

### 2.4 Cursor handoff: engine validation before build

Before any code is written, Cursor must validate the Apify actor's reliability. The PASTE INTO CURSOR CHAT block in Section 9.1 covers this.

---

## 3. Two Discovery Modes

Discovery has two distinct entry points. They have different UX, different APIs, and different complexity. Ship them in order.

### 3.1 Mode 1: Lookalike (V1.4 launch)

**User intent:** "I know one competitor. Find me 19 more like them."

**Input:** A single Instagram handle (e.g., `@noman_peera`)

**Output:** 10-20 similar Instagram accounts, each shown as a metrics card with:
- Profile picture
- Handle and display name
- Follower count
- Engagement rate (above/below niche average)
- Recent viral count ("8 reels over 100K views in last 90 days")
- 3 sample thumbnails from their top recent reels
- Niche match score (reuses Bug #58 AI classifier output once shipped)
- **One CTA: "Add to my spy library"** (pulls the account into the existing scrape/transcribe/script flow)

**Why this mode first:** Nano/micro creators almost always know at least one competitor. The hard job is finding 19 more. Lookalike answers the Reddit objection directly and is technically the easiest to ship reliably.

### 3.2 Mode 2: Audience search (V1.5, post-launch)

**User intent:** "I don't know any competitors. Find creators whose audience matches mine."

**Input:** A natural language description (e.g., "restaurant owners and food service professionals")

**Output:** Same metrics cards as Mode 1, plus a transparency line ("Found because these accounts repeatedly target keywords matching your description").

**Technical approach (V1.5):**
1. Convert user description into 5-10 keyword variants using Claude Sonnet (e.g., "restaurant owners" -> "restaurant management", "food service", "F&B operations", "restaurant marketing")
2. For each keyword, call ScrapeCreators `/v2/instagram/reels/search` (which uses Google Search behind IG's login wall)
3. Extract unique creator handles from results
4. Run those handles through profile enrichment (same flow as Mode 1)
5. Rank by relevance score (keyword match density in bio + content) and viral activity

**Why V1.5 not V1.4:** Audience search is technically harder, more error-prone, and requires keyword tuning. Lookalike unblocks 80% of the Reddit objection. Ship that first, validate, then build audience search.

### 3.3 Mode 3: Filters and refinement (V1.6, month 2+)

- Filter by follower range (e.g., "show me only 1K-50K creators in nano/micro tier")
- Filter by engagement rate
- Filter by location
- Filter by niche
- Save searches
- Lookalike-on-lookalike (click any result, find more like THIS one)

---

## 4. User Flow

### 4.1 Lookalike flow (V1.4)

```
Step 1: Dashboard nav
  - New sidebar item: "Lookalikes" (icon: magnifying glass + people)
  - Placed above "Spy Library" since this is the on-ramp

Step 2: Lookalikes page lands on "By handle" tab ("By audience" tab is greyed/coming-soon)
  - Headline: "Find lookalike accounts. Steal their viral hooks."
  - Subhead: "Enter any Instagram handle you know. We'll find similar accounts using Instagram's own algorithm."
  - Single input field: [@handle] with [Find Lookalikes] button
  - Below the input: 3 example chips ("Try: @garyvee", "Try: @aliabdaal", "Try: @hormozi") for empty-state inspiration

Step 3: User pastes handle, clicks Find Lookalikes
  - Loading state: 3-5 seconds
  - Status text cycles: "Asking Instagram for suggestions..." -> "Pulling profile metrics..." -> "Ranking by viral activity..."
  - Loading skeleton: 12 empty cards

Step 4: Results render
  - Grid of 10-20 cards (responsive, 3-4 per row desktop, 1 per row mobile)
  - Each card shows the metrics listed in 3.1
  - Sort dropdown above grid: "Most followers" / "Highest engagement" / "Most recent virals" (default: Most recent virals)
  - Filter chip row: Follower range slider [1K - 1M+]

Step 5: User clicks "Add to my spy library" on any card
  - Toast: "Added @handle to your library. Scraping their viral reels now..."
  - Account moves into the existing Spy Library flow
  - Card on Lookalikes page changes state to "Added" with checkmark
  - User can keep adding from the same results page without refreshing

Step 6: Empty / error states
  - Handle not found: "We couldn't find @handle on Instagram. Check the spelling and try again."
  - Private account: "@handle is a private account. We can only find lookalikes for public profiles."
  - No suggestions: "Instagram didn't return any suggestions for @handle. Try a different seed account, or use 'By audience' search (coming soon)."
  - Quota exceeded: "You've used your lookalike searches for this month. Upgrade to get more." [Upgrade button]
```

### 4.2 Visual mockup notes for Cursor

- Reuse existing card component from Spy Library page (consistency)
- Match dark mode token palette already in use
- "Added" state should be visually distinct (checkmark icon, muted card, disabled button)
- Card hover state: subtle lift + shadow + cursor pointer on the whole card
- Mobile: stack cards single-column, sticky "Add" button at bottom of card

---

## 5. Database Schema

### 5.1 New tables

```sql
-- Tracks each lookalike search the user runs
CREATE TABLE lookalike_searches (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  seed_handle VARCHAR(100) NOT NULL,
  status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
  result_count INT DEFAULT 0,
  error_message VARCHAR(500),
  apify_run_id VARCHAR(200),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_user_created (user_id, created_at)
);

-- One row per discovered account returned from a lookalike search
CREATE TABLE lookalike_results (
  id VARCHAR(50) PRIMARY KEY,
  search_id VARCHAR(50) NOT NULL,
  handle VARCHAR(100) NOT NULL,
  display_name VARCHAR(200),
  bio TEXT,
  follower_count INT,
  following_count INT,
  is_verified BOOLEAN DEFAULT FALSE,
  is_private BOOLEAN DEFAULT FALSE,
  profile_pic_url VARCHAR(500),
  category VARCHAR(100),
  engagement_rate DECIMAL(5,2),
  recent_viral_count INT DEFAULT 0,
  sample_thumbnails JSON,
  niche_match_score DECIMAL(3,2),
  enrichment_status ENUM('pending', 'enriched', 'failed') DEFAULT 'pending',
  added_to_library BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (search_id) REFERENCES lookalike_searches(id),
  INDEX idx_search (search_id),
  INDEX idx_handle (handle)
);

-- Tracks lookalike search quota usage per user per month
CREATE TABLE lookalike_quota_usage (
  user_id VARCHAR(50) NOT NULL,
  year_month VARCHAR(7) NOT NULL,
  searches_used INT DEFAULT 0,
  PRIMARY KEY (user_id, year_month)
);
```

### 5.2 Migration filename

`drizzle/0036_creator_discovery_v14.sql` (next migration after the V1.3 series)

### 5.3 Note on existing schema

No changes needed to existing `featured_accounts`, `reels`, or `scrape_jobs` tables. The "Add to spy library" action uses the same scraping pipeline already in production.

---

## 6. Backend Architecture

### 6.1 tRPC procedures (new)

```typescript
// server/routers/discovery.ts

export const discoveryRouter = router({
  // Mode 1: Lookalike
  startLookalikeSearch: protectedProcedure
    .input(z.object({
      seedHandle: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Check user quota (5/month Starter, unlimited Pro)
      // 2. Validate handle format (strip @, lowercase, no spaces)
      // 3. Create lookalike_searches row, status=pending
      // 4. Trigger Apify actor run (async)
      // 5. Return searchId so frontend can poll
    }),

  getLookalikeSearchStatus: protectedProcedure
    .input(z.object({ searchId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Returns: status, result_count, error_message, results[]
    }),

  enrichLookalikeResult: internalProcedure
    .input(z.object({ resultId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Called by background worker after Apify run completes
      // For each result, hit ScrapeCreators /v1/instagram/profile
      // Compute engagement rate, recent viral count, sample thumbnails
    }),

  addResultToLibrary: protectedProcedure
    .input(z.object({ resultId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Pull handle from lookalike_results
      // Insert into featured_accounts (or user_accounts table if that's the pattern)
      // Trigger existing scrape pipeline
      // Mark result as added_to_library = true
    }),

  getRecentSearches: protectedProcedure
    .query(async ({ ctx }) => {
      // Returns user's last 10 lookalike searches for "Recent" tab
    }),
});
```

### 6.2 Apify integration module

```typescript
// server/lib/apify.ts

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = 'automation-lab~instagram-related-person-scraper'; // VERIFY before build, see 9.1

export async function startRelatedPersonScraperRun(handle: string) {
  // POST to https://api.apify.com/v2/acts/{ACTOR_ID}/runs
  // Body: { input: { username: handle, limit: 20 } }
  // Returns: run_id
}

export async function getRunResults(runId: string) {
  // GET https://api.apify.com/v2/actor-runs/{runId}/dataset/items
  // Returns array of: { username, fullName, bio, followers, category, profilePicUrl }
}

export async function pollRunUntilComplete(runId: string, timeoutMs = 30000) {
  // Poll status every 2s until SUCCEEDED, FAILED, or timeout
  // Return final dataset items or throw
}
```

### 6.3 Background worker for enrichment

After Apify returns the raw lookalike list (just usernames + basic data), a background job enriches each result with current metrics from ScrapeCreators. This is async because:

1. Apify returns 20 results in ~5 seconds
2. Enrichment is 20 sequential ScrapeCreators calls at ~1 second each
3. Total enrichment time: ~20 seconds

Strategy: Show Apify results immediately with skeleton metrics, then progressively fill in enrichment data via tRPC subscription or polling. UX: cards appear within 5s, metrics fill in over the next 20s.

### 6.4 Caching strategy

- Lookalike results for any given seed handle are cached for 7 days
- If user re-searches the same handle within 7 days, return cached results (no Apify cost, no quota use)
- Cache key: `lookalike:{seed_handle}`, stored in `lookalike_searches` table (find latest completed search for that handle)
- Enrichment metrics cached for 24 hours (engagement rate changes slowly)

### 6.5 Rate limiting and error handling

- Apify free tier and paid tier both have concurrency limits. Worst case: actor takes 60s. Surface a "this is taking longer than usual" state after 15s.
- If Apify fails: log to Sentry/PostHog, return graceful error to user, do NOT deduct from quota
- ScrapeCreators 90% success rate on profile endpoint (per their docs): retry once, then mark enrichment_status=failed and show "Metrics unavailable" on card. User can still add to library.

---

## 7. Pricing and Quota Gating

### 7.1 Tier gates

| Tier | Lookalike searches/month | Audience searches/month (V1.5) | Purpose |
|------|--------------------------|--------------------------------|---------|
| Free | 3 | 0 | Acquisition, taste of value |
| Starter | 10 | 0 | Entry-level paid |
| Pro | 20 | 20 | Power tier |

### 7.2 Why these numbers

- **Free = 3:** Enough to prove the product works on the user's own niche (try one handle they know, find more, see metrics). Not enough to use SpyReels seriously without upgrading. This is the conversion trigger.
- **Starter = 10:** Covers a typical onboarding burst (week one) where a new paid user maps their competitive landscape. After that, they're scraping and generating scripts, not searching.
- **Pro = 20:** Enough headroom for power users who actively explore new niches or run multiple brands. 20 searches returning 10-20 results each = 200-400 potential accounts to add to library per month, which is far more than any single user can actually act on.
- Each tier returns the same per-search quality. Quotas are about volume, not quality.

### 7.3 Cost-per-search math

At full usage (Apify Related Person Scraper ~$0.05/run, 20 results, plus 20 ScrapeCreators profile calls at $0.002 each):
- Cost per search: $0.05 + (20 * $0.002) = $0.09
- Free user at max: 3 * $0.09 = $0.27/month cost per user
- Starter user at max: 10 * $0.09 = $0.90/month cost per user
- Pro user at max: 20 * $0.09 = $1.80/month cost per user

Margins healthy at all tiers. Pro user paying $49/mo only costs $1.80/mo in Lookalike infrastructure. No risk of cost runaway.

### 7.4 Upgrade trigger UX

**Free user hits 3 searches:**
- Inline upgrade modal: "You've used your 3 free lookalike searches this month."
- Show what they would have found ("There are 14 more accounts similar to @handle waiting for you")
- Two CTAs: "Upgrade to Starter ($X/mo, 10 searches)" and "Upgrade to Pro ($Y/mo, 20 searches)"
- Quota resets on the 1st of next month

**Starter user hits 10 searches:**
- Modal: "You've used your 10 lookalike searches this month. Upgrade to Pro for 20."
- Single CTA to Pro
- Quota resets on the 1st of next month

**Quota counter visible in UI:**
- Small badge on the Lookalikes page: "7 of 10 searches used this month"
- At 80% usage, badge turns orange. At 100%, turns red and disables the search button.

---

## 8. Phased Rollout

### 8.1 V1.4 (target: 2-3 weeks from kickoff)

**Scope:**
- "Lookalikes" page with "By handle" tab
- Database schema and migration
- Apify integration
- ScrapeCreators enrichment
- "Add to library" hooks into existing pipeline
- Quotas: Free 3 / Starter 10 / Pro 20 (tracked per calendar month)
- 7-day result cache
- Quota counter badge visible on the page
- Upgrade modal when quota hit

**Out of scope for V1.4:**
- "By audience" tab (V1.5)
- Filters
- Saved searches
- Lookalike-on-lookalike
- TikTok/YouTube discovery

**Success metrics:**
- 60% of new signups try Lookalikes within first session
- 30% of Lookalike users add at least one account to their library
- Free -> Starter conversion lift: target +25%
- Starter -> Pro conversion lift: target +15%

### 8.2 V1.5 (target: month 2)

**Scope:**
- "By audience" tab activated on Lookalikes page (natural language input)
- Keyword expansion via Claude Sonnet
- ScrapeCreators Search Reels integration
- Creator handle dedup and ranking
- Pro-only feature (Free and Starter see "Upgrade to Pro to unlock")

### 8.3 V1.6 (target: month 3)

**Scope:**
- Filters: follower range, engagement rate, location, niche
- Saved searches
- Lookalike-on-lookalike (click any result card -> find more like THIS)
- "Niche match score" visible on each card (depends on Bug #58 shipping first)

### 8.4 V1.7+ (backlog)

- TikTok discovery (ScrapeCreators has TikTok lookalike-equivalent endpoints)
- YouTube discovery (lower priority, our ICP is mostly IG)
- Bulk add to library (select multiple, add all)
- Audience overlap scoring (two seed handles -> creators their audiences both follow)

---

## 9. Cursor Handoff

This section contains the prompts to paste into Cursor in order. Follow the Golden Prompt Formula: grep paths, show diffs, verify with tsc, commit, push, deploy.

### 9.1 PASTE INTO CURSOR CHAT (Step 1: Validate the Apify actor before building anything)

```
Before we build Bug #64 Creator Discovery, I need you to validate the Apify actor we plan to use.

Task:
1. Go to https://apify.com/store and search for "Instagram Related Person Scraper" or "Instagram Lookalike Scraper" or "Instagram Suggested Accounts"
2. List the top 3 actors you find that scrape Instagram's "Suggested Accounts" feature (the list shown when you click the dropdown arrow next to Follow on any IG profile)
3. For each actor, report:
   - Actor ID (format: username~actorname)
   - Last updated date
   - Run count (popularity)
   - User rating
   - Pricing model (per run, per result, monthly subscription)
   - Input parameters required
   - Output schema
4. Recommend ONE actor as the primary, ONE as the backup
5. Do NOT write any code yet. Just give me the comparison.

Output format: Markdown table.
```

### 9.2 PASTE INTO MAC TERMINAL (Step 2: Get Apify API key and set up env)

```bash
# Open Apify in browser
open "https://console.apify.com/account/integrations"

# After getting API key, add to local .env (you'll need to do this manually)
echo "APIFY_API_TOKEN=apify_api_xxxxx" >> .env.local

# Also add to Render dashboard:
# Go to https://dashboard.render.com -> service srv-d79bfrshg0os73e4lo1g
# Environment tab -> Add Environment Variable -> APIFY_API_TOKEN
```

### 9.3 PASTE INTO CURSOR CHAT (Step 3: Create the migration)

```
Bug #64 Creator Discovery. Create the database migration.

Steps:
1. Grep the drizzle directory: find the latest migration number (should be 0035 or higher per V1.3)
2. Show me the exact next migration number to use
3. Read /db/schema.ts (use sed to view the relevant section) to find where I store user_id format (varchar 50? cuid2? something else?)
4. Show me a DIFF of the new migration file at drizzle/0036_creator_discovery_v14.sql containing:
   - CREATE TABLE lookalike_searches (per Section 5.1 of PRD)
   - CREATE TABLE lookalike_results (per Section 5.1 of PRD)
   - CREATE TABLE lookalike_quota_usage (per Section 5.1 of PRD)
5. Also show DIFF for /db/schema.ts adding the Drizzle table definitions matching the SQL
6. Run npx tsc --noEmit and report any errors
7. Do NOT run drizzle-kit yet. I will run it manually after reviewing.

Verify schema matches both staging AND production before generating. We have a known schema drift issue (Bug #63) we're tracking separately.
```

### 9.4 PASTE INTO CURSOR CHAT (Step 4: Build the Apify integration module)

```
Bug #64. Build the Apify integration module.

Steps:
1. Grep /server/lib for any existing Apify code (probably none, but check)
2. Create /server/lib/apify.ts with these exports:
   - startRelatedPersonScraperRun(handle: string): Promise<{ runId: string }>
   - getRunResults(runId: string): Promise<RawLookalikeResult[]>
   - pollRunUntilComplete(runId: string, timeoutMs?: number): Promise<RawLookalikeResult[]>
3. Use the actor ID we validated in Step 1 (paste the chosen actor ID here when running this prompt: ___________)
4. Type the response strictly. Use Zod for runtime validation of Apify responses.
5. Handle errors: timeout, actor failure, network error, malformed response
6. Show me the full file DIFF before applying
7. Verify with npx tsc --noEmit
8. Do NOT commit yet, I want to review

Reference: Apify API docs at https://docs.apify.com/api/v2
```

### 9.5 PASTE INTO CURSOR CHAT (Step 5: Build the tRPC discovery router)

```
Bug #64. Build the tRPC discovery router.

Steps:
1. Grep /server/routers for the pattern used by other routers (sed view one of them, e.g. featuredAccountsRouter)
2. Create /server/routers/discovery.ts following the same pattern
3. Implement the 5 procedures from Section 6.1 of the PRD:
   - startLookalikeSearch (mutation, protected)
   - getLookalikeSearchStatus (query, protected)
   - enrichLookalikeResult (mutation, internal/system)
   - addResultToLibrary (mutation, protected)
   - getRecentSearches (query, protected)
4. Each procedure: input validation with Zod, proper error handling, return types
5. Quota check in startLookalikeSearch: read tier from user record, check lookalike_quota_usage row for this month, increment on success
6. Register the router in /server/routers/_app.ts
7. Show me DIFFs for ALL files changed
8. Verify with npx tsc --noEmit
9. Do NOT commit

Important: Use the SAME pattern for user tier checking that we use elsewhere. Grep for "tier" or "plan" to find existing usage.
```

### 9.6 PASTE INTO CURSOR CHAT (Step 6: Build the enrichment worker)

```
Bug #64. Build the enrichment worker that runs after Apify returns lookalike results.

Steps:
1. Grep /server/lib for existing ScrapeCreators integration (we know it exists for profile fetches)
2. Read the existing profile fetch function (sed view)
3. Create /server/jobs/enrich-lookalike-results.ts that:
   - Accepts a search_id
   - Fetches all lookalike_results rows with enrichment_status='pending' for that search
   - For each, calls existing ScrapeCreators profile fetch
   - Computes engagement_rate (sum of recent post engagements / followers / post count)
   - Computes recent_viral_count (reels in last 90 days with views > 100K, or 10x median if median is high)
   - Pulls 3 sample thumbnails from recent reels
   - Updates the lookalike_results row
   - On failure: retry once, then mark enrichment_status='failed'
4. Trigger this job from startLookalikeSearch immediately after Apify run completes
5. Show me DIFFs
6. Verify with npx tsc --noEmit
7. Do NOT commit

Note: Run enrichments in parallel with Promise.all but limit concurrency to 5 to avoid overwhelming ScrapeCreators.
```

### 9.7 PASTE INTO CURSOR CHAT (Step 7: Build the Lookalikes page UI)

```
Bug #64. Build the Lookalikes page frontend.

Steps:
1. Grep /client/src/pages for the existing Spy Library page (this is the closest UI pattern)
2. Read it with sed to understand the layout, card component, and styling tokens
3. Create /client/src/pages/Lookalikes.tsx with:
   - Tab navigation: "By handle" (active) and "By audience" (coming soon, disabled)
   - "By handle" tab content per Section 4.1 of PRD
   - Single input for IG handle with [Find Lookalikes] button
   - Quota badge in top right: "X of Y searches used this month"
   - Loading state with skeleton cards
   - Results grid (responsive 1/2/3/4 columns)
   - Card component matching Spy Library card style (reuse if possible)
   - Empty, error, and quota-exceeded states
4. Create /client/src/components/lookalikes/LookalikeCard.tsx
5. Update sidebar navigation to add "Lookalikes" item above "Spy Library"
6. Wire up tRPC calls: startLookalikeSearch on submit, poll getLookalikeSearchStatus until status=completed
7. "Add to library" button on each card calls addResultToLibrary mutation, shows toast, updates card state
8. Show me DIFFs for ALL files changed
9. Verify with npx tsc --noEmit and npm run build (or pnpm equivalent)
10. Do NOT commit

Style notes: Use existing CSS variables (no hardcoded colors per Bug #57 cleanup). Match dark mode tokens. Mobile-responsive.

UI copy reference:
- Sidebar nav: "Lookalikes"
- Page title: "Find lookalike accounts. Steal their viral hooks."
- CTA button: "Find Lookalikes"
- Empty state: see Section 4.1 of PRD
```

### 9.8 PASTE INTO CURSOR CHAT (Step 8: End-to-end test on staging)

```
Bug #64. Run end-to-end test on staging.

Steps:
1. Confirm we're on staging branch (git branch --show-current)
2. Commit all V1.4 work so far (don't push yet)
3. Show me the commit message you'll use (should reference Bug #64)
4. After I approve, git push origin staging
5. Wait for me to manually trigger Render deploy on staging
6. Once deployed, walk me through testing this on staging.spyreels.ai:
   - Test handle: @mikeybausch (we already use this for test scrapes)
   - Verify lookalike search starts
   - Verify Apify run completes
   - Verify enrichment populates metrics
   - Verify "Add to library" works and triggers actual scrape
   - Verify quota counter increments
7. List the 5 most likely failure points to watch for during this test
```

### 9.9 PASTE INTO CURSOR CHAT (Step 9: Production deploy)

```
Bug #64. Production deploy.

Pre-requisites (DO NOT proceed if any of these are unchecked):
- Bug #63 (schema drift) resolved on staging and production
- Production DB password rotated (was exposed in old chat history)
- V1.3 migrations (0028-0035) applied to production
- All V1.4 tests on staging passed

Steps:
1. Verify pre-requisites with me first (ask me to confirm each)
2. git checkout main
3. git merge staging
4. Show me the diff of what's about to be deployed to production
5. After I approve, git push origin main
6. Wait for me to trigger Render manual deploy on production
7. Walk me through post-deploy smoke test (same as staging test, but on spyreels.ai with my real account)
8. Monitor Sentry/PostHog for first 24 hours for any new errors
```

---

## 10. Risks and Open Questions

### 10.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Apify actor breaks (IG changes their UI) | Medium | High | Have backup actor identified in Section 9.1. Influencers.club API as last-resort fallback. |
| Instagram blocks Apify-style scraping more aggressively | Medium | High | Apify rotates proxies and handles this layer for us. If they break, we have a 3-7 day window to switch. |
| Apify pricing surprises us at scale | Low | Medium | Monitor monthly cost via PostHog dashboard. Set alerts at $200, $500 cost. |
| Users abuse free quota with throwaway accounts | Low | Low | Account creation already has email verification. Hold this for V1.5 if it becomes a problem. |
| Niche match scores are bad without Bug #58 classifier shipped first | High | Medium | Ship V1.4 without niche match score field. Add it in V1.6 after Bug #58 ships. Card just shows the other metrics. |
| Lookalike returns terrible results for very small accounts (<1K followers) | Medium | Medium | Show a warning: "Best results come from seed accounts with 5K+ followers." |

### 10.2 Open questions for Noman to decide

**RESOLVED on May 13, 2026:**
- Free quota: 3 lookalikes/month for Free, 10 for Starter, 20 for Pro. DECIDED
- Branding: "Lookalikes" as the sidebar nav and section name, "Find Lookalikes" as CTA. Same term Modash uses, so creators researching tools recognize it immediately. DECIDED

**STILL OPEN:**
1. **Pro pricing change:** Does this feature justify a Pro price increase? Recommend: no for now, validate retention first, raise later.
2. **Featured Library overlap:** If a user searches competitors of a featured account, should results exclude other featured accounts? Recommend: no, surface them anyway, they're already in our library and easy to add.
3. **Public marketing:** Should this be a blog post / Reddit announcement / Product Hunt sub-launch? Recommend: yes, but bundle with V1.4 release notes, not a separate launch. Reply to the original Reddit thread the day this ships.
4. **Free tier signup gate:** Does Free require email verification, or anonymous trial? Recommend: email verification required, to prevent throwaway abuse on the Apify cost. We already have email verification on signup, so no extra work.

---

## 11. Appendix

### 11.1 Why this is more important than Bug #55 (AI Agent)

Bug #55 matches a Meedro feature. Useful for retention. Won't drive new signups.

Bug #64 (Creator Discovery) removes the cold-start friction blocking signups from any user whose niche isn't in our curated library. That's an order of magnitude more impactful for top-of-funnel growth. Build this first, then Bug #55.

### 11.2 Comparison to Modash positioning

Modash builds for brands paying influencers. We build for creators copying influencers.

| Feature | Modash | SpyReels V1.4 |
|---------|--------|---------------|
| Discovery | AI search, filters, lookalike | Lookalike + audience search |
| Audience demographics | Yes (core feature) | No (irrelevant to our ICP) |
| Fake follower detection | Yes | No (use engagement rate instead) |
| Email/contact finder | Yes | No (we're not an outreach tool) |
| Sponsored post history | Yes | No |
| Transcribe viral reels | No | Yes (our core feature) |
| Script generation in user's voice | No | Yes (our core feature) |
| Hook/body/CTA analysis | No | Yes (our core feature) |
| **Target user** | Brand marketer | Nano/micro creator |
| **Price** | $16,200/yr API minimum | Subscription, $0 trial |

This is why Modash isn't our competitor. We're building a different product. Discovery is the on-ramp, not the destination.

### 11.3 Why pay-per-search would be a mistake

Meedro uses credit-based pricing. Users hate it because:
1. Every action feels like spending money
2. They hoard credits and don't explore
3. They churn faster when credits feel "wasted"

Subscription with quota tiers is the right call. The user pays once, then can explore freely within their tier. This is also how Modash markets to brands ("flat fee, search as much as you want").

### 11.4 Reference architecture diagrams (build in Cursor as needed)

User -> Discovery Page -> tRPC startLookalikeSearch
  -> Insert lookalike_searches row (status=pending)
  -> Call Apify startRelatedPersonScraperRun(handle)
  -> Return searchId

User polls getLookalikeSearchStatus(searchId) every 2s
  -> First poll: Apify status checked, results saved to lookalike_results (enrichment_status=pending)
  -> Background: enrich-lookalike-results job runs (ScrapeCreators profile fetch for each)
  -> Subsequent polls: returns progressive enrichment status
  -> Final state: status=completed, all results enriched

User clicks "Add to library" -> addResultToLibrary mutation
  -> Insert into featured_accounts (or equivalent)
  -> Trigger existing scrape pipeline
  -> Update lookalike_results.added_to_library=true

---

**End of PRD.**

Next action: Paste Section 9.1 into Cursor to validate the Apify actor before any code is written.
