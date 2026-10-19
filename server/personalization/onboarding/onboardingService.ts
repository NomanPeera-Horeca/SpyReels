/**
 * Onboarding v2 server logic (Phase 5). EXTEND of the Phase 2 to 4 pieces:
 * - tables: drizzle/personalizationSchema.ts
 * - rules: shared/personalization/state.ts (resume, merge, edit, dismiss)
 * - analysis: requestProfileAnalysis (existing durable job contract)
 * - AI: generateRecommendations (existing engine, one pipeline)
 *
 * Authorization: the workspace and user always come from the server context.
 * Every profile read goes through the member's active selection in that
 * workspace, so one workspace can never read or change another's data.
 *
 * AI never blocks completion: every step can be confirmed or skipped with the
 * user's own values, whatever the analysis or the model did.
 */
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  ANALYSIS_STAGES,
  PERSONALIZATION_STEPS,
  type AnalysisRunStatus,
  type AnalysisStage,
  type AnalysisStageStatus,
  type AttributionSource,
  type ItemPayloadByKind,
  type PersonalizationItemKind,
  type PillarPayload,
  type PersonalizationStep,
  type PrimaryUseCase,
  type SocialPlatform,
  type SocialProfileStatus,
  type StepStatus,
} from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import {
  idsToConfirmForStep,
  isPersonalizationComplete,
  liveItems,
  planDismiss,
  planItemEdit,
  resolveResumeStep,
  type ItemRecord,
} from "@shared/personalization/state";
import {
  personalizationItems,
  personalizationProgress,
  profileAnalysisRuns,
  profileAnalysisStages,
  socialProfiles,
  userOnboardingAnswers,
  workspaceMemberActiveProfiles,
} from "../../../drizzle/personalizationSchema";
import { users } from "../../../drizzle/schema";
import type { Db } from "../db/analysisStore";
import { pickBestPost, type BestPost } from "@shared/personalization/bestPost";
import { toItemRecord } from "../db/rows";
import {
  isSamePillarTitle,
  listProfileSubtopics,
  repointPillarSubtopics,
  verifyPillarSubtopicStore,
} from "../subtopics";
import { loadTopicStates, type PillarTopicState } from "../subtopicJobs";

export type OnboardingCtx = { userId: number; workspaceId: string };

const STEP_KINDS: Record<PersonalizationStep, PersonalizationItemKind[]> = {
  goal: ["goal", "niche", "language", "brand_description"],
  audience: ["audience"],
  pillars: ["pillar"],
};

const STEP_COLUMN = {
  goal: "goalStatus",
  audience: "audienceStatus",
  pillars: "pillarsStatus",
} as const;

export type OnboardingItemView = {
  id: string;
  kind: PersonalizationItemKind;
  payload: ItemPayloadByKind[PersonalizationItemKind];
  status: "suggested" | "confirmed";
  source: ItemRecord["source"];
  evidence: ItemRecord["evidence"];
};

export type OnboardingStateView = {
  resumeStep: ReturnType<typeof resolveResumeStep>;
  answers: {
    primaryUseCase: PrimaryUseCase | null;
    attributionSource: AttributionSource | null;
    attributionResolved: boolean;
  };
  profile: {
    id: string;
    platform: SocialPlatform | null;
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    followerCount: number | null;
    followingCount: number | null;
    postCount: number | null;
    status: SocialProfileStatus;
  } | null;
  analysis: {
    runId: string;
    status: AnalysisRunStatus;
    stages: Partial<Record<AnalysisStage, AnalysisStageStatus>>;
    errorCode: string | null;
    postsInWindow: number | null;
    /** Mobile 3c "Your best Reel". Real snapshot data only; null when not enough posts. */
    bestPost: BestPost | null;
  } | null;
  steps: Record<PersonalizationStep, StepStatus>;
  version: number;
  items: OnboardingItemView[];
  /**
   * Subtopics for the active profile, including dismissed rows.
   * Render status "suggested" or "confirmed" only. Dismissed rows are
   * returned so a client does not offer a topic the user already removed.
   * Empty when the table is not migrated yet.
   */
  pillarSubtopics: {
    id: string;
    pillarItemId: string;
    label: string;
    status: "suggested" | "confirmed" | "dismissed";
    dismissedFromStatus: "suggested" | "confirmed" | null;
    source: "ai_suggested" | "user_entered" | "user_edited";
  }[];
  /** Whether migrations 0104 and 0105 are verified. When false, no topics are shown or written. */
  subtopicStore: { ready: boolean; missing: string[] };
  /** Per live pillar: what the card should show (never generated, ready, failed, ...). */
  pillarTopics: Record<string, { state: PillarTopicState; attempts: number }>;
  completedAt: Date | null;
};

function notFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
}

async function activeProfileRow(db: Db, ctx: OnboardingCtx) {
  const rows = await db
    .select({ profile: socialProfiles })
    .from(workspaceMemberActiveProfiles)
    .innerJoin(
      socialProfiles,
      and(
        eq(socialProfiles.id, workspaceMemberActiveProfiles.socialProfileId),
        eq(socialProfiles.workspaceId, workspaceMemberActiveProfiles.workspaceId)
      )
    )
    .where(
      and(
        eq(workspaceMemberActiveProfiles.workspaceId, ctx.workspaceId),
        eq(workspaceMemberActiveProfiles.userId, ctx.userId),
        isNull(socialProfiles.deletedAt)
      )
    )
    .limit(1);
  return rows[0]?.profile ?? null;
}

async function requireActiveProfile(db: Db, ctx: OnboardingCtx) {
  return (await activeProfileRow(db, ctx)) ?? notFound();
}

async function ensureProgress(db: Db, profileId: string, workspaceId: string) {
  const rows = await db
    .select()
    .from(personalizationProgress)
    .where(eq(personalizationProgress.socialProfileId, profileId))
    .limit(1);
  if (rows[0]) return rows[0];
  try {
    await db.insert(personalizationProgress).values({ socialProfileId: profileId, workspaceId });
  } catch {
    // Created concurrently by another request: read it back below.
  }
  const again = await db
    .select()
    .from(personalizationProgress)
    .where(eq(personalizationProgress.socialProfileId, profileId))
    .limit(1);
  return again[0]!;
}

async function loadItems(db: Db, profileId: string): Promise<ItemRecord[]> {
  const rows = await db
    .select()
    .from(personalizationItems)
    .where(eq(personalizationItems.socialProfileId, profileId))
    .orderBy(personalizationItems.sortOrder, personalizationItems.createdAt);
  return rows.map(toItemRecord);
}

export async function loadOnboardingState(db: Db, ctx: OnboardingCtx): Promise<OnboardingStateView> {
  const [answersRow] = await db
    .select()
    .from(userOnboardingAnswers)
    .where(eq(userOnboardingAnswers.userId, ctx.userId))
    .limit(1);
  const profile = await activeProfileRow(db, ctx);
  const progress = profile ? await ensureProgress(db, profile.id, ctx.workspaceId) : null;
  const items = profile ? liveItems(await loadItems(db, profile.id)) : [];

  let analysis: OnboardingStateView["analysis"] = null;
  if (profile) {
    const [run] = await db
      .select()
      .from(profileAnalysisRuns)
      .where(
        and(
          eq(profileAnalysisRuns.socialProfileId, profile.id),
          eq(profileAnalysisRuns.workspaceId, ctx.workspaceId)
        )
      )
      .orderBy(desc(profileAnalysisRuns.createdAt))
      .limit(1);
    if (run) {
      const stageRows = await db
        .select()
        .from(profileAnalysisStages)
        .where(eq(profileAnalysisStages.runId, run.id));
      const stages: Partial<Record<AnalysisStage, AnalysisStageStatus>> = {};
      for (const s of stageRows) stages[s.stage] = s.status;
      analysis = {
        runId: run.id,
        status: run.status,
        stages,
        errorCode: run.errorCode,
        postsInWindow: run.postsInWindow,
        bestPost:
          run.status === "succeeded" || run.status === "partial"
            ? pickBestPost(run.sourceSnapshot)
            : null,
      };
    }
  }

  const steps: Record<PersonalizationStep, StepStatus> = {
    goal: progress?.goalStatus ?? "pending",
    audience: progress?.audienceStatus ?? "pending",
    pillars: progress?.pillarsStatus ?? "pending",
  };
  const confirmed =
    profile !== null && profile.status !== "pending_confirmation";
  const attributionResolved = Boolean(
    answersRow?.attributionAnsweredAt || answersRow?.attributionSkippedAt
  );
  return {
    resumeStep: resolveResumeStep({
      hasConfirmedProfile: confirmed,
      primaryUseCaseAnswered: Boolean(answersRow?.primaryUseCase),
      attributionResolved,
      stepStatus: steps,
      completedAt: progress?.completedAt ?? null,
    }),
    answers: {
      primaryUseCase: answersRow?.primaryUseCase ?? null,
      attributionSource: answersRow?.attributionSource ?? null,
      attributionResolved,
    },
    profile: profile
      ? {
          id: profile.id,
          platform: profile.platform,
          handle: profile.normalizedHandle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          bio: profile.bio,
          followerCount: profile.followerCount,
          followingCount: profile.followingCount,
          postCount: profile.postCount,
          status: profile.status,
        }
      : null,
    analysis,
    steps,
    version: progress?.personalizationVersion ?? 1,
    items: items.map(i => ({
      id: i.id,
      kind: i.kind,
      payload: i.payload,
      status: i.status as "suggested" | "confirmed",
      source: i.source,
      evidence: i.evidence,
    })),
    ...(await subtopicView(db, ctx, profile?.id ?? null, items)),
    completedAt: progress?.completedAt ?? null,
  };
}

