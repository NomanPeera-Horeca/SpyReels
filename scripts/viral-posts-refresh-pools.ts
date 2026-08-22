/**
 * Refresh stale Viral Posts candidate pools (cron/worker entrypoint).
 * Run: pnpm exec tsx scripts/viral-posts-refresh-pools.ts
 */
import "dotenv/config";
import { refreshStalePools } from "../server/viralPosts/poolRefresh";

const limit = Number(process.env.VIRAL_POSTS_REFRESH_LIMIT) || 3;
const results = await refreshStalePools(limit);
console.log(JSON.stringify({ limit, results }, null, 2));
process.exit(0);
