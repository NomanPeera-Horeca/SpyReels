import { and, eq } from "drizzle-orm";
import {
  viralPostSeedCreators,
  type ViralPostSeedCreator,
} from "../../drizzle/schema";
import { getDb } from "../db";

export async function listActiveSeedCreators(args: {
  platform: "tiktok" | "youtube";
  niche: string;
  limit?: number;
}): Promise<ViralPostSeedCreator[]> {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.max(1, Math.min(args.limit ?? 8, 20));
  return db
    .select()
    .from(viralPostSeedCreators)
    .where(
      and(
        eq(viralPostSeedCreators.platform, args.platform),
        eq(viralPostSeedCreators.niche, args.niche),
        eq(viralPostSeedCreators.isActive, true)
      )
    )
    .limit(limit);
}
