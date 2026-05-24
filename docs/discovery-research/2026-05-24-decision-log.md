# Discovery Architecture Decision Log

**Date:** May 24, 2026
**Decision:** Build discovery pipeline on Apify, not Modash
**Decided by:** Noman Peera
**Branch:** feat/ai-prompts-eval

## What we tested today

1. Niche routing prompt across 52 real-world business descriptions (47/52 passing)
2. Apify Instagram Hashtag Scraper across 6 diverse niches (5 of 6 produced usable pools)
3. AI scoring layer on top of Apify results using Haiku 4.5 (+0.7 average improvement)
4. Modash trial signup and 5 real searches across the same niches

## Side-by-side results on identical niches

| Niche | Apify result | Modash result |
|---|---|---|
| BJJ competitors | 1-2 of 4 sharp, most under 2K followers | 4 of 4 sharp, all 10K-32K followers |
| B2B beauty brand owners | 0 of 4 (suppliers caught) | 0 of 4 (consumer influencers caught) |
| Restaurant creators | Not retested | Strong results per Noman observation |

## Why Apify wins for SpyReels at current scale

1. Cost: ~$30/month at 50 paid users versus $1,350/month flat for Modash
2. Moat: Cache compounds with every user search; we own the database over time
3. Quality gap is acceptable: 60-70% of Modash quality on B2C, both fail on B2B
4. Speed to ship: 2-4 weeks of Cursor work
5. Reversible: We can switch to Modash later if traction proves it out

## Why Modash would have been right if cash were no object

1. Pre-built 350M profile database (we cannot replicate this in 2026)
2. AI semantic search that genuinely works on B2C niches
3. Engagement rate, brand collabs, fake follower detection pre-computed
4. Audience demographics estimation (genuinely impossible without sampling infrastructure)
5. Ship in 2 days instead of 4 weeks

## What Modash cannot solve that we can

1. B2B niches where supplier and buyer share vocabulary
2. Format-based niche matching (pet character accounts, viral hook formats)
3. Custom scoring criterion tuned for "creator a user should STUDY" not "creator a brand should HIRE"

These are real product opportunities for SpyReels that justify building our own pipeline.

## The architecture we will build

Five-layer pipeline:

1. **Niche routing** (DONE on May 22, 47/52 passing)
2. **Apify hashtag discovery** with 50-100 candidates per niche
3. **Profile enrichment** via second Apify call for bio, follower count, recent posts (the missing piece from today's test)
4. **Hard filter** for follower band (5K-500K), language, active in last 90 days
5. **AI scoring** on bio + 5 captions with revised scoring criterion that includes adjacent businesses, not just same-audience creators

Plus database tables to cache discovered creators per niche so the cache compounds across users.

## Cost projection

At 50 paid users per month searching 5 times each:
- Apify hashtag scraper: $5
- Apify profile enrichment: $25
- Anthropic Haiku scoring: $5
- Total: ~$35/month

Cache hit rate after 3 months should reach 60%+, dropping marginal cost to ~$15/month at the same volume.

At 500 paid users per month, expected cost is ~$150-300/month depending on cache hit rate. Still meaningfully cheaper than Modash flat $1,350/month.

## Modash reconsideration trigger

Re-evaluate Modash when ANY of these conditions hold:

1. SpyReels reaches 500+ active paid users
2. Discovery becomes the primary feature driving retention (PostHog will show this)
3. Users explicitly demand audience demographics filter
4. We try to expand to enterprise tier where $16K/year is reasonable cost-of-goods

## Cancellation note

Modash trial will be cancelled before auto-bill. Screenshots from the trial saved to discovery-research folder as competitive intelligence.

## Next steps

1. Cancel Modash trial today
2. Tomorrow or next session: draft full production PRD at docs/build-spec/discovery-v1-prd.md
3. Begin building the 5-layer pipeline once PRD is approved

