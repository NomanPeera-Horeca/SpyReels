/**
 * End-to-end test: creatorDiscovery.search -> poll jobStatus -> R2 URL verify.
 *
 * Auth context mirrors server/reels.test.ts createAuthContext(), but loads a real
 * User row from DATABASE_URL (TEST_USER_ID optional, else lowest id user).
 *
 * Run against staging (override DATABASE_URL inline; do not rely on prod .env):
 *
 *   DISCOVERY_V1_ENABLED=true \
 *   DATABASE_URL='mysql://user:pass@shinkansen.proxy.rlwy.net:port/railway' \
 *   TEST_USER_ID=1 \
 *   pnpm tsx scripts/test-creator-discovery-job.ts
 *
 * Requires: DATABASE_URL, ANTHROPIC_API_KEY, SCRAPECREATORS_API_KEY,
 * CLOUDFLARE_R2_PUBLIC_URL, CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_ACCESS_KEY_ID,
 * CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET
 */

import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
import { resolveWorkspaceContext } from "../server/_core/workspaceContext";
import { getDb } from "../server/db";
import { users, type User } from "../drizzle/schema";
import { isDiscoveryV1Enabled } from "../server/discovery/featureFlag";
import type { CreatorDiscoveryResult } from "../server/discovery/creatorPipeline";

const POLL_MS = 2500;
const R2_SAMPLE_COUNT = 3;

const BUSINESS_DESCRIPTION =
  "I run a laundromat business and I want to grow my Instagram by posting reels about owning and operating laundromats.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function r2PublicHost(): string {
  const raw = requireEnv("CLOUDFLARE_R2_PUBLIC_URL");
  try {
    return new URL(raw).hostname;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

function isRawInstagramCdn(url: string): boolean {
  return /cdninstagram|fbcdn/i.test(url);
}

function assertMirroredUrl(label: string, url: string, r2Host: string): void {
  console.log(`    ${label}: ${url}`);
  if (!url?.trim()) {
    throw new Error(`R2 MIRROR FAIL: ${label} is empty`);
  }
  if (isRawInstagramCdn(url)) {
    throw new Error(
      `R2 MIRROR FAIL: ${label} is still a raw Instagram CDN URL (cdninstagram/fbcdn)`
    );
  }
  if (!url.includes(r2Host)) {
    throw new Error(
      `R2 MIRROR FAIL: ${label} does not contain R2 public host "${r2Host}"`
    );
  }
}

/**
 * Same shape as reels.test.ts createAuthContext(), but with a real DB user row
 * and workspace resolved like production createContext().
 */
async function createStagingAuthContext(): Promise<TrpcContext> {
  const user = await loadTestUser();
  const { workspaceId, workspaceRole } = await resolveWorkspaceContext(
    user.id,
    null
  );

  return {
    user,
    workspaceId,
    workspaceRole,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

async function loadTestUser(): Promise<User> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available. Set DATABASE_URL.");
  }

  const testUserIdRaw = process.env.TEST_USER_ID?.trim();
  if (testUserIdRaw) {
    const testUserId = Number(testUserIdRaw);
    if (!Number.isFinite(testUserId) || testUserId <= 0) {
      throw new Error(`Invalid TEST_USER_ID: ${testUserIdRaw}`);
    }
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);
    if (!rows[0]) {
      throw new Error(`TEST_USER_ID=${testUserId} not found in database`);
    }
    return rows[0];
  }

  const rows = await db.select().from(users).orderBy(asc(users.id)).limit(1);
  if (!rows[0]) {
    throw new Error("No users found in database");
  }
  return rows[0];
}

function logDbTarget(): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;
  try {
    const host = new URL(url).hostname;
    console.log(`DATABASE_URL host: ${host}`);
    if (host.includes("maglev")) {
      console.warn(
        "WARNING: host looks like production (maglev). Use staging shinkansen unless intentional."
      );
    }
  } catch {
    console.log("DATABASE_URL: set (host parse failed)");
  }
}

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  requireEnv("ANTHROPIC_API_KEY");
  requireEnv("SCRAPECREATORS_API_KEY");
  const r2Host = r2PublicHost();
  requireEnv("CLOUDFLARE_R2_ENDPOINT");
  requireEnv("CLOUDFLARE_R2_ACCESS_KEY_ID");
  requireEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  requireEnv("CLOUDFLARE_R2_BUCKET");

  console.log("=".repeat(78));
  console.log("CREATOR DISCOVERY JOB TEST (tRPC search + poll + R2 verify)");
  console.log("=".repeat(78));
  logDbTarget();
  console.log(`isDiscoveryV1Enabled: ${isDiscoveryV1Enabled}`);
  if (!isDiscoveryV1Enabled) {
    throw new Error(
      "Discovery V1 disabled. Set DISCOVERY_V1_ENABLED=true for this run."
    );
  }
  console.log(`R2 public host: ${r2Host}\n`);

  const ctx = await createStagingAuthContext();
  console.log(
    `Test user: id=${ctx.user!.id} email=${ctx.user!.email ?? "(none)"} workspaceId=${ctx.workspaceId}\n`
  );

  const caller = appRouter.createCaller(ctx);

  const quota = await caller.creatorDiscovery.getQuota();
  console.log(
    `Quota before search: used=${quota.used}/${quota.limit} resetsAt=${quota.resetsAt}\n`
  );

  console.log("Starting creatorDiscovery.search ...");
  const { jobId } = await caller.creatorDiscovery.search({
    businessDescription: BUSINESS_DESCRIPTION,
  });
  console.log(`jobId=${jobId}\n`);

  let poll = 0;
  while (true) {
    poll += 1;
    const status = await caller.creatorDiscovery.jobStatus({ jobId });
    console.log(
      `[poll ${poll}] status=${status.status} routedNiche=${status.routedNiche ?? "(none)"} topicsTotal=${status.topicsTotal ?? 0} topicsSearched=${status.topicsSearched ?? 0} creatorsFound=${status.creatorsFound ?? 0}`
    );

    if (status.status === "completed") {
      const result = status.partialJson as CreatorDiscoveryResult | null | undefined;
      if (!result?.rankedCreators?.length) {
        throw new Error(
          "ASSERT FAIL: completed job but rankedCreators.length is 0"
        );
      }

      console.log("\nRanked creators:");
      for (const creator of result.rankedCreators) {
        const rank = creator.rank ?? "?";
        console.log(
          `  #${rank} @${creator.owner.username} viralScore=${creator.bestReel.viralScore.toFixed(1)} tier=${creator.bestReel.tier}`
        );
      }

      console.log(
        `\nASSERT: rankedCreators.length=${result.rankedCreators.length} (> 0) OK`
      );

      const sample = result.rankedCreators.slice(0, R2_SAMPLE_COUNT);
      console.log(
        `\nR2 URL check (first ${sample.length} ranked creators, host=${r2Host}):`
      );
      for (const creator of sample) {
        console.log(`  @${creator.owner.username}:`);
        assertMirroredUrl(
          "bestReel.thumbnailUrl",
          creator.bestReel.thumbnailUrl,
          r2Host
        );
        assertMirroredUrl(
          "owner.profilePicUrl",
          creator.owner.profilePicUrl,
          r2Host
        );
      }
      console.log("\nR2 mirror assertions passed.");
      console.log("\nDone. exit 0.");
      return;
    }

    if (status.status === "failed") {
      console.error("\nJob failed.");
      console.error(`errorMessage: ${status.errorMessage ?? "(none)"}`);
      process.exit(1);
    }

    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error("\ntest-creator-discovery-job failed:", err);
  process.exit(1);
});
