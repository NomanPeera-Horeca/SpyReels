# Apify Discovery Validation — Run 1

**Date:** May 24, 2026
**Cost:** $0.48 total Apify spend (well under $5 monthly free credit)
**Branch:** feat/ai-prompts-eval
**Script:** scripts/test-apify-discovery.ts
**Raw data:** scripts/apify-test-results.json (gitignored)

## Purpose

Validate whether Apify Instagram Hashtag Scraper can find sharp creators when fed audience keywords and hashtags derived from our niche routing prompt. This is the second layer of the SpyReels discovery pipeline:

1. User types business description in natural language (LAYER 1 — niche routing prompt, validated May 22, 47/52 cases passing)
2. Niche routing extracts audience keywords (LAYER 2 — this report tests whether those keywords find real creators)
3. AI scoring re-ranks candidates by audience fit (LAYER 3 — next test)
4. Top scored creators shown to ul pool cached (LAYER 4 — production)

## Setup

Tested 6 niches against Apify Instagram Hashtag Scraper (apify/instagram-hashtag-scraper) and Instagram User Scraper (apidojo/instagram-user-scraper). User scraper failed on all 6 cases with HTTP 400 due to schema mismatch. Hashtag scraper succeeded on all 6.

Each niche was tested with 2 hashtags, 30 results requested per case.

## Results by niche

### 1. BJJ competitors at brown and black belt level

**Hashtags tested:** #bjjcompetitor, #nogi
**Candidates returned:** 54 total, top 10 manually reviewed
**Sharp candidates in top 10:** 6-7

Examples of sharp matches:
- @j.mckee_bjj — "12 days until Worlds. Final stretch of training"
- @daisyt_bjj — real competitor talking about belt journey
- @anais_samuraigirl — competitor with coach mom
- @pa_blo554 — Spanish competitor with medal placements
- @rivalryjiujitsu — competition gym
- @oregongrapplingarts — gym posting tournament results

**Verdict:** Strong signal. Custom mouthguard brand would finrs useful.

### 2. Perimenopausal women lifting weights

**Hashtags tested:** #perimenopause, #womenover40
**Candidates returned:** 48 total, top 10 manually reviewed
**Sharp candidates in top 10:** 7

Examples of sharp matches:
- @reshthemenopausedoctor — literally the menopause doctor
- @leslieannofficial — GIRL Talk for women in their 40s
- @iamninafancourt_ — Rebuilding myself in my 40s
- @isthisnormal.midlife — midlife focused
- @plt_health — protein and cortisol content
- @she_rises365 — low-impact fitness for older women

**Verdict:** Strongest signal of all 6 tests. Supplement brand for menopausal women would find this pool gold.

### 3. Beauty brand owners sourcing wholesale (B2B)

**Hashtags tested:** #beautybrandowner, #privatelabelbeauty
**Candidates returned:** 42 total, top 10 manually reviewed
**Sharp candidates in top 10:** 1

All other 9 candidates were SUPPLIERS targeting brand owners:
- @logosbytony — logo designer selling to beauty brands
- @makeup_brushes_factory — manufi_packaging — packaging supplier
- @ulinkmetal — metal component supplier
- @tymkhealth_official — skincare manufacturing service
- @bbinnovation_latam — packaging service
- @s_jolu_ — supplier
- @makeup_snake94 — supplier with MOQ
- @intobeauty.swiss — appears to be a brand but unclear positioning

**Verdict:** Critical failure. The hashtag #beautybrandowner is used BY suppliers TARGETING brand owners, not BY brand owners themselves. We caught the wrong side of the marketplace.

**Root cause:** In B2B niches where suppliers and buyers share vocabulary, hashtag-based discovery picks up the loudest party which is usually the supplier doing marketing.

### 4. Houston parents looking for childcare

**Hashtags tested:** #houstonmom, #houstonparents
**Candidates returned:** 54 total, top 10 manually reviewed
**Sharp candidates in top 10:** 4-5 parents plus 4 local businesses targeting parents

Examples of sharp parent matches:
- @adanniaajao — postpartum with 2 under 2
- @kabsykreations — mom bui@allienicholsphotography — maternity photographer in Houston
- @rebekahmemusic — family of 8 content
- @achani_weerasinghe — Houston family content

Examples of local businesses (useful for studying competitor content patterns):
- @wolfiesswimschool — Houston swim school for kids
- @learningexpresshouston — toy store
- @tinysteps2health — pediatric service
- @littleeaters_talkers — feeding therapy

