import assert from "node:assert/strict";
import { findDuplicateMigrationPrefixes } from "./check-duplicate-migration-numbers.mjs";

{
  const dups = findDuplicateMigrationPrefixes([
    "0094_carousel_remake_slot_style_overrides.sql",
    "0094_saved_reels_canonical_identity.sql",
    "0096_complimentary_access.sql",
    "0096_durable_jobs.sql",
    "0079_carousel_remakes.sql",
    "0079b_carousel_remakes_workspace_idx.sql",
  ]);
  assert.equal(dups.length, 2);
  assert.deepEqual(
    dups.map((d) => d.prefix).sort(),
    ["0094", "0096"]
  );
}

{
  const dups = findDuplicateMigrationPrefixes([
    "0094_carousel_remake_slot_style_overrides.sql",
    "0096_complimentary_access.sql",
    "0096b_durable_jobs.sql",
    "0079_carousel_remakes.sql",
    "0079b_carousel_remakes_workspace_idx.sql",
    "0101_featured_demo_bigint_counts.sql",
    "0102_saved_reels_canonical_identity.sql",
  ]);
  assert.equal(dups.length, 0);
}

console.log("check-duplicate-migration-numbers.test.mjs: ok");
