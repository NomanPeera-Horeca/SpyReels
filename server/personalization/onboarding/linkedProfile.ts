/**
 * "+ TikTok" / "+ YouTube" / "+ Instagram" from Home: add the creator's own
 * account on another platform without onboarding it again.
 *
 * - Saves the confirmed public profile (same row rules as onboarding).
 * - Copies the creator's confirmed strategy (niche, goals, audience, pillars,
 *   language, pillar sub-topics) from the profile they use now, so the new
 *   profile is complete and never asks those questions again.
 * - Keeps the profile they use now active: Home does not switch.
 * The caller then starts the normal first analysis of the new account in the
 * background (what worked for them on that platform).
 */
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { personalizationItems, personalizationProgress, pillarSubtopics } from "../../../drizzle/personalizationSchema";
import type { Db } from "../db/analysisStore";
import { confirmProfile, listWorkspaceProfiles, switchActiveProfile, type OnboardingCtx } from "./onboardingService";

/** Kinds that make up the creator's strategy. */
const STRATEGY_KINDS = ["niche", "goal", "audience", "pillar", "language"] as const;

/** New ids for copied pillars, so sub-topics follow them. Pure; exported for tests. */
export function remapPillarIds(oldIds: string[], newId: () => string = randomUUID): Map<string, string> {
  return new Map(oldIds.map(id => [id, newId()]));
}

export async function addLinkedProfile(
  db: Db,
  ctx: OnboardingCtx,
  preview: PublicProfilePreview
): Promise<{ profileId: string; copied: number }> {
  const before = (await listWorkspaceProfiles(db, ctx)).find(p => p.active);
  if (!before) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Set up your first profile before adding another." });
  }
  const { profileId } = await confirmProfile(db, ctx, preview);
  // confirmProfile makes the new profile active; keep the one the creator uses.
  if (profileId !== before.id) await switchActiveProfile(db, ctx, before.id);
  if (profileId === before.id) return { profileId, copied: 0 };

  // Already has a confirmed strategy (added before): leave it as it is.
  const existing = await db
    .select({ id: personalizationItems.id })
    .from(personalizationItems)
    .where(and(eq(personalizationItems.socialProfileId, profileId), eq(personalizationItems.status, "confirmed")))
    .limit(1);
  if (existing.length) return { profileId, copied: 0 };

  const items = await db
    .select()
    .from(personalizationItems)
    .where(
      and(
        eq(personalizationItems.socialProfileId, before.id),
        eq(personalizationItems.status, "confirmed"),
        inArray(personalizationItems.kind, [...STRATEGY_KINDS])
      )
    );
  if (items.length === 0) return { profileId, copied: 0 };

  const pillarIds = remapPillarIds(items.filter(i => i.kind === "pillar").map(i => i.id));
  const subs = pillarIds.size
    ? await db
        .select()
        .from(pillarSubtopics)
        .where(
          and(
            eq(pillarSubtopics.socialProfileId, before.id),
            inArray(pillarSubtopics.pillarItemId, [...pillarIds.keys()]),
            ne(pillarSubtopics.status, "dismissed")
          )
        )
    : [];
  const [progress] = await db
    .select()
    .from(personalizationProgress)
    .where(eq(personalizationProgress.socialProfileId, before.id))
    .limit(1);

  await db.transaction(async tx => {
    await tx.insert(personalizationItems).values(
      items.map(i => ({
        id: pillarIds.get(i.id) ?? randomUUID(),
        workspaceId: ctx.workspaceId,
        socialProfileId: profileId,
        kind: i.kind,
        payload: i.payload,
        source: i.source,
        status: "confirmed" as const,
        evidence: i.evidence,
        basedOnVersion: 1,
        basedOnInputsHash: i.basedOnInputsHash,
        confidence: i.confidence,
        sortOrder: i.sortOrder,
        createdByUserId: ctx.userId,
      }))
    );
    if (subs.length) {
      await tx.insert(pillarSubtopics).values(
        subs.map(s => ({
          id: randomUUID(),
          workspaceId: ctx.workspaceId,
          socialProfileId: profileId,
          pillarItemId: pillarIds.get(s.pillarItemId)!,
          label: s.label,
          normalizedLabel: s.normalizedLabel,
          normalizedPillarTitle: s.normalizedPillarTitle,
          status: s.status,
          source: s.source,
          basedOnPillarHash: s.basedOnPillarHash,
        }))
      );
    }
    if (progress) {
      // Same steps done as the profile it was copied from: never asked again.
      await tx
        .update(personalizationProgress)
        .set({
          goalStatus: progress.goalStatus,
          audienceStatus: progress.audienceStatus,
          pillarsStatus: progress.pillarsStatus,
          completedAt: progress.completedAt ?? new Date(),
        })
        .where(eq(personalizationProgress.socialProfileId, profileId));
    }
  });
  return { profileId, copied: items.length };
}
