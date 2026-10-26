# Personalization schema test environment

This note has two separate subjects. The release check is whether the current production tables can store the niche category inside the existing JSON payload. The historical migration-chain defects are a follow-up issue. They are not a migration for this release, and this note does not authorize applying, skipping, or rewriting any production SQL.

## This release is JSON-only

`personalization_items.payload` is already `json NOT NULL`. The specific niche stays in `label`. The taxonomy category is the optional `categoryLabel` field on that same JSON object. No new column, table, or check is required for it. The existing pillar check reads only `$.viewSharePercent`. Production already expects `personalization_items.dismissedFromStatus` (`server/schemaDrift.ts`). This branch adds no file under `drizzle/`.

## Historical migration-chain issue

The defects below were found while trying to build a local database from the numbered SQL chain. They stay a separate repair issue. They do not block storing `categoryLabel` in the existing payload.

The half-applied local database used during an earlier browser pass is not a compatibility claim. `drizzle-kit migrate` did not finish that chain. Two files were skipped by hand, and one column was added with a local `ALTER`. Do not treat that database as proof that production schema and the SQL files agree.

The half-applied local database used during an earlier browser pass is not a compatibility claim. `drizzle-kit migrate` did not finish that chain. Two files were skipped by hand, and one column was added with a local `ALTER`. Do not treat that database as proof that production schema and the SQL files agree.

## Defects in the existing SQL chain

These files were not edited.

- `drizzle/0032_transcriptions_queue_timestamps.sql` contains an `ALTER` and an `UPDATE` in one file. `drizzle-kit migrate` sends that as one statement and MySQL returns `ER_PARSE_ERROR` near `UPDATE`. The mysql client can run the file because it splits statements. That is not drizzle-kit compatibility.
- `drizzle/0055_discovery_searches.sql` creates `discovery_searches` again. `drizzle/0050_discovery_searches_and_results.sql` already created that table with a different column shape. Applying 0055 returns `ERROR 1050` (table already exists).
- `drizzle/0098_ai_gateway_dynamic_cimd_clients.sql` returns `ERROR 1267`, an illegal mix of collations (`utf8mb3_tolower_ci` and `utf8mb3_general_ci`).
- `users.timezone` is `varchar(64)` in `drizzle/schema.ts` and is selected on login, but it was not created by the SQL files that had already been recorded through journal index 16. Registration failed with `Unknown column 'timezone'` until a local-only `ALTER`.
- `viral_post_reminder_state` is written when an authenticated session records activity. It was missing from that same local database. The app kept the session and logged `recordUserActivity failed`.
- Personalization tables are not in `drizzle.config.ts`. The config schema list is `drizzle/schema.ts` and `drizzle/complimentaryAccessSchema.ts`. `drizzle-kit push` would not create the onboarding tables. They come from `docs/architecture/drafts/onboarding_v2_personalization.sql`, which is marked as a draft and must not be applied to production from this note. Later personalization alters live in `drizzle/0104_pillar_subtopics.sql`, `drizzle/0105`, `drizzle/0106_personalization_items_dismiss_memory.sql`, and `drizzle/0107_onboarding_entered_at.sql`.

## Reproducible personalization test database

`server/personalization/onboarding/onboardingService.mysql.test.ts` is the schema-compatible environment for onboarding storage. It refuses a URL that contains `prod`, `staging`, or `railway`. It drops and recreates `<database>_svc`, then applies only:

- a stub `users` table used by the test
- `workspaces` and `workspace_members` from `drizzle/0042_workspaces_phase1_create.sql`
- `docs/architecture/drafts/onboarding_v2_personalization.sql`

Point it at a local MySQL server:

```
PERSONALIZATION_SCHEMA_TEST_DB=mysql://root@127.0.0.1:3307/spyreels_isolated \
  pnpm exec vitest run server/personalization/onboarding/onboardingService.mysql.test.ts
```

That scratch database is personalization-schema compatible. It is not a full application schema, and it does not prove the numbered migration chain can be applied by drizzle-kit.
