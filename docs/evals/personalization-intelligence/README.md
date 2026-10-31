# Personalization engine evaluation (Phase 4B)

## Status: REAL-MODEL EVALUATION BLOCKED

The real model was NOT run. This environment has no authorized `ANTHROPIC_API_KEY`, which the production AI client (`server/_core/llm.ts`) requires. No scripted or substitute answers were used to produce quality scores, and no quality score exists yet.

What is ready: the 30-case set, a $5-capped runner on the production path, automated gate checks, a scoring sheet, and deterministic findings that did not need the model (below).

Run it (someone with an authorized test key):

```
ANTHROPIC_API_KEY=<authorized test key> pnpm exec tsx scripts/personalization-intelligence-eval.ts --confirm-spend
```

Output: `docs/evals/personalization-intelligence/run-<timestamp>.json` and `.md` (synthetic data only, no keys written). Reviewers then fill the rubric columns in the `.md`.

## Evaluation set (30 synthetic profiles)

All profiles are synthetic, written for this evaluation (`server/personalization/intelligence/eval/fixtures.ts`). They do not describe real accounts. No scraping was used.

Columns: posts (`private` = no access), expected commercial intent, whether the engine must / may / should not ask to clarify, evidence strength and commercial detection as computed by the engine.

| Case | Category | Platform | Posts | Language | Commercial | Clarify | Evidence | Detected commercial |
|---|---|---|---|---|---|---|---|---|
| RL-01 | restaurant_local | instagram | 15 | English | yes | no | strong | yes |
| RL-02 | restaurant_local | tiktok | 12 | English | yes | no | strong | yes |
| RL-03 | restaurant_local | instagram | 3 | English | yes | no | moderate | yes |
| RL-04 | restaurant_local | instagram | 0 | English | yes | allowed | weak | yes |
| RL-05 | restaurant_local | youtube | 14 | English | yes | no | strong | yes |
| FH-01 | fitness_health | instagram | 15 | English | yes | no | strong | yes |
| FH-02 | fitness_health | tiktok | 11 | English | no | no | strong | no |
| FH-03 | fitness_health | instagram | 13 | English | no | allowed | strong | no |
| FH-04 | fitness_health | youtube | 2 | English | yes | no | weak | yes |
| PB-01 | personal_brand | instagram | 15 | English | yes | allowed | strong | yes |
| PB-02 | personal_brand | tiktok | 12 | English | no | allowed | strong | no |
| PB-03 | personal_brand | instagram | 13 | English | yes | no | strong | yes |
| PB-04 | personal_brand | youtube | 2 | English | no | allowed | weak | no |
| EN-01 | entertainment | tiktok | 15 | English | no | no | strong | no |
| EN-02 | entertainment | instagram | 14 | English | no | no | strong | no |
| EN-03 | entertainment | youtube | 12 | English | no | allowed | strong | no |
| EN-04 | entertainment | tiktok | 2 | English | yes | allowed | weak | yes |
| TL-01 | travel_lifestyle_family | youtube | 14 | English | no | no | strong | no |
| TL-02 | travel_lifestyle_family | instagram | 13 | English | no | no | strong | no |
| TL-03 | travel_lifestyle_family | tiktok | 12 | English | no | allowed | strong | no |
| TL-04 | travel_lifestyle_family | none | private | English | no | allowed | weak | no |
| ES-01 | education_services | instagram | 14 | English | no | no | strong | no |
| ES-02 | education_services | tiktok | 12 | English | yes | no | strong | yes |
| ES-03 | education_services | youtube | 3 | English | yes | no | moderate | yes |
| SN-01 | small_new | instagram | 0 | English | no | required | none | no |
| SN-02 | small_new | tiktok | 2 | English | no | required | weak | no |
| SN-03 | small_new | instagram | 2 | English | no | allowed | weak | no |
| AM-01 | ambiguous_multilingual | instagram | 12 | Spanish | yes | no | strong | yes |
| AM-02 | ambiguous_multilingual | tiktok | 9 | English | no | allowed | moderate | no |
| AM-03 | ambiguous_multilingual | instagram | 5 | English | no | required | moderate | no |

