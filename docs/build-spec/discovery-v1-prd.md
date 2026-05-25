# Discovery V1 PRD

**Status:** Ready for build
**Branch:** feat/ai-prompts-eval
**Validation commit:** cb4b7e7
**Author:** Noman Peera
**Last updated:** 2026-05-25

---

## 1. Problem

Nano and micro creators do not know which Instagram accounts to study. They open SpyReels, see the Featured Creators list, and either pick the wrong handle or bounce because no listed account matches their niche.

Current workaround is manual: open Instagram, scroll hashtags, eyeball accounts, copy handles, paste into SpyReels. High friction, kills the activation moment.

Discovery V1 collapses that into one input: the user describes their niche in plain language, SpyReels returns the top 10 most relevant creators (5K follower minimum, no upper cap) ranked descending by follower count. Each result has a Spy Now button that routes into the existing Spy Viral Reels flow with the scrape already running.

---

## 2. Goals and non-goals

### V1 goals

1. Convert a plain-language niche description into 10 ranked Instagram creators in under 90 seconds.
2. Hand off seamlessly to the existing Spy Viral Reels flow with zero re-entry of data.
3. Gate spend per pricing tier so unit economics stay positive.
4. Catch known failure mode ("I make X for Y" service businesses) at the routing step before any Apify spend.

### V1 non-goals

- No inline reels viewer inside discovery cards. Spy Now routes to the full page.
- No bulk save to Featured Creators. Per-card action only.
- No saved searches or scheduled re-runs.
- No multi-language niche descriptions (English only in V1).
- No editing of returned results before handoff.

---

## 3. Pipeline architecture

User description -> niche routing prompt -> hashtag and keyword expansion -> Apify Instagram scrape -> profile enrichment -> 5K follower minimum filter -> Haiku scoring against original description -> top 10 returned.

Validated across 6 cases on 5/24/2026. Worked on pet character (10/10 sharp, 37 scored), women 40+ supplements (10/10, 90 scored), personal finance (9/10, 55 scored), fencing and landscaping local (5/10, 78 scored). Failed on UGC creator (3-4/10, routing surfaced DTC educators instead of UGC peers) and HR software B2B (1/10, no clean creator vertical for generic B2B SaaS).

Failure pattern: "I make X for Y" service-business descriptions where routing cannot decide between peers (other X creators) or audience (Y customers).

### Mitigation: confidence gate

Niche routing prompt returns a confidence score in 0 to 1 range. If confidence is below threshold (proposed 0.65, tune after first 100 prod runs), pipeline stops before Apify spend and asks user a clarifying question:

> "Do you want creators who are like you, or creators who serve your customers?"

Two-button response. Choice is fed back into routing as additional context. Re-route, score again, proceed only if confidence passes.

If second attempt still fails, show "We could not find a clear creator vertical for this niche. Try rephrasing, or browse Featured Creators." No Apify spend.

---

## 4. Quotas and pricing

Each search costs roughly 2 to 3 dollars in Apify and Claude spend. Apify Starter plan is 49 dollars per month base.

| Tier | Searches per calendar month |
|---|---|
| Free | 1 |
| Starter | 5 |
| Pro | 20 |

Quota resets first of month UTC. Failed routings (caught at confidence gate, no Apify spend) do not consume quota. Only successful pipeline runs that return results count.

Display remaining quota in the discovery UI and on the pricing page.

---

## 5. User flow

1. User clicks Discovery in sidebar.
2. Single textarea: "Describe your niche in plain language. What do you make and who is it for?"
3. Submit button. Quota counter visible.
4. Loading state: niche routing runs (1-2 sec).
5a. **High confidence path:** Apify scrape kicks off. Loading state shows "Finding creators in your niche..." with progress indicators per pipeline stage. 60-90 sec total.
5b. **Low confidence path:** Clarifying question appears. User picks peers vs audience. Routing re-runs. If pass, proceed to 5a. If fail again, dead-end message with no quota charge.
6. Results: 10 cards in a grid. Each card shows profile photo, handle, follower count, engagement rate, niche fit score, one-line "why this match" summary, Spy Now button.
7. Spy Now click: route to /spy-reels/[handle] with scrape already triggered server-side, 365-day timeframe pre-applied. User lands on the Spy Viral Reels page with results streaming in.

---

## 6. UI components to build

- `DiscoverySearchPage` at `/discovery`
- `NicheDescriptionInput` (textarea, submit, character limit 500)
- `QuotaCounter` (reused from existing quota patterns)
- `ConfidenceGateModal` (peers vs audience clarifying question)
- `DiscoveryResultsGrid` (10 cards)
- `DiscoveryResultCard` (profile photo, stats, Spy Now button)
- `DiscoveryLoadingState` (per-stage progress: routing -> scraping -> enriching -> scoring)
- `DiscoveryDeadEndMessage` (low confidence x2)

Sidebar entry: "Discovery" with magnifying-glass icon, below "Featured Creators."

---

## 7. Backend

### tRPC procedures (`server/routers/discovery.ts`)

- `discovery.routeNiche` — input: description string. Output: `{ routedNiche, confidence, hashtagsToSearch, keywordsToSearch }`. No quota charge.
- `discovery.clarifyRouting` — input: original description, peers-or-audience choice. Output: same shape as routeNiche, re-scored.
- `discovery.runFullPipeline` — input: routed niche payload. Output: 10 scored creators. Charges quota on success.
- `discovery.getQuota` — output: `{ used, limit, resetsAt }`.

