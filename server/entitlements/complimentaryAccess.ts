import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { complimentaryAccessGrants } from "../../drizzle/complimentaryAccessSchema";
import { getDb } from "../db";
import type { PlanId } from "../stripe/products";

export type ComplimentaryPlan = Exclude<PlanId, "free">;
export type AccessSource = "free" | "stripe" | "complimentary";

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
  agency: 4,
};

/** Founder login. Effective plan is at least Pro, with no Stripe charge. */
const COMPLIMENTARY_PRO_EMAILS = ["nomanpeera@gmail.com"] as const;

export function complimentaryPlanExceptionForEmail(
  email: string | null | undefined
): ComplimentaryPlan | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  return (COMPLIMENTARY_PRO_EMAILS as readonly string[]).includes(normalized)
    ? "pro"
    : null;
}

export function mergeComplimentaryPlans(
  ...plans: Array<ComplimentaryPlan | null | undefined>
): ComplimentaryPlan | null {
  let best: ComplimentaryPlan | null = null;
  for (const plan of plans) {
    if (!plan) continue;
    if (!best || PLAN_RANK[plan] > PLAN_RANK[best]) best = plan;
  }
  return best;
}

export function resolveEffectivePlan(
  billingPlan: PlanId,
  complimentaryPlan?: ComplimentaryPlan | null
): PlanId {
  if (!complimentaryPlan) return billingPlan;
  return PLAN_RANK[complimentaryPlan] > PLAN_RANK[billingPlan]
    ? complimentaryPlan
    : billingPlan;
}

export function resolveAccessSource(
  billingPlan: PlanId,
  complimentaryPlan?: ComplimentaryPlan | null
): AccessSource {
  if (
    complimentaryPlan &&
    PLAN_RANK[complimentaryPlan] > PLAN_RANK[billingPlan]
  ) {
    return "complimentary";
  }
  return billingPlan === "free" ? "free" : "stripe";
}

export function isComplimentaryGrantActive(
  grant: {
    status: "active" | "revoked";
    startsAt: Date;
    expiresAt: Date | null;
  },
  now: Date = new Date()
): boolean {
  return (
    grant.status === "active" &&
    grant.startsAt.getTime() <= now.getTime() &&
    (!grant.expiresAt || grant.expiresAt.getTime() > now.getTime())
  );
}

export async function getActiveComplimentaryGrant(
  userId: number,
  now: Date = new Date()
) {
  const db = await getDb();
  if (!db) return null;

  const [grant] = await db
    .select()
    .from(complimentaryAccessGrants)
    .where(
      and(
        eq(complimentaryAccessGrants.userId, userId),
        eq(complimentaryAccessGrants.status, "active"),
        lte(complimentaryAccessGrants.startsAt, now),
        or(
          isNull(complimentaryAccessGrants.expiresAt),
          gt(complimentaryAccessGrants.expiresAt, now)
        )
      )
    )
    .orderBy(desc(complimentaryAccessGrants.createdAt))
    .limit(1);

  return grant ?? null;
}

export async function getComplimentaryAccessHistory(
  userId: number,
  limit = 50
) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(complimentaryAccessGrants)
    .where(eq(complimentaryAccessGrants.userId, userId))
    .orderBy(desc(complimentaryAccessGrants.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));
}

export async function grantComplimentaryAccess(input: {
  userId: number;
  plan: ComplimentaryPlan;
  reason: string;
  grantedByUserId: number;
  expiresAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    throw new Error("Complimentary access expiry must be in the future");
  }

  const reason = input.reason.trim();
  if (!reason) throw new Error("Complimentary access reason is required");

  await db.transaction(async (tx) => {
    await tx
      .update(complimentaryAccessGrants)
      .set({
        status: "revoked",
        revokedAt: now,
        revokedByUserId: input.grantedByUserId,
        revokeReason: "Replaced by a newer complimentary access grant",
      })
      .where(
        and(
          eq(complimentaryAccessGrants.userId, input.userId),
          eq(complimentaryAccessGrants.status, "active")
        )
      );

    await tx.insert(complimentaryAccessGrants).values({
      userId: input.userId,
      plan: input.plan,
      status: "active",
      reason,
      grantedByUserId: input.grantedByUserId,
      startsAt: now,
      expiresAt,
    });
  });

  return getActiveComplimentaryGrant(input.userId, now);
}

export async function revokeComplimentaryAccess(input: {
  userId: number;
  reason: string;
  revokedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const reason = input.reason.trim();
  if (!reason) throw new Error("Revocation reason is required");

  const now = new Date();
  const activeGrant = await getActiveComplimentaryGrant(input.userId, now);
  if (!activeGrant) return null;

  await db
    .update(complimentaryAccessGrants)
    .set({
      status: "revoked",
      revokedAt: now,
      revokedByUserId: input.revokedByUserId,
      revokeReason: reason,
    })
    .where(
      and(
        eq(complimentaryAccessGrants.id, activeGrant.id),
        eq(complimentaryAccessGrants.status, "active")
      )
    );

  return { ...activeGrant, status: "revoked" as const, revokedAt: now };
}
