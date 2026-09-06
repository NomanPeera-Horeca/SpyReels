# Carousel production migration checklist

Do not run this against production from the readiness branch.
Do not connect to production to fill this in until a later, explicit deploy pass.
Do not use `drizzle-kit migrate` or `drizzle-kit push` for these files.

This is a verify-then-apply plan only.

## Why this is manual

`drizzle/meta/_journal.json` ends at `0034_reels_v12_three_classifiers`.

These Carousel SQL files exist on disk and are written as Railway-console
statements. They are **not** journal entries:

- `drizzle/0079_carousel_remakes.sql`
- `drizzle/0079b_carousel_remakes_workspace_idx.sql`
- `drizzle/0080_carousel_remake_customization.sql`
- `drizzle/0081_carousel_remake_image_urls.sql`
- `drizzle/0091_carousel_remake_angle_options.sql`
- `drizzle/0092_carousel_remake_progress_stage.sql`
- `drizzle/0093_carousel_remake_generation_metrics.sql`
- `drizzle/0094_carousel_remake_slot_style_overrides.sql`
- `drizzle/0095_carousel_remake_image_frame_overrides.sql`

Companion manual files (also not in the journal):

- `scripts/sql/0073-carousel-remakes-post-schedule-production.sql` (`postDate`, `postTime`)
- `scripts/sql/0074-carousel-remakes-deleted-at-production.sql` (`deletedAt`)
- `scripts/sql/0092-carousel-remakes-progress-stage-production.sql` (same column as drizzle 0092)

`sourceUrl` is required by current `drizzle/schema.ts` and create/list/rewrite
code. There is no committed `ALTER` for `carousel_remakes.sourceUrl`. Treat it
as a verify-first column.

`0080` also adds `users.instagramHandle`. That is not required to load Carousel
editor mutations, but it is part of the same historical file.

None of these statements use `IF NOT EXISTS`. Re-running an already-applied
`CREATE TABLE` / `ADD COLUMN` / `CREATE INDEX` will fail.

## A. What production already has

Unknown from this pass. Do not guess.

Earlier Carousel work applied some of these by hand in Railway console. That
is not proof that every column below is present now.

Before any deploy, run the SELECT-only preflight in
`scripts/sql/carousel-production-readiness-preflight.sql` against production
MySQL and record the actual columns and indexes.

## B. What current main requires

`carousel_remakes` must exist with:

| Object | Source file | Required by |
| --- | --- | --- |
| table `carousel_remakes` | 0079 | create, list, editor |
| index `idx_carousel_remakes_workspace` | 0079b | workspace-scoped queries |
| `slideStructureJson` | 0080 | editor + generation |
| `designOverrideJson` | 0080 | Design inspector |
| `aspectRatioOverride` | 0080 | preview / export |
| `imageUrlsJson` | 0081 | images + export |
| `angleOptionsJson` | 0091 | Studio create |
| `selectedAngleIndex` | 0091 | Studio create |
| `progressStage` | 0092 | progress UI |
| `generationMetricsJson` | 0093 | telemetry persist |
| `slotStyleOverridesJson` | 0094 | typography edits |
| `imageFrameOverridesJson` | 0095 | crop / zoom |
| `deletedAt` | scripts/sql/0074 | hide + delete |
| `postDate`, `postTime` | scripts/sql/0073 | schedule fields |
| `sourceUrl` | schema only | Studio source + rewrite context |

If any of those are missing, current main will error at query or insert time.

## C. Do not add these to the Drizzle journal now

Adding 0079-0095 (or 0073/0074) into `_journal.json` now is not safe.

1. Production `__drizzle_migrations` almost certainly never recorded them.
2. A later `drizzle-kit migrate` would treat them as pending and try to
   re-execute the raw `CREATE` / `ADD COLUMN` statements.
3. If the objects already exist, those statements fail. If they do not exist,
   migrate would apply them, but that is not a reason to rewrite history now.

Keep historical files as console SQL. Do not rewrite them casually just to
add `IF NOT EXISTS`.

## D. Safest one-time deploy procedure

Do this only when deploying, after an explicit go-ahead. Not now.

1. Snapshot / confirm a Railway MySQL backup exists.
2. Run the SELECT-only preflight. Save the result.
3. For each missing object below, apply **one statement** from the existing
   file. Skip any object the preflight already shows.
4. Apply order (skip if present):

   1. 0079 `CREATE TABLE carousel_remakes` (only if the table is absent)
   2. 0079b workspace index
   3. 0080 `slideStructureJson`
   4. 0080 `designOverrideJson`
   5. 0080 `aspectRatioOverride`
   6. 0081 `imageUrlsJson`
   7. 0091 `angleOptionsJson`
   8. 0091 `selectedAngleIndex`
   9. 0092 `progressStage` (drizzle file or scripts/sql/0092, same column)
   10. 0093 `generationMetricsJson`
   11. 0094 `slotStyleOverridesJson`
   12. 0095 `imageFrameOverridesJson`
   13. scripts/sql/0073 `postDate`
   14. scripts/sql/0073 `postTime`
   15. scripts/sql/0074 `deletedAt`
   16. `sourceUrl` only if missing:

      ```sql
      ALTER TABLE `carousel_remakes`
        ADD COLUMN `sourceUrl` varchar(1024) DEFAULT NULL
        AFTER `niche`;
      ```

   17. Optional, only if `users.instagramHandle` is missing: 0080 last statement

5. Re-run the preflight. Every required column / index must be present.
6. Then deploy app code. Do not deploy code first if required columns are
   missing.
7. Do not run `drizzle-kit push`. Known unrelated drift (featured account
   niches PK) makes push unsafe.

## After this readiness branch

Still do not execute the preflight from here. The next deploy owner should
paste results into the release notes before applying any `ALTER`.
