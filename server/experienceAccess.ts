import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import {
  readExperienceConfig,
  resolveExperienceAccess,
  type ExperienceAccess,
  type ExperienceUser,
} from "@shared/onboardingV2Access";
import { getDb } from "./db";

/**
 * Server-side switch for onboarding v2 and Home v2. Read from the
 * environment on every call (cheap), so changing ONBOARDING_V2_MODE /
 * HOME_V2_MODE and restarting is the whole rollback.
 *
 * Safety net: until the personalization tables exist in THIS database, every
 * user gets the current experience whatever the mode says. Setting the mode
 * before the migration is applied therefore cannot expose a broken flow.
 */
const PERSONALIZATION_TABLES = [
  "social_profiles",
  "workspace_member_active_profiles",
  "user_onboarding_answers",
  "profile_analysis_runs",
  "profile_analysis_stages",
  "personalization_items",
  "personalization_progress",
] as const;

const READY_RECHECK_MS = 60_000;
let readyCache: { ready: boolean; at: number } | null = null;

export async function personalizationTablesReady(now = Date.now()): Promise<boolean> {
  if (readyCache && (readyCache.ready || now - readyCache.at < READY_RECHECK_MS)) {
    return readyCache.ready;
  }
  let ready = false;
  try {
    const db = await getDb();
    if (db) {
      const res = await db.execute(sql`
        SELECT COUNT(*) AS n FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (${sql.join(PERSONALIZATION_TABLES.map(t => sql`${t}`), sql`, `)})`);
      const rows = (res as unknown as [Array<{ n: number | string }>])[0] ?? [];
      ready = Number(rows[0]?.n ?? 0) === PERSONALIZATION_TABLES.length;
    }
  } catch {
    ready = false;
  }
  readyCache = { ready, at: now };
  return ready;
}

export function resetTablesReadyCacheForTests(): void {
  readyCache = null;
}

const LEGACY: ExperienceAccess = { onboarding: "legacy", home: "research", internal: false };

export async function getExperienceAccess(
  user: ExperienceUser | null,
  tablesReady: () => Promise<boolean> = personalizationTablesReady
): Promise<ExperienceAccess> {
  const access = resolveExperienceAccess(user, readExperienceConfig(process.env));
  if (access.onboarding === "legacy") return access;
  return (await tablesReady()) ? access : { ...LEGACY, internal: access.internal };
}

/**
 * Every onboarding v2 API call goes through this. A user who is not in the
 * current rollout gets FORBIDDEN, so the new APIs cannot be reached by
 * customers before launch, even by calling them directly.
 */
export async function assertOnboardingV2Access(user: ExperienceUser): Promise<ExperienceAccess> {
  const access = await getExperienceAccess(user);
  if (access.onboarding !== "v2") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The new onboarding is not available for this account.",
    });
  }
  return access;
}

export async function assertHomeV2Access(user: ExperienceUser): Promise<ExperienceAccess> {
  const access = await getExperienceAccess(user);
  if (access.home !== "v2") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Home v2 is not available for this account.",
    });
  }
  return access;
}
