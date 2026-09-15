# Viral Posts reliability rollout

This document is the production contract for the Viral Posts `For You` feed. It exists to prevent a recurrence of the September 14 failure mode where a large candidate universe collapsed to an empty daily feed.

## Product invariants

1. A large raw candidate universe must never silently collapse to zero without a reason-coded ranking funnel event.
2. The strong quality bar stays at `0.55`. A bounded fallback band down to `0.45` may fill only the minimum five-slot feed. It must never pad a healthy strong feed to seven.
3. Hidden, dismissed, recently shown, duplicate, or creator-diversity-rejected posts may not be resurrected by fallback.
4. Recovery decisions are based on the post-ranking eligible count, not the raw candidate count.
5. Provider discovery is proactive infrastructure work. The normal page request must not be the primary mechanism that keeps shared pools warm.
6. Provider budgets and DB-backed refresh leases remain the source of truth for refresh safety.
7. Personalization sources are additive. Failure of Creator Radar or another private source must degrade to the shared pool rather than taking down the feed.

## Proactive pool refresh

Run `scripts/viral-posts-pool-refresh.ts` as a dedicated production scheduler, not inside the web dyno.

Recommended Render Cron configuration:

- branch: the same release commit as production
- schedule: hourly (`0 * * * *`)
- build command: `pnpm install --frozen-lockfile`
- start command: `pnpm tsx scripts/viral-posts-pool-refresh.ts`
- `VIRAL_POSTS_REFRESH_BATCH_SIZE=4`
- use the same database/provider environment group as the production web service

The job intentionally calls `refreshStalePools()`. That path already enforces freshness checks, daily provider-call budgets, unsupported-platform guards, and per-pool DB leases. Do not bypass those controls with a second scheduler implementation.

Do not enable `VIRAL_POSTS_POOL_REFRESHER=true` on the production web service once the dedicated scheduler is live. There should be one scheduling model and one source of truth.

## Ranking observability

Every initial assembly and refreshing-feed upgrade emits `[viralPosts] ranking_funnel` with non-content diagnostics:

- candidate universe size
- finite score count
- candidates at or above the strong floor
- candidates at or above the fallback floor
- hidden / dismissed / recently shown counts
- core metric completeness
- missing follower count
- platform counts
- p50 / p75 / p90 / max final score
- selected strong / fallback / total counts

No captions, transcripts, or private user content should be added to this event.

Production alert target:

- critical: `candidateUniverse >= 20 && selectedTotal == 0`
- warning: `candidateUniverse >= 20 && selectedTotal < 5`
- warning: fallback selections are required for more than 20% of daily feed assemblies over a rolling day

## Service-level objectives

Initial production targets:

- empty healthy-user daily-feed rate: < 1%
- active-user feeds with at least five eligible picks before normal usage: >= 95%
- warm daily-feed assembly p95: < 3 seconds
- provider work on normal cached feed request: zero
- duplicate exact video in Today's Picks during the suppression window: zero

These are release gates, not vanity metrics. If the system cannot meet them, investigate the funnel before changing thresholds.

## Creator Radar schema preflight

Viral Posts reads `creator_discovery_searches.resultJson` and `createdAt`. The canonical migration is `drizzle/0058_creator_discovery.sql`.

Production currently does not run `pnpm db:push` as part of the Render web build, so schema state must be verified before enabling Creator Radar personalization as a reliability dependency. Do not blindly run the entire migration history against production to fix one missing table.

Release procedure:

1. inspect the production migration journal / schema state;
2. confirm whether migration `0058_creator_discovery.sql` is applied;
3. if missing, apply the intended migration through the normal controlled database migration path;
4. verify a read from `creator_discovery_searches` succeeds;
5. confirm production logs no longer emit `source_failed` for `creator_radar`;
6. only then count Creator Radar toward personalization coverage SLOs.

Until that is verified, Creator Radar stays fail-open and the shared pool remains authoritative.

## Rollout order

1. Targeted Viral Posts unit/regression tests must pass.
2. Global project check/build must pass, or any pre-existing unrelated failure must be documented and separately cleared before merge.
3. Deploy the feature branch to an isolated staging environment that points at safe staging data/provider budgets.
4. Exercise: strong feed, fallback feed, zero-under-fallback feed, hidden/dismissed/recently-shown suppression, repeated Check again, provider failure, and concurrent refresh.
5. Run the stored-supply benchmark and inspect score distribution before/after.
6. Release application code.
7. Create/enable the dedicated pool-refresh scheduler on the same release commit.
8. Watch ranking-funnel and pool-refresh logs for at least one full refresh cycle before considering the incident closed.

## Rollback

If fallback quality is visibly poor, revert the tiered selector commit or set selection back to strong-only in code. Do not disable pool leases, budgets, or suppression to increase feed size.

If the scheduler causes provider spend or latency anomalies, disable the cron job. The web app will continue to use the existing fail-open shared-pool behavior while the scheduler is investigated.
