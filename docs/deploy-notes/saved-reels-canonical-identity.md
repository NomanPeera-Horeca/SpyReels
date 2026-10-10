# saved_reels canonical identity (0102)

## Applied in production

- **Logical file (repo):** `drizzle/0102_saved_reels_canonical_identity.sql`
- **Formerly staged as:** `0101_saved_reels_canonical_identity.sql` (renamed before merge; `0101` is reserved for `0101_featured_demo_bigint_counts.sql`)
- **SQL:** idempotent ADD COLUMN `platform` / `sourceId` + non-unique index (exact reviewed body unchanged)
- **Recorded:** `__drizzle_migrations` hash `58af2330fc12738ee4ff13b58d45bce849b3737b2ac2b344f514784909fbb16f` (sha256 of applied SQL bytes; filename rename does not require re-apply)
- **Do not re-run** on production; already applied 2026-10-10.

## Backup policy

Use Railway managed MySQL backups/snapshots for production. Do not keep production dumps on laptops.
