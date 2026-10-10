/**
 * Figma Decision 32 content-spec gate (no browser).
 * Run: pnpm test:content-spec
 */
import { collectMarketingCopySlots } from "../lib/collectMarketingCopySlots";
import { marketingCopySpecFailures } from "../lib/marketingContentSpec";

const failures = marketingCopySpecFailures(collectMarketingCopySlots());
if (failures.length > 0) {
  console.error(`Marketing content-spec failed (${failures.length}):`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log("Marketing content-spec OK");
