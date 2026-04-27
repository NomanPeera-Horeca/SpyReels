# Drizzle-kit push drift: `featured_account_niches` composite PK

**Status:** Non-blocking for current work. Will block any future
`drizzle-kit push` against staging or production until resolved.

## Symptom

Running `drizzle-kit push` against the staging DB (migration 0023 work,
Section 1 of the Phase B+C+D-lite build spec) fails immediately with:

```
Error: Cannot drop index 'PRIMARY': needed in a foreign key constraint
  sql: 'ALTER TABLE `featured_account_niches` DROP PRIMARY KEY;'
  code: ER_DROP_INDEX_FK
  errno: 1553
  sqlState: HY000
```

`drizzle-kit` believes it needs to drop and recreate the composite
PRIMARY KEY on `featured_account_niches` as part of the diff between
`drizzle/schema.ts` and the live DB. The DDL it generates is destructive
(drop + recreate) rather than a no-op, even though no developer made a
schema change to that table in Section 1.

## Why it's blocked

`featured_account_niches` has a composite PRIMARY KEY on
`(accountId, nicheId)` plus two outgoing foreign keys:

- `accountId → featured_accounts.id` (ON DELETE CASCADE)
- `nicheId   → niches.id`             (ON DELETE CASCADE)

InnoDB requires every FK column to be backed by an index. On this table
the composite PK *is* the backing index for the `accountId` FK (since
`accountId` is the leading column of the PK). Dropping the PK would
leave the `accountId` FK without an index — so MySQL refuses the
`DROP PRIMARY KEY` statement with `ER_DROP_INDEX_FK` (1553).

The result: `drizzle-kit push` aborts before applying *any* of the
intended diff, including unrelated changes.

## Where 0022 lives

The initial DDL for this table is at:

- **SQL (source of truth / audit trail):** `drizzle/0022_featured_accounts.sql`
  — see `CREATE TABLE featured_account_niches` around line 38, with
  `PRIMARY KEY (accountId, nicheId)` at line 42 and the two
  `ON DELETE CASCADE` FK constraints at lines 44-47.
- **Drizzle schema:** `drizzle/schema.ts:466-480`
  — declared with `int(...).references(...)` for both columns and
  `pk: primaryKey({ columns: [table.accountId, table.nicheId] })`.

Those two definitions *look* equivalent to a human reader, but
`drizzle-kit`'s serializer is detecting a difference. Most likely
candidates:

1. PK name, ordering, or `USING {BTREE|HASH}` metadata that the
   introspected DB state reports differently from what drizzle-kit
   synthesizes from `schema.ts`.
2. FK name discrepancy between the hand-written 0022 SQL and
   drizzle-kit's expected naming convention
   (`featured_account_niches_accountId_featured_accounts_id_fk` etc.)
   causing it to see the constraints as "different", which cascades
   into wanting to rebuild the PK.
3. The implicit secondary index on `nicheId` (declared as
   `KEY featured_account_niches_nicheId_idx` in 0022 but not named
   in `schema.ts`) being misidentified.

## Current workaround

Section 1's migration (`drizzle/0023_classify_cache.sql`) was applied
directly to staging via raw `mysql2.query()` from a Node one-liner,
bypassing `drizzle-kit push` entirely. Columns were verified afterward
via `INFORMATION_SCHEMA.COLUMNS`. This works fine for single-purpose
ALTER migrations but does not scale — we shouldn't keep side-stepping
the tool.

## Suggested fix (not yet done)

Pick one, in rough order of increasing effort:

1. **`drizzle-kit introspect` first, then reconcile.** Run
   `drizzle-kit introspect` against staging to generate the DB's
   "true" drizzle schema, diff it against `drizzle/schema.ts`, and
   update `schema.ts` to match reality. Fastest path if the drift is
   just a naming/metadata mismatch.
2. **Switch from `push` to `generate` + `migrate`.** Use
   `drizzle-kit generate` to emit a reviewable SQL diff, then apply
   via `drizzle-kit migrate` or manually. Destructive diffs become
   explicit before they're run, which would have flagged this issue
   immediately. Probably the right long-term workflow regardless.
3. **Temporarily drop the FKs, let drizzle-kit rebuild the PK, re-add
   the FKs.** Risky on production (brief window with no referential
   integrity); acceptable on staging for a one-time cleanup. Should
   only be done after understanding *why* drizzle-kit wants to rebuild
   the PK — otherwise the same drift will reappear on the next push.
4. **Rethink the table.** Drop the composite PK in favor of a surrogate
   `id INT AUTO_INCREMENT PRIMARY KEY` plus a `UNIQUE (accountId, nicheId)`
   index. Eliminates the FK-on-PK dependency that's causing the block.
   Requires a full migration and an audit of any code that assumes
   `(accountId, nicheId)` is the PK.

Recommendation: start with option 1 (introspect + reconcile). It's
non-destructive and most likely to resolve the issue with no schema
changes. Only escalate to 3 or 4 if 1 reveals a legitimate structural
mismatch.

## Impact

- **Current work (Section 1 of Phase B+C+D-lite spec):** unblocked via
  raw-SQL workaround.
- **Future work (Section 2 onboarding migration, Sections 3+, any
  future schema change):** **will hit the same error** unless this is
  resolved. Plan to apply 0024 and subsequent migrations via the same
  raw-SQL bypass, or fix this first.
- **Data integrity:** zero impact. No data was lost, no invariants
  violated. The drift is purely a `drizzle-kit` tooling issue.