async function setActive(db: Db, ctx: OnboardingCtx, profileId: string) {
  await db
    .insert(workspaceMemberActiveProfiles)
    .values({ workspaceId: ctx.workspaceId, userId: ctx.userId, socialProfileId: profileId })
    .onDuplicateKeyUpdate({ set: { socialProfileId: profileId } });
}

export type WorkspaceProfileView = {
  id: string;
  platform: SocialPlatform | null;
  handle: string | null;
  displayName: string | null;
  status: SocialProfileStatus;
  active: boolean;
};

/** Profiles in the caller's workspace only (Home "Your profiles"). */
export async function listWorkspaceProfiles(db: Db, ctx: OnboardingCtx): Promise<WorkspaceProfileView[]> {
  const active = await activeProfileRow(db, ctx);
  const rows = await db
    .select()
    .from(socialProfiles)
    .where(and(eq(socialProfiles.workspaceId, ctx.workspaceId), isNull(socialProfiles.deletedAt)))
    .orderBy(socialProfiles.createdAt);
  return rows.map(r => ({
    id: r.id,
    platform: r.platform,
    handle: r.normalizedHandle,
    displayName: r.displayName,
    status: r.status,
    active: active?.id === r.id,
  }));
}

/** Switch the member's active profile. Only a live profile of this workspace. */
export async function switchActiveProfile(db: Db, ctx: OnboardingCtx, profileId: string): Promise<void> {
  const [row] = await db
    .select({ id: socialProfiles.id })
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.id, profileId),
        eq(socialProfiles.workspaceId, ctx.workspaceId),
        isNull(socialProfiles.deletedAt)
      )
    )
    .limit(1);
  if (!row) notFound();
  await setActive(db, ctx, profileId);
}

/**
 * "That's me". Saves the confirmed public profile (public facts only, from
 * the lookup the user just saw) and makes it the member's active profile.
 * Re-confirming the same handle reuses the same row.
 */
export async function confirmProfile(
  db: Db,
  ctx: OnboardingCtx,
  preview: PublicProfilePreview
): Promise<{ profileId: string }> {
  const existing = await db
    .select({ id: socialProfiles.id, deletedAt: socialProfiles.deletedAt })
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.workspaceId, ctx.workspaceId),
        eq(socialProfiles.platform, preview.platform),
        eq(socialProfiles.normalizedHandle, preview.handle)
      )
    )
    .limit(1);
  const facts = {
    displayName: preview.displayName,
    avatarUrl: preview.avatarUrl,
    bio: preview.bio,
    followerCount: preview.followerCount,
    followingCount: preview.followingCount,
    postCount: preview.postCount ?? preview.videoCount,
    publicFactsFetchedAt: new Date(),
  };
  let profileId: string;
  if (existing[0] && existing[0].deletedAt === null) {
    profileId = existing[0].id;
    await db
      .update(socialProfiles)
      .set({ ...facts, status: "confirmed", confirmedAt: new Date() })
      .where(eq(socialProfiles.id, profileId));
  } else if (existing[0]) {
    // A soft-deleted row keeps the unique handle; bring it back instead of duplicating.
    profileId = existing[0].id;
    await db
      .update(socialProfiles)
      .set({ ...facts, status: "confirmed", confirmedAt: new Date(), deletedAt: null })
      .where(eq(socialProfiles.id, profileId));
  } else {
    profileId = randomUUID();
    await db.insert(socialProfiles).values({
      id: profileId,
      workspaceId: ctx.workspaceId,
      platform: preview.platform,
      normalizedHandle: preview.handle,
      ...facts,
      status: "confirmed",
      createdByUserId: ctx.userId,
      confirmedAt: new Date(),
    });
  }
  await ensureProgress(db, profileId, ctx.workspaceId);
  await setActive(db, ctx, profileId);
  return { profileId };
}

