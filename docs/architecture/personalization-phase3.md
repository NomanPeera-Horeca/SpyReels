# Personalization Phase 3: database integration prep and durable profile analysis

Status: migration gate CLOSED (production not verified). Everything below is built and tested locally but NOT connected to the running app. Both feature flags stay OFF.

## 1. Production preflight

Production access was not available from the engineering environment (no database credentials or Railway access). None of the four facts are verified.

| Check | Status | How to verify |
|---|---|---|
| Latest applied migration is 0102 | NOT VERIFIED | preflight script (sha256 of each repo migration vs `__drizzle_migrations.hash`) |
| MySQL 8.0.16+ | NOT VERIFIED | preflight script |
| `users`, `workspaces`, `workspace_members` are `utf8mb4_0900_ai_ci`, key types match | NOT VERIFIED | preflight script |
| None of the 7 tables exist | NOT VERIFIED | preflight script |
| No 0103+ in any branch or PR | VERIFIED 2026-10-16 (166 branches, 128 PR heads) | `git ls-tree` scan |

Run (read-only, someone with production access):

```
PREFLIGHT_DATABASE_URL='mysql://<read-only user>@<host>/<db>' pnpm exec tsx scripts/personalization-preflight.ts
```

It runs inside `START TRANSACTION READ ONLY`, refuses any non-read statement, prints JSON, exits 0 only if all four checks pass, and never prints the connection string. Tested on local MySQL 8.0 for: pass, unknown migration after 0102, 0102 not recorded, table already exists, wrong collation, and that MySQL itself rejects writes inside it.

## 2. Migration

- Number: NOT ASSIGNED. Becomes the next number only after the preflight passes and the CEO confirms.
- Source: the hand-written `docs/architecture/drafts/onboarding_v2_personalization.sql` (Drizzle-generated SQL omits the collation).
- Verified locally on MySQL 8.0.46:
  - clean database: applies, re-applies (idempotent), 30 constraint tests pass
  - production-like database (all 82 current app tables from `drizzle/schema.ts`): applying the draft changed NO existing table (SHOW CREATE TABLE + CHECKSUM fingerprint identical before/after); FKs to real `users`/`workspaces` work; the rollback restored the identical fingerprint
- Local results are not production results. The preflight is still required.

### Backup and recovery plan

1. Before: Railway managed snapshot of the production database (per `docs/deploy-notes/manual-migrations.md`; no local dumps kept). Run the preflight; it must pass.
2. Apply the reviewed file once. Record `sha256` in `__drizzle_migrations`.
3. Verify with the `information_schema` queries in `home-v2-phase1.md` and re-run the preflight (check 4 should now fail = tables exist, the others pass).
4. If anything is wrong BEFORE any code reads the tables: run the rollback block at the bottom of the SQL (drops the 7 new tables, children first). No existing table is touched, so no data restore is needed.
5. After code reads the tables: roll back by turning the flags off first; the tables stay (history is protected by RESTRICT FKs). Restoring the snapshot is the last resort and loses writes made after it.

## 3. Legacy backfill (prepared, not run)

- Planner: `server/personalization/backfill/legacyBackfill.ts` (pure). Runner: `runLegacyBackfill.ts`. CLI: `scripts/personalization-legacy-backfill.ts` (dry run by default; `--execute --preflight-passed`; production also needs `PERSONALIZATION_BACKFILL_ALLOW_PRODUCTION=yes` after CEO approval).
- Copies `selectedNicheSlugs` -> niche items, `businessDescription` -> brand_description, `targetAudience` -> audience, as `user_entered` / `confirmed` / `user_provided`.
- Only into the user's own personal workspace. Team workspaces never. No profile from `instagramHandle`.
- Workspace with no profile: one `unlinked` profile (strategy without an account). One profile: fill only missing kinds. Several: reported, skipped.
- Reported, never guessed: no personal workspace, several personal workspaces, several profiles.
- Idempotent: deterministic ids + INSERT IGNORE + skip existing kinds. Only INSERTs into the two new tables.
- Tested on real MySQL with realistic users (solo, team owner, team member, empty, no personal workspace, newer confirmed values, two profiles): correct placement, newer values kept, ambiguous reported, `users`/`workspaces`/`workspace_members`/plan data checksums unchanged, second run inserts nothing, reconciliation OK.

