# Manual production migrations (runbook)

SpyReels does **not** rely on `drizzle-kit migrate` for late numbered SQL under
`drizzle/`. Operators apply SQL via Railway MySQL (CLI or console) after review.

## Every apply must be recorded

When you apply a manual migration in production:

1. **Backup first** (table dump or Railway volume snapshot).
2. Apply the **exact reviewed SQL** only.
3. **Record it** in `__drizzle_migrations` immediately:

   ```sql
   -- hash = sha256 of the applied .sql file bytes (hex)
   INSERT INTO `__drizzle_migrations` (`hash`, `created_at`)
   VALUES ('<sha256-hex>', UNIX_TIMESTAMP() * 1000);
   ```

   If you prefer a separate audit trail, also append a short note under
   `docs/deploy-notes/` with stamp, file name, sha256, and verify SELECTs.
4. Verify columns/indexes with `information_schema` SELECTs before closing the
   change.
5. Land matching `drizzle/schema.ts` (and app code) in a PR that same day so
   TypeScript and production do not drift.

Skipping the record step is how colliding `0094_*` / unapplied identity columns
reached production silently.

## Numbering rules

- One unique prefix per file in `drizzle/*.sql` (`NNNN_` or `NNNNb_`).
- Never reuse a prefix. CI runs `scripts/check-duplicate-migration-numbers.mjs`.
- Superseded SQL belongs under `drizzle/legacy/` (not numbered), with a pointer
  to the replacement file.

## Schema drift alert

On production boot the web process runs a curated critical-schema check
(`server/schemaDrift.ts`). Missing tables/columns/indexes page the owner via
Telegram (`schema_drift`). Keep that list small and user-impacting; expand it
when a new class of silent drift bites.
