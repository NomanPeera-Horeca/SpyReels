/**
 * Verify discovery.search wrapper logic without booting appRouter (no Stripe/DB).
 *
 * Run:
 *   ANTHROPIC_API_KEY=... SCRAPECREATORS_API_KEY=... npx tsx scripts/verify-discovery-search.ts
 */

import { z } from "zod";
import { isDiscoveryV1Enabled } from "../server/discovery/featureFlag";
import { runDiscoveryPipeline } from "../server/discovery/pipeline";

const searchInputSchema = z.object({
  businessDescription: z.string().min(20).max(1000),
});

const SHORT_DESCRIPTION = "too short";
const RESTAURANT_SUPPLY_DESCRIPTION =
  "Restaurant supply company selling commercial kitchen equipment and food service products to restaurants and cafes";

async function main(): Promise<void> {
  try {
    console.log(`isDiscoveryV1Enabled: ${isDiscoveryV1Enabled}`);
    if (!isDiscoveryV1Enabled) {
      throw new Error(
        "Discovery V1 is disabled (set DISCOVERY_V1_ENABLED=true or run outside production)"
      );
    }

    const shortParse = searchInputSchema.safeParse({
      businessDescription: SHORT_DESCRIPTION,
    });
    console.log(
      `zod 10-char description: success=${shortParse.success}, expected=false`
    );
    if (shortParse.success) {
      throw new Error("Expected 10-char description to fail zod parse");
    }

    const validParse = searchInputSchema.safeParse({
      businessDescription: RESTAURANT_SUPPLY_DESCRIPTION,
    });
    console.log(
      `zod restaurant-supply description: success=${validParse.success}, expected=true`
    );
    if (!validParse.success) {
      throw new Error(
        `Expected restaurant-supply description to pass zod parse: ${validParse.error.message}`
      );
    }

    const result = await runDiscoveryPipeline(RESTAURANT_SUPPLY_DESCRIPTION);

    console.log(`viralReels.length: ${result.viralReels.length}`);

    const top = result.viralReels[0];
    if (top) {
      console.log(
        `top reel: owner.username=@${top.owner.username}, views=${top.views}, viralScore=${top.viralScore}, viralTier=${top.viralTier}`
      );
    } else {
      console.log("top reel: (none)");
    }

    process.exit(0);
  } catch (err) {
    console.error("verify-discovery-search failed:", err);
    process.exit(1);
  }
}

void main();