/** "I don't post yet": a profile with no handle, plus the niche the user picked. */
export async function startNotPostingYet(
  db: Db,
  ctx: OnboardingCtx,
  niche: { slug: string; label: string }
): Promise<{ profileId: string }> {
  const current = await activeProfileRow(db, ctx);
  let profileId: string;
  if (current && current.status === "not_posting_yet") {
    profileId = current.id;
  } else {
    profileId = randomUUID();
    await db.insert(socialProfiles).values({
      id: profileId,
      workspaceId: ctx.workspaceId,
      status: "not_posting_yet",
      createdByUserId: ctx.userId,
      confirmedAt: new Date(),
    });
  }
  const progress = await ensureProgress(db, profileId, ctx.workspaceId);
  await setActive(db, ctx, profileId);
  const items = liveItems(await loadItems(db, profileId));
  const currentNiche = items.find(i => i.kind === "niche");
  if (!currentNiche) {
    await insertItems(db, ctx, profileId, [
      userItem("niche", niche, progress.personalizationVersion),
    ]);
  } else if ((currentNiche.payload as { slug: string }).slug !== niche.slug) {
    await editItem(db, ctx, currentNiche.id, niche);
  }
  return { profileId };
}

export async function saveUseCase(db: Db, ctx: OnboardingCtx, value: PrimaryUseCase) {
  const now = new Date();
  await db
    .insert(userOnboardingAnswers)
    .values({ userId: ctx.userId, primaryUseCase: value, primaryUseCaseAnsweredAt: now })
    .onDuplicateKeyUpdate({ set: { primaryUseCase: value, primaryUseCaseAnsweredAt: now } });
}

/** A skip is stored as a null answer with skippedAt, never as "other". */
export async function saveAttribution(
  db: Db,
  ctx: OnboardingCtx,
  value: AttributionSource | null
) {
  const now = new Date();
  const set =
    value === null
      ? { attributionSource: null, attributionAnsweredAt: null, attributionSkippedAt: now }
      : { attributionSource: value, attributionAnsweredAt: now, attributionSkippedAt: null };
  await db
    .insert(userOnboardingAnswers)
    .values({ userId: ctx.userId, ...set })
    .onDuplicateKeyUpdate({ set });
}

function userItem<K extends PersonalizationItemKind>(
  kind: K,
  payload: ItemPayloadByKind[K],
  version: number
): Omit<ItemRecord<K>, "id"> {
  return {
    kind,
    payload,
    source: "user_entered",
    status: "confirmed",
    evidence: "user_provided",
    analysisRunId: null,
    basedOnVersion: version,
    dismissedAtVersion: null,
    supersedesItemId: null,
  };
}

async function insertItems(
  db: Db,
  ctx: OnboardingCtx,
  profileId: string,
  rows: Array<Omit<ItemRecord, "id">>
) {
  if (!rows.length) return [];
  const ids = rows.map(() => randomUUID());
  await db.insert(personalizationItems).values(
    rows.map((r, idx) => ({
      id: ids[idx],
      workspaceId: ctx.workspaceId,
      socialProfileId: profileId,
      kind: r.kind,
      payload: r.payload,
      source: r.source,
      status: r.status,
      evidence: r.evidence,
      basedOnVersion: r.basedOnVersion,
      dismissedAtVersion: r.dismissedAtVersion,
      supersedesItemId: r.supersedesItemId,
      analysisRunId: r.analysisRunId,
      createdByUserId: ctx.userId,
      sortOrder: 1000 + idx,
    }))
  );
  return ids;
}

async function itemOfActiveProfile(db: Db, ctx: OnboardingCtx, itemId: string) {
  const profile = await requireActiveProfile(db, ctx);
  const [row] = await db
    .select()
    .from(personalizationItems)
    .where(
      and(
        eq(personalizationItems.id, itemId),
        eq(personalizationItems.socialProfileId, profile.id),
        eq(personalizationItems.workspaceId, ctx.workspaceId)
      )
    )
    .limit(1);
  if (!row) notFound();
  return { profile, item: toItemRecord(row) };
}