**Verdict:** Medium signal but actually more useful than first appeared. Even the businesses produce content aimed at the same buyer. A daycare in Houston could study both groups.

### 5. Golden retriever character format

**Hashtags tested:** #goldenretriever, #dogsofinstagram
**Candidates returned:** 57 total, top 10 manually reviewed
**Sharp candidates in top 10:** 5

Examples of sharp matches:
- @adventuringbailey — golden retriever character account
- @fibi.thegoldengirl — golden girl character
- @rowanthegoldenboy — golden boy character
- @golden_retriever_express — golden retriever thmain character energy" canine

Mixed with breeders and non-golden dogs.

**Verdict:** Medium signal. Format-matching (character account with voice captions) is harder than topic-matching because Instagram does not have a hashtag for format. #dogsofinstagram is too broad.

### 6. Independent restaurant owners and operators

**Hashtags tested:** #restaurantowner, #restaurantbusiness
**Candidates returned:** 48 total, top 10 manually reviewed
**Sharp candidates in top 10:** 4-5

Examples of sharp matches:
- @chefanujwadhawan — visited 6 cities talking to restaurants
- @moanwary — explicit restaurant marketing creator
- @restroflowai — "87% of restaurants fail" content
- @foodhub.io — restaurant SaaS targeting operators
- @sulka_g1 — restaurant operations content

Mixed with aggregators and franchise pitches.

**Verdict:** Medium signal. The niche has both real operators and many B2B services targeting operators in the same hashtag pool.

## Summary

| Niche | Sharp / 10 | Verdict |
|---|---|---|
| BJors | 6-7 | Strong |
| Perimenopause | 7 | Strongest |
| Houston parents | 4-5 + 4 businesses | Medium |
| Golden retriever | 5 | Medium |
| Restaurant owners | 4-5 | Medium |
| B2B beauty brushes | 1 | Critical failure |

5 of 6 niches return 40-70% sharp candidates in top 10. With AI scoring on top of a larger pool (50-100 candidates per niche), we can extract the sharp ones reliably.

1 of 6 niches (B2B beauty brushes) catastrophically failed because supplier hashtags overlap with buyer hashtags.

## Key insights

**Insight 1: Apify discovery works for B2C and consumer niches.**

The hashtag scraper returns enough sharp candidates in a pool of 30-50 that an AI scoring layer can extract the right ones for the user. We do not need a different discovery engine for consumer niches.

**Insight 2: Top-N by Instagram default sort is wrong.**

Instagram sorts by engagement and recency. This favors brands with marketing budget and people who tagged a post for visibility. Sharp creators who consistently target the niche rank LOWER in this sort. Our ranking must come from AI scoring of bio + caption consistency, not from Apify default order.

**Insight 3: B2B niches need a different hashtag strategy.**

When the BUYER is a business owner, they do not necessarily tag their content with the supplier-target hashtags. Beauty brand founders post under #foundedbyme, #beautypreneur, #brandbuilding, not under #beautybrandowner (which suppliers use to find them).

Solution path: a small additional prompt that takes the audience keywords AND business_type from niche routing, and outputs:
- Hashtags the BUYER uses in their own content (search these)
- Hashtags SUPPLIERS use targeting this buyer (do NOT search these)

This prompt has not been built yet. Queued for after the scoring layer is validated.

**Insight 4: Local geo niches surface both customers AND competitor businesses.**

Houston test returned both parents and local Houston businesses targeting parents. Both groups are useful because the businesses produce content patterns a new local business could learn from. The AI scoring prompt should not penalize this. It should detect both as relevant.

## Decisions made

1. Proceed to build AI scoring layer (LAYER 3) on top of current Apify results.
2. B2B hashtag generation deferred to v2. The 5 of 6 B2C niches working is sufficient validation to move forward.
3. Discovery pool size will be 50-100 candidates per niche (not 10), to give scoring more material to filter.

## Next steps

1. Build standalone scoring prompt test at scripts/test-discovery-scoring.ts
2. Feed it the full BJJ pool from this test (54 candidates) plus the original user business description
3. Verify scoring prompt re-ranks candidates so the sharp ones rise to top 5-10
4. If scoring works, design the production pipeline schema and PRD

## What this does not test

- TikTok or YouTube discovery (Instagram only)
- Apify reliability over time (one snapshot today, might drift)
- Cost at scale (this test was 6 niches at $0.48; need to model 1000 niches per month)
- The User Scraper actor (failed with schema error, can be debugged later if we want to compare to hashtag-only)
- Whether cached discovery results stay fresh enough week over week

