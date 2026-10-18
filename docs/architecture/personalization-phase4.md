# Personalization Phase 4: provider cost protection and the suggestion engine

Status: migration gate still CLOSED. Nothing here is connected to the running app. Both feature flags stay OFF.

## 1. Production preflight

Blocked: this environment has no authorized production connection (no database URL, no Railway access). The preflight tool cannot run from here. Verified: no `0103+` migration in any of 166 branches or 128 PR heads (2026-10-16). Required next: someone with production access runs `PREFLIGHT_DATABASE_URL='<read-only URL>' pnpm exec tsx scripts/personalization-preflight.ts`.

## 2. Provider cost protection

| Control | Where | Value (provisional) |
|---|---|---|
| Paid requests per attempt, counted inside the integrations (incl. their own retries) | `server/scrapeCreatorsMeter.ts`, 2 lines in each `scGet` (instagram, tiktok, youtube) | 25 |
| Posts per fetch | existing `maxReels` / `maxVideos` option | 150 |
| Provider attempts per logical run (durable retries + user "try again"), persisted on the run | `runProfileAnalysis.ts`, `profile_analysis_runs.providerAttempts` | 3 |
| Automatic durable attempts per enqueue (leaves one user retry) | `PROFILE_ANALYSIS_MAX_ATTEMPTS` | 2 |
| Request budget hit | not retried (would spend again) | n/a |
| Crash after fetch | snapshot reused, no refetch | n/a |
| Duplicate requests | unique run keys + one active run per profile + idempotent enqueue | n/a |
| User refresh | 60-minute cooldown + usage check | unchanged |
| Background refresh | OFF (7-day interval documented only) | unchanged |

The meter is a no-op outside an analysis (every existing flow is unchanged; 41 existing provider test files pass). Each attempt records outcome, requests, blocked requests, HTTP status counts and estimated cost (`SCRAPECREATORS_USD_PER_CREDIT`, default $0.002 per request, same convention as discovery and Viral Posts).

Worst case per run: 3 attempts x 25 requests = 75 requests = $0.15. Typical: one attempt.

### Credits: DECISION NEEDED (not implemented)

Recommendation: profile analysis should NOT consume `scrapeCount` research credits.

- Initial analysis: included, once per linked account (it is part of onboarding; charging it would penalize signup).
- User refresh: its own small allowance (for example "profile refreshes per month" per plan) plus the 60-minute cooldown, shown separately from research credits so customers never see onboarding eat their research.
- Cost impact: at most $0.15 per run (worst case), typically a few cents; AI suggestions add about $0.025 per full onboarding on the default model (estimated pricing from `aiCostModel`; prompt sizes are estimates).

This is a new usage policy, so it needs CEO approval. Until then the request service keeps `checkUsage` / `recordUsage` as injected hooks and nothing is charged or wired.

## 3. Suggestion engine (Goal -> Audience -> Pillars)

Files: `server/personalization/intelligence/{evidence,guards,structuredLlm,goalInference,audienceRecommendations,pillarRecommendations,recommendationService}.ts`.

- AI: the existing `invokeLLM` (default model routing + fallback, internal retries, deadline, PostHog usage via `operation` labels) and the existing `withAiFormattingRules`. No new provider.
- Evidence: public name and bio, analysis-snapshot captions, top posts by real views (only with 5+ posts that have views), the user's own confirmed answers. Strength: none / weak / moderate / strong.
- Untrusted text: bios and captions are wrapped in `<creator_evidence>` and the system prompt says to never follow instructions inside it.

### Goal ("Why you create")
- Purpose, not a summary. One sentence, max 18 words, starts with a verb.
- No evidence: no model call; asks the user. Weak evidence + low confidence: asks the user. Ambiguous: the model's own clarifying question.
- Rejected and repaired once: invented numbers, invented names, more than one sentence, and a business objective without commercial evidence (a storyteller cannot get "grow my business").
- Confidence is capped by evidence strength. A confirmed goal is never regenerated.

### Audience ("Who you want to reach")
- Needs a confirmed goal. 1 to 3 intended segments with a "why". Never assumes current viewers; observed audience is `null` (public data has none).
- Demographic attributes rejected unless the evidence or goal mentions them. Confirmed audiences are not repeated.

### Pillars ("What you'll create")
- Needs a confirmed goal and audience. 3 to 5 strategic pillars, each with how it serves the goal and audience.
- Past top posts are context only ("do not relabel past topics"). No numbers or performance claims; `viewSharePercent` is always null.

### Dependencies
- Each AI row stores `basedOnInputsHash` (confirmed inputs it used). Audience depends on goal, brand description, niche. Pillars also depend on audience.
- Goal edit: old goal superseded (history), audience and pillar suggestions stale, confirmed audiences and pillars kept but flagged for review (`recommendationReview`), new proposals generated.
- Audience edit: only pillars stale; audience suggestions are not regenerated.
- Writes are compare-and-write: if the user edits inputs (or confirms their own goal) while the model runs, the result is discarded.

### Reliability and cost
- Structured JSON schema output, zod shape check, deterministic guards, one repair attempt, 25-second deadline, failure kinds `timeout` / `invalid_output` / `llm_unavailable`.
- Cache: suggestions for the same inputs (live, confirmed or dismissed) are reused with no model call; this also makes retries and resumed jobs idempotent.
- Usage: tokens, model, prompt version, attempts and estimated cost on every AI row (`generationMeta`), plus existing PostHog reporting.
- Confirmed data never depends on AI: failures change nothing and every step can be completed by typing.

### Quality evaluation (not run)
Tests use a scripted model, so they prove the rules, not the wording quality. A live evaluation against the real model needs the production Anthropic key and spends money, so it was not run. Proposed: 30 fixture creators (business, coach, entertainment, travel, beginner, private, multilingual) scored on purpose-vs-summary, no invented facts, and clarification rate, before the flag is turned on.

## 4. Schema additions (draft only)

`profile_analysis_runs.providerAttempts`; `personalization_items.basedOnInputsHash`, `confidence` (CHECK: AI rows only), `generationMeta`. Still unnumbered; verified on local MySQL 8.0.

## 5. Needs approval

1. Profile-analysis allowance vs research credits (section 2).
2. Provisional limits: 25 requests per attempt, 150 posts, 3 attempts per run.
3. The small change to the three provider integrations (meter hook, no-op by default).
4. Running a paid live-model evaluation.
5. New durable job type `personalization_recommendations` (contract only, not registered).