/** Edit = supersede the old row and insert a confirmed user_edited row (history kept). */
export async function editItem(
  db: Db,
  ctx: OnboardingCtx,
  itemId: string,
  payload: ItemPayloadByKind[PersonalizationItemKind]
): Promise<{ itemId: string }> {
  const { profile, item } = await itemOfActiveProfile(db, ctx, itemId);
  const progress = await ensureProgress(db, profile.id, ctx.workspaceId);
  const plan = planItemEdit(item, payload, progress.personalizationVersion);
  const newId = randomUUID();
  await db.transaction(async tx => {
    const res = await tx
      .update(personalizationItems)
      .set({ status: "superseded" })
      .where(
        and(
          eq(personalizationItems.id, plan.supersedeItemId),
          inArray(personalizationItems.status, ["suggested", "confirmed"])
        )
      );
    const affected = (res as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
    if (affected === 0) {
      throw new TRPCError({ code: "CONFLICT", message: "This value changed. Reload and try again." });
    }
    await tx.insert(personalizationItems).values({
      id: newId,
      workspaceId: ctx.workspaceId,
      socialProfileId: profile.id,
      kind: plan.insert.kind,
      payload: plan.insert.payload,
      source: plan.insert.source,
      status: plan.insert.status,
      evidence: plan.insert.evidence,
      basedOnVersion: plan.insert.basedOnVersion,
      dismissedAtVersion: null,
      supersedesItemId: plan.insert.supersedesItemId,
      analysisRunId: plan.insert.analysisRunId,
      createdByUserId: ctx.userId,
    });
    // Subtopic rule for pillar edits (one rule, see docs/architecture/drafts/onboarding_v2_pillar_subtopics_contract.md):
    // - same title (description or share changed): every topic row, its status and its
    //   dismissals, and the generation job move to the new pillar item;
    // - changed title: nothing moves. The old topics stay on the superseded pillar as history,
    //   the new title starts with none, and an earlier dismissal still blocks that label under the old title.
    if (
      item.kind === "pillar" &&
      isSamePillarTitle(
        (item.payload as PillarPayload).title,
        (plan.insert.payload as PillarPayload).title
      )
    ) {
      await moveSubtopicsIfStoreReady(tx as unknown as Db, plan.supersedeItemId, newId);
    }
    if (plan.nextVersion !== progress.personalizationVersion) {
      await tx
        .update(personalizationProgress)
        .set({ personalizationVersion: plan.nextVersion })
        .where(eq(personalizationProgress.socialProfileId, profile.id));
    }
  });
  return { itemId: newId };
}

/** User types a new value (e.g. "+ Add an audience"). */
export async function addItem<K extends PersonalizationItemKind>(
  db: Db,
  ctx: OnboardingCtx,
  kind: K,
  payload: ItemPayloadByKind[K]
): Promise<{ itemId: string }> {
  const profile = await requireActiveProfile(db, ctx);
  const progress = await ensureProgress(db, profile.id, ctx.workspaceId);
  const [id] = await insertItems(db, ctx, profile.id, [
    userItem(kind, payload, progress.personalizationVersion) as Omit<ItemRecord, "id">,
  ]);
  return { itemId: id };
}

/**
 * Remove from the screen. A suggestion is dismissed (it will not come back
 * for the same answers); a confirmed value is superseded (kept as history).
 */
export async function removeItem(db: Db, ctx: OnboardingCtx, itemId: string) {
  const { profile, item } = await itemOfActiveProfile(db, ctx, itemId);
  const progress = await ensureProgress(db, profile.id, ctx.workspaceId);
  if (item.status === "suggested") {
    const plan = planDismiss(item, progress.personalizationVersion);
    await db
      .update(personalizationItems)
      .set({ status: "dismissed", dismissedAtVersion: plan.dismissedAtVersion })
      .where(and(eq(personalizationItems.id, item.id), eq(personalizationItems.status, "suggested")));
  } else if (item.status === "confirmed") {
    // The confirmed row is superseded and a tombstone copy is written in the same
    // transaction. The tombstone is what makes Undo exact: restoreItem rebuilds the
    // value from it. Regeneration never creates tombstones, so only a user removal can be undone.
    await db.transaction(async tx => {
      const res = await tx
        .update(personalizationItems)
        .set({ status: "superseded" })
        .where(and(eq(personalizationItems.id, item.id), eq(personalizationItems.status, "confirmed")));
      const affected = (res as unknown as [{ affectedRows?: number }])[0]?.affectedRows;
      if (affected === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "This value changed. Reload and try again." });
      }
      await tx.insert(personalizationItems).values(
        copyOfItem(item, {
          id: randomUUID(),
          workspaceId: ctx.workspaceId,
          socialProfileId: profile.id,
          status: "superseded",
          supersedesItemId: item.id,
          createdByUserId: ctx.userId,
        })
      );
    });
  }
}