### Existing modules to reuse

- `scripts/test-discovery-pipeline.ts` — already validated, lift the core pipeline into `server/discovery/pipeline.ts` and import.
- Apify Instagram scraper client (already configured).
- Haiku scoring prompt (already validated).

### New modules

- `server/ai/prompts/niche-routing.ts` — returns confidence score. Add the "make X for Y" rule from yesterday's failure analysis.
- `server/discovery/quota.ts` — read and write `discovery_searches` table.

### Database schema

```sql
CREATE TABLE discovery_searches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  description_text VARCHAR(500) NOT NULL,
  routed_niche VARCHAR(255),
  routing_confidence DECIMAL(3,2),
  clarified BOOLEAN DEFAULT FALSE,
  result_count INT,
  apify_cost_usd DECIMAL(6,2),
  claude_cost_usd DECIMAL(6,2),
  succeeded BOOLEAN NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_month (user_id, created_at)
);

CREATE TABLE discovery_results (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  search_id BIGINT NOT NULL,
  rank_position INT NOT NULL,
  instagram_handle VARCHAR(255) NOT NULL,
  follower_count INT,
  engagement_rate DECIMAL(5,2),
  niche_fit_score DECIMAL(3,2),
  why_match_summary VARCHAR(500),
  FOREIGN KEY (search_id) REFERENCES discovery_searches(id) ON DELETE CASCADE
);
```

Quota check: `SELECT COUNT(*) FROM discovery_searches WHERE user_id = ? AND succeeded = TRUE AND created_at >= first-of-month-UTC`.

---

## 8. Spy Now handoff contract

Route: `/spy-reels/[handle]?source=discovery&timeframe=365d&autorun=true`

Existing Spy Viral Reels page detects `autorun=true` and `source=discovery`, kicks off scrape immediately on mount, applies 365-day filter without user input.

If the handle has been scraped within the last 24 hours, show cached results instantly.

---

## 9. Open questions before build

1. Confidence threshold of 0.65 is a guess. Tune after first 100 production runs. Add Posthog event `discovery_routing_confidence` capturing the score per search so we can analyze the distribution.
2. Quota reset semantics: first of month UTC, or rolling 30 days? PRD says first of month, confirm before Cursor builds it.
3. Failed routings consuming quota: PRD says no. Confirm this is the desired behavior, since a sophisticated user could repeatedly fail and never spend quota. Risk is low (we cap on Apify side too) but worth flagging.
4. Free tier 1 search per month: should we offer a one-time free trial of 3 searches at signup to drive activation, then drop to 1 per month? Not in scope for V1 but worth deciding before launch.

---

## 10. Known technical debt to track

1. Niche routing prompt does not yet have the "make X for Y" rule. Must be added in `server/ai/prompts/niche-routing.ts` before this ships.
2. Pipeline currently lives in `scripts/test-discovery-pipeline.ts`. Lift into production module before wiring tRPC.
3. Generic B2B SaaS niches (HR software case) have no clean creator vertical. Confidence gate catches this, but we should add a separate "no creator vertical exists for this niche" detection path so we do not confuse users with peers-vs-audience question when the real answer is "this niche has no creators."

---

## 11. Build sequence

1. Lift pipeline from `scripts/test-discovery-pipeline.ts` into `server/discovery/pipeline.ts`. Verify with `pnpm tsc --noEmit`.
2. Update `niche-routing.ts` prompt: add confidence score output, add "make X for Y" rule, add "no creator vertical" detection.
3. Create migration for `discovery_searches` and `discovery_results` tables. Apply to staging first.
4. Build tRPC procedures.
5. Build UI components in order: DiscoverySearchPage -> NicheDescriptionInput -> DiscoveryLoadingState -> ConfidenceGateModal -> DiscoveryResultsGrid -> DiscoveryResultCard -> DiscoveryDeadEndMessage.
6. Wire Spy Now button: `/spy-reels/[handle]?source=discovery&timeframe=365d&autorun=true`. Update Spy Viral Reels page to handle autorun param.
7. Wire quota check on every `runFullPipeline` call.
8. Test full flow on staging with 3 niches: one high-confidence (pet character), one low-confidence triggering clarifying question (UGC creator), one dead-end (HR software).
9. Apply migration to production.
10. Ship behind a feature flag (DISCOVERY_V1_ENABLED env var) for first 48 hours so we can disable instantly if Apify spend goes sideways.

---

## 12. SEO and GEO

Discovery page is logged-in only. No public SEO surface in V1.

Future V2 could expose results pages publicly at `/discovery/[niche-slug]` with programmatic SEO, but this is out of scope for V1.

---

## 13. Success criteria

V1 ships when:

- All 6 original test cases produce equivalent or better results through the production pipeline as they did through the script.
- Confidence gate fires on UGC creator and HR software cases.
- Quota enforcement verified across all three tiers.
- Spy Now handoff works on staging end-to-end.
- Feature flag tested in both states.

First week post-launch metrics to track in Posthog:

- Discovery search rate per active user
- Confidence gate trigger rate
- Clarification path success rate (peers vs audience picked correctly)
- Dead-end rate
- Spy Now click-through rate
- Average Apify cost per successful search