Model additions needed for this (draft only): profile status `unlinked`; item kind `brand_description` (legacy "What do you create content about?" / Settings "Your Business"; the plan coach reads it as `brandDescription`; it is not a goal).

## 4. Backward-compatible reader (prepared, not wired)

`server/personalization/coachProfileResolver.ts` returns the same shape as `getCreatorCoachProfile`.

- Per field: confirmed values of the active profile, then user-written unconfirmed values, then legacy `users.*`, then today's defaults.
- Never used: unconfirmed AI suggestions, dismissed, superseded, stale rows; items of another profile or workspace (counted, never merged); an active profile from another workspace or soft-deleted.
- Several audiences of the same profile are listed in order.
- Pinned: with no new data it equals today's `getCreatorCoachProfile` output and precondition (tests call the real function).
- `server/planCoachProfile.ts` is unchanged. Wiring happens after the migration: load active profile + items via the authorization helpers, call the resolver, throw the same PRECONDITION_FAILED when `hasEnoughToPlan` is false.

## 5. profile_analysis durable job (prepared, not registered)

Files: `server/personalization/analysis/{contract,runProfileAnalysis,requestProfileAnalysis,existingProviderSource}.ts`.

- Runs on the existing durable queue (same table, leases, attempts, idempotency upsert). Not added to `PILOT_JOB_TYPES` until the tables exist.
- Request: authorize -> `decideAnalysisRequest` -> act. Initial: one per account; double taps and reloads reuse; a failed run is retried in place (same row, same key, `requeueIfTerminal` so the finished job reopens). User refresh: 60-minute cooldown + usage check; usage recorded once per created run. Background: OFF (7-day interval documented, not enabled). Private / not found / not posting yet / unlinked: rejected before any job.
- Handler: queued -> running -> succeeded / partial / failed with per-stage status. Stage 1 saves a snapshot so retries and crash recovery never refetch. Transient errors are re-thrown for the durable retry; the last attempt marks the run failed (never stuck running). Private/not found finish failed without retries and update the profile. Zero posts: succeeded, nothing invented. Suggestion failure: partial. Suggestions go through `planAiSuggestionMerge` (no overwrite, no invented numbers); old unconfirmed AI rows are superseded.
- Provider: reuses `scrapeReels`, `scrapeTikTokVideos`, `scrapeYouTubeShorts` (ScrapeCreators) directly: no research scrape job, no research history rows, no research credit. No new provider.
- AI suggestions: the `SuggestionEngine` port is not implemented yet; stages 3 and 4 are "skipped" until it is. Building it on the existing LLM gateway is Phase 4 and needs approval of prompts and cost.

### Provider cost and retry risks

| Risk | Impact | Mitigation now | Still open |
|---|---|---|---|
| Durable retry during stage 1 repeats provider calls | up to 3x the fetch cost | snapshot after stage 1; no refetch after it | a failure mid-pagination repeats the whole fetch |
| Integrations retry internally (e.g. `fetchTikTokProfile` up to 5 attempts) | multiplies with durable retries | max 3 durable attempts | cap needs a per-run call budget in the integrations |
| No per-call counter outside discovery | cost per run unknown | `providerCallCount` column (null = unknown) | add a counter like the discovery tracker |
| Integrations coerce missing numbers to 0 | a 0 may mean unknown | provider value kept, never estimated | distinguishing needs integration changes |
| Lease expiry after a crash re-runs stage 1 if the snapshot was not saved yet | one extra fetch | snapshot saved before stage marked done | none |

## 6. Production behavior

Nothing in the running app imports the new modules (guard test). `planCoachProfile.ts`, onboarding, Agent, discovery, `/research`, 30-Day Plan, usage limits, workspace switching and auth are unchanged. Flags default off (guard test).
