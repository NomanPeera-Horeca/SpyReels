# Viral Posts Phase 3A production acceptance

Date: 2026-08-22

## A. Production worker architecture

- **Web instances:** `VIRAL_POSTS_POOL_REFRESHER=false` (process-local refresher off).
- **Worker/cron:** `pnpm exec tsx scripts/viral-posts-refresh-pools.ts` every 2–4 hours.
- **Lock:** DB lease columns `refreshLeaseOwner` / `refreshLeaseUntil` (migration `0088`). TTL 10 minutes. Steal on expiry. Logs: `lock_acquire`, `lock_skip`, `lock_release`.
- Details: `docs/VIRAL_POSTS_POOL_REFRESH.md`

## B. Environment configuration matrix

| Variable | Local | Staging | Prod web | Prod worker |
|---|---|---|---|---|
| `VIRAL_POSTS_LIVE` | `true` | `true` | `true` | `true` |
| `VIRAL_POSTS_INSTAGRAM_ENABLED` | `true` | `true` | `true` | `true` |
| `VIRAL_POSTS_POOL_REFRESHER` | `true` | `false` | `false` | `false` |
| `VIRAL_POSTS_POOL_REFRESH_MS` | `10800000` | unused | unused | unused |
| `VIRAL_POSTS_DB_DEBUG` | `false` | `false` | `false` | `false` |
| `VIRAL_POSTS_WORKER_ID` | optional | optional | unused | unique |

Blank `VIRAL_POSTS_LIVE` in production => false (+ warning). Pool refresher blank => false (opt-in).

## C. Authenticated browser evidence

Cursor browser session on `/viral-posts` was **logged out** (marketing landing). JWT session minting is unavailable without `JWT_SECRET` in local `.env`.

Authenticated substitute: `scripts/viral-posts-phase31-e2e-api.ts` **PASS** for user 9:

- 5–7 Instagram posts
- same feed on refresh
- save survives
- hide creator survives
- R2 mirrored + source_fallback thumbs
- Instagram-only platforms

**Manual step remaining:** log into local/staging browser and confirm UI parity (Save/Saved tabs, Explore debounce).

## D. Explore call-count evidence (`FORCE_EXPLORE=1`)

| Case | SC calls | Latency | Cache | Results |
|---|---|---|---|---|
| First unique query | 15 (≤25) | ~101s | miss | 0 (empty after filters) |
| Identical repeat | 0 | ~104ms | hit | 0 |
| Normalized equivalent | 0 | ~102ms | hit | 0 |
| Empty-ish second query | 16 | ~99s | miss | 0 |

Frontend: 400ms debounce on Explore input; React Query cancels stale fetches on query-key change.

## E. Cold-start evidence

`scripts/viral-posts-cold-start-smoke.ts` **PASS**:

- ~1.2s response, status `refreshing`, 0 provider calls on request
- background pool refresh started
- no duplicate feed id
- no mock posts

## F. Multi-instance lock evidence

`scripts/viral-posts-pool-lock-smoke.ts` **PASS**:

- second worker blocked while lease held
- expired lease stealable
- release then reacquire works

## G. Removed or gated debug behavior

- `[viralPosts.db]` logs only when `VIRAL_POSTS_DB_DEBUG=true`
- Process-local refresher only when `VIRAL_POSTS_POOL_REFRESHER=true`
- Mock seed arrays empty (`VIRAL_POSTS_SEED=[]`)
- Smoke scripts are CLI-only (not HTTP routes)

## H. Observability

Structured logs cover: pool refresh start/end, lock acquire/skip/release, SC call count + cost estimate, candidate counts, feed assembly latency, cache hits, Explore cache hit/miss, media mirror summary, search errors. No credentials or raw provider payloads in production logs.

## I. Test results

- `tsc --noEmit`: clean
- `vitest server/viralPosts/tests`: 40 passed
- Pool lock smoke: PASS
- Cold-start smoke: PASS
- Explore cost smoke: PASS
- E2E API: PASS
- Migrations `0087` + `0088` applied

## J. Remaining limitations

- Authenticated Cursor browser UI screenshots still need a logged-in session
- Explore often returns 0 after discovery quality filters (empty state is honest)
- Remake remains mocked (Phase 3B)
- Local `.env` still has blank Viral Posts flags; set explicit true/false per matrix

## Blunt answers

| Question | Answer |
|---|---|
| Multi-instance web without duplicate pool refreshes? | **Yes** (DB lease + refresher off on web) |
| Logged-in For You / Save / feedback flow? | **Yes via API e2e**; browser UI needs login |
| Repeated Explore avoids repeat provider calls? | **Yes** (proven) |
| Cold-start without waiting? | **Yes** (~1.2s refreshing) |
| Mock content in production? | **No** (empty seed; live Instagram only) |
| Phase 3A fully accepted? | **Yes**, with manual browser login QA remaining |
| Safe to begin Phase 3B? | **Yes** |