/**
 * Moves a pillar's topics to its new item id. Only when the store is verified: with no
 * store there are no topic rows to move, and the state reports the store as not ready.
 */
async function moveSubtopicsIfStoreReady(tx: Db, fromItemId: string, toItemId: string): Promise<void> {
  const store = await verifyPillarSubtopicStore(tx);
  if (!store.ready) return;
  await repointPillarSubtopics(tx, { from: fromItemId, to: toItemId });
}

/**
 * Topic view for getState. Only live pillars are listed; history stays in the table.
 * With the store not ready, nothing is listed and no state is claimed.
 */
async function subtopicView(
  db: Db,
  ctx: OnboardingCtx,
  profileId: string | null,
  items: ItemRecord[]
): Promise<Pick<OnboardingStateView, "pillarSubtopics" | "subtopicStore" | "pillarTopics">> {
  const store = await verifyPillarSubtopicStore(db);
  if (!profileId || !store.ready) {
    return {
      pillarSubtopics: [],
      subtopicStore: { ready: store.ready, missing: store.ready ? [] : store.missing },
      pillarTopics: {},
    };
  }
  const livePillars = items.filter(i => i.kind === "pillar" && (i.status === "suggested" || i.status === "confirmed"));
  const liveIds = new Set(livePillars.map(p => p.id));
  const rows = await listProfileSubtopics(db, profileId, ctx.workspaceId);
  return {
    pillarSubtopics: rows
      .filter(s => liveIds.has(s.pillarItemId))
      .map(s => ({
        id: s.id,
        pillarItemId: s.pillarItemId,
        label: s.label,
        status: s.status,
        dismissedFromStatus: s.dismissedFromStatus,
        source: s.source,
      })),
    subtopicStore: { ready: true, missing: [] },
    pillarTopics: await loadTopicStates(db, {
      workspaceId: ctx.workspaceId,
      socialProfileId: profileId,
      pillarItemIds: [...liveIds],
    }),
  };
}

/** Every stored column of an item except the ones passed in `over` (used for tombstones and restores). */
function copyOfItem(
  item: ItemRecord,
  over: {
    id: string;
    workspaceId: string;
    socialProfileId: string;
    status: "confirmed" | "superseded";
    supersedesItemId: string;
    createdByUserId: number;
  }
) {
  return {
    ...over,
    kind: item.kind,
    payload: item.payload,
    source: item.source,
    evidence: item.evidence,
    basedOnVersion: item.basedOnVersion,
    dismissedAtVersion: null,
    analysisRunId: item.analysisRunId,
  };
}

/**
 * Undo of a removal. Rebuilds the removed value from its own stored row (payload,
 * subtopics and their removal states, evidence, source, run) and never from
 * client data. Refuses when the value was changed or was not removed by the user,
 * so a regenerated suggestion can never come back by accident.
 */