Mix: 5 restaurant/local, 4 fitness/health, 4 personal brand, 4 entertainment, 4 travel/lifestyle/family, 3 education/services, 3 small/new, 3 ambiguous/multilingual. Includes zero posts, under 10 posts, established histories, a private account, Spanish and mixed-language bios, commercial and non-commercial, short and long bios.

## Rubric (human reviewers, per case)

| Dimension | Max |
|---|---:|
| Goal accuracy and relevance | 25 |
| Audience targeting quality | 20 |
| Strategic pillar quality | 25 |
| Specificity and personalization | 15 |
| Clarity and scannability | 10 |
| Evidence discipline | 5 |
| **Total** | **100** |

Acceptance gates: mean of at least 85, at least 27 of 30 cases at 75 or more, zero unsupported commercial goals, zero invented statistics, zero confirmed values overwritten. The runner checks the last three (and clarification behavior, segment and pillar counts) automatically; the scores need reviewers.

## Deterministic findings (no model needed)

These come from running the engine's evidence layer over the set. They are real measurements of code, not of AI quality.

1. **Commercial-intent detection misclassified 6 of 30 profiles** with the original flat keyword list over all text (captions like "hire" or "business" in non-commercial contexts, affiliate "link in bio").
   - Root cause: keyword matching over captions.
   - Fix: offers are detected only in bio, brand description and display name, with offer-shaped patterns; affiliate wording is excluded. Result on the 30 fixtures: 0 mismatches.
2. **Overfitting check on 15 held-out sentences** (never used for tuning): the regex fast path caught 0 of 8 unseen offers (for example "Now taking new clients", "Walk-ins welcome") while making 0 false positives on 7 non-commercial bios.
   - Root cause: a keyword list cannot cover open-ended offer phrasing.
   - Fix (two layers): the regex stays as a precise fast path; the model may unlock a business goal only by quoting the creator's own words (`offer_quote`), which must be verbatim in bio/brand/name AND contain offer language.
   - Measured on the held-out set: all 8 real offers are unlockable by their own words; no phrase in any of the 7 non-commercial bios can unlock one (exhaustive check of every 2 to 8 word window); invented or non-offer quotes fail. Tests: `server/personalization/intelligence/offerDetection.test.ts`.
   - Residual risk: the quote path depends on the model choosing to quote; a real-model run must confirm recall.

## Cost projection (estimated, not measured)

- Worst case per creator: $0.096 (3 steps x 2 attempts, about 2.5k input tokens and each step's max output on the default model). Worst case for all 30: about $2.88, under the $5 cap.
- The runner checks the cap before every case and stops early if the next case could exceed it.
- Prices come from `server/analytics/aiCostModel.ts`, which marks these models as estimated pricing. Real cost and latency will be recorded by the run.

## Isolation

The evaluation makes no provider (ScrapeCreators) calls, writes no database rows and touches no research credits. The provider meter (`server/scrapeCreatorsMeter.ts`) is a no-op outside a profile analysis; the creator-discovery call fuse and research credit flows are unchanged (their existing tests pass).

## Baseline run: synthetic profiles plus real customer replays

`.github/workflows/personalization-baseline-eval.yml` scores today's code on the 30 synthetic profiles and on real SpyReels customers replayed from their stored public profile data.

- Runs only on `claude/personalization-baseline-eval`, only when the commit message contains `[authorized-baseline-eval]`.
- Real customers are read with `EVAL_DB_READONLY_URL`, a SELECT-only login limited to `social_profiles`, `profile_analysis_runs`, `personalization_items` and `personalization_progress`. The export refuses a login with any write grant.
- Customer cases exist only in a runner temp file that is deleted at the end of the job. Logs use anonymized ids (R001, N001).
- Spend caps: synthetic $1.20 generation + $0.30 judging, real $3.80 generation + $0.70 judging.
- Review: the "results" steps print one line per case and the totals (`scripts/personalization-eval-digest.ts`).