export async function restoreItem(db: Db, ctx: OnboardingCtx, itemId: string): Promise<{ itemId: string }> {
  const { profile, item } = await itemOfActiveProfile(db, ctx, itemId);
  const progress = await ensureProgress(db, profile.id, ctx.workspaceId);
  const conflict = (message: string) => new TRPCError({ code: "CONFLICT", message });

  if (item.status === "dismissed") {
    if (item.dismissedAtVersion !== progress.personalizationVersion) {
      throw conflict("Your answers changed, so this suggestion is no longer current.");
    }
    await db
      .update(personalizationItems)
      .set({ status: "suggested", dismissedAtVersion: null })
      .where(and(eq(personalizationItems.id, item.id), eq(personalizationItems.status, "dismissed")));
    return { itemId: item.id };
  }

  if (item.status !== "superseded") throw conflict("This value cannot be restored.");
  const successors = await db
    .select()
    .from(personalizationItems)
    .where(
      and(
        eq(personalizationItems.supersedesItemId, item.id),
        eq(personalizationItems.workspaceId, ctx.workspaceId),
        eq(personalizationItems.socialProfileId, profile.id)
      )
    );
  const tombstone = successors.length === 1 && successors[0].status === "superseded" ? toItemRecord(successors[0]) : null;
  if (!tombstone) throw conflict("This value was changed. Reload to see the current version.");
  const after = await db
    .select({ id: personalizationItems.id })
    .from(personalizationItems)
    .where(eq(personalizationItems.supersedesItemId, tombstone.id))
    .limit(1);
  if (after.length) throw conflict("This value was already restored.");

  const newId = randomUUID();
  await db.transaction(async tx => {
    await tx.insert(personalizationItems).values(
      copyOfItem(item, {
        id: newId,
        workspaceId: ctx.workspaceId,
        socialProfileId: profile.id,
        status: "confirmed",
        supersedesItemId: tombstone.id,
        createdByUserId: ctx.userId,
      })
    );
    // The removed pillar's subtopics come back with it, on the restored item.
    await moveSubtopicsIfStoreReady(tx as unknown as Db, item.id, newId);
  });
  return { itemId: newId };
}

/**
 * The step's main button ("Spot on", "Nailed it", ...) confirms the live,
 * non-stale suggestions of that step; "Skip" keeps them unconfirmed.
 */
export async function resolveStep(
  db: Db,
  ctx: OnboardingCtx,
  step: PersonalizationStep,
  action: "confirm" | "skip"
): Promise<{ steps: Record<PersonalizationStep, StepStatus> }> {
  const profile = await requireActiveProfile(db, ctx);
  const progress = await ensureProgress(db, profile.id, ctx.workspaceId);
  if (action === "confirm") {
    const items = await loadItems(db, profile.id);
    const ids = idsToConfirmForStep(step, items, progress.personalizationVersion);
    if (ids.length) {
      await db
        .update(personalizationItems)
        .set({ status: "confirmed" })
        .where(
          and(
            eq(personalizationItems.socialProfileId, profile.id),
            inArray(personalizationItems.id, ids),
            eq(personalizationItems.status, "suggested")
          )
        );
    }
  }
  const status: StepStatus = action === "confirm" ? "confirmed" : "skipped";
  await db
    .update(personalizationProgress)
    .set({ [STEP_COLUMN[step]]: status })
    .where(eq(personalizationProgress.socialProfileId, profile.id));
  const steps = {
    goal: progress.goalStatus,
    audience: progress.audienceStatus,
    pillars: progress.pillarsStatus,
    [step]: status,
  } as Record<PersonalizationStep, StepStatus>;
  return { steps };
}

/**
 * Finish onboarding. Writes the personalization completion AND the existing
 * users.onboardingCompletedAt flag, so the current OnboardingGate stops
 * redirecting (and a rollback to the old onboarding does not re-ask).
 * Every step is resolved first: unresolved steps count as skipped.
 */
export async function completeOnboarding(db: Db, ctx: OnboardingCtx) {
  const profile = await requireActiveProfile(db, ctx);
  const progress = await ensureProgress(db, profile.id, ctx.workspaceId);
  const steps: Record<PersonalizationStep, StepStatus> = {
    goal: progress.goalStatus,
    audience: progress.audienceStatus,
    pillars: progress.pillarsStatus,
  };
  const set: Record<string, unknown> = {};
  for (const s of PERSONALIZATION_STEPS) {
    if (steps[s] !== "confirmed" && steps[s] !== "skipped") {
      set[STEP_COLUMN[s]] = "skipped";
      steps[s] = "skipped";
    }
  }
  const now = new Date();
  if (!progress.completedAt) set.completedAt = now;
  if (Object.keys(set).length) {
    await db
      .update(personalizationProgress)
      .set(set)
      .where(eq(personalizationProgress.socialProfileId, profile.id));
  }
  await db
    .update(users)
    .set({ onboardingCompletedAt: now })
    .where(and(eq(users.id, ctx.userId), isNull(users.onboardingCompletedAt)));
  return { completed: isPersonalizationComplete(steps) };
}

/** Steps whose stage list is all present (used by tests and the API). */
export function emptyStages(): Partial<Record<AnalysisStage, AnalysisStageStatus>> {
  return Object.fromEntries(ANALYSIS_STAGES.map(s => [s, "waiting"])) as Partial<
    Record<AnalysisStage, AnalysisStageStatus>
  >;
}

export { STEP_KINDS };
