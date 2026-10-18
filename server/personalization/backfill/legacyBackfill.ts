/**
 * Legacy personalization backfill: PLANNER (pure, no database access).
 *
 * Copies what users already told SpyReels (users.selectedNicheSlugs,
 * users.businessDescription, users.targetAudience) into the new
 * personalization model, under the right workspace, without losing or
 * overwriting anything.
 *
 * Ownership rules:
 * - Legacy values are per USER. They go only to that user's own personal
 *   workspace (isPersonal = 1, ownerUserId = user, not deleted, user is a
 *   member). Team workspaces are never touched: one member's personal niche
 *   must not become a team's strategy.
 * - No personal workspace, or more than one: reported as ambiguous, skipped.
 * - The workspace has no live profile: create ONE "unlinked" profile (no
 *   handle, no platform). users.instagramHandle is NOT used: it is a carousel
 *   watermark, not a confirmed social account.
 * - Exactly one live profile: fill in only kinds that profile does not
 *   already have (live = suggested or confirmed). Newer values always win.
 * - More than one live profile: ambiguous, skipped (we cannot know which
 *   profile the legacy answers describe).
 *
 * Values are stored as source user_entered, status confirmed, evidence
 * user_provided: the user typed them; they are not AI suggestions.
 *
 * Idempotent: ids are deterministic (same input = same ids) and kinds that
 * already exist are skipped, so a second run plans nothing.
 */
import { createHash } from "node:crypto";
import { formatReelTaxonomyLabel } from "@shared/reelNiches";
import type {
  ItemPayloadByKind,
  PersonalizationItemKind,
  SocialProfileStatus,
} from "@shared/personalization/model";

export type LegacyUserRow = {
  id: number;
  selectedNicheSlugs: string[] | null;
  businessDescription: string | null;
  targetAudience: string | null;
};
export type WorkspaceRow = {
  id: string;
  ownerUserId: number;
  isPersonal: boolean;
  deletedAt: Date | null;
};
export type MembershipRow = { workspaceId: string; userId: number };
export type ProfileRow = {
  id: string;
  workspaceId: string;
  status: SocialProfileStatus;
  deletedAt: Date | null;
};
export type ItemRow = {
  socialProfileId: string;
  kind: PersonalizationItemKind;
  status: string;
};

export type PlannedProfile = {
  id: string;
  workspaceId: string;
  status: "unlinked";
  createdByUserId: number;
};
export type PlannedItem = {
  id: string;
  workspaceId: string;
  socialProfileId: string;
  kind: PersonalizationItemKind;
  payload: ItemPayloadByKind[PersonalizationItemKind];
  source: "user_entered";
  status: "confirmed";
  evidence: "user_provided";
  basedOnVersion: 1;
  sortOrder: number;
  createdByUserId: number;
};

export type UserOutcome =
  | "planned"
  | "already_backfilled"
  | "no_legacy_values"
  | "no_personal_workspace"
  | "multiple_personal_workspaces"
  | "multiple_profiles_in_workspace";

export type BackfillPlan = {
  profiles: PlannedProfile[];
  items: PlannedItem[];
  outcomes: Array<{
    userId: number;
    outcome: UserOutcome;
    workspaceId?: string;
    skippedKinds?: PersonalizationItemKind[];
  }>;
  counts: Record<UserOutcome, number> & {
    usersScanned: number;
    profilesPlanned: number;
    itemsPlanned: number;
    usersAlsoInTeamWorkspaces: number;
  };
};

/** Deterministic UUID-shaped id (sha256-based, version nibble 8). */
export function deterministicId(...parts: Array<string | number>): string {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function legacyValues(u: LegacyUserRow): {
  nicheSlugs: string[];
  brandDescription: string | null;
  audience: string | null;
} {
  const seen = new Set<string>();
  const nicheSlugs: string[] = [];
  for (const raw of u.selectedNicheSlugs ?? []) {
    const slug = typeof raw === "string" ? raw.trim() : "";
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      nicheSlugs.push(slug);
    }
  }
  return {
    nicheSlugs: nicheSlugs.slice(0, 5),
    brandDescription: u.businessDescription?.trim() || null,
    audience: u.targetAudience?.trim() || null,
  };
}

const LIVE = new Set(["suggested", "confirmed"]);

export function planLegacyBackfill(input: {
  users: LegacyUserRow[];
  workspaces: WorkspaceRow[];
  memberships: MembershipRow[];
  profiles: ProfileRow[];
  items: ItemRow[];
}): BackfillPlan {
  const plan: BackfillPlan = {
    profiles: [],
    items: [],
    outcomes: [],
    counts: {
      usersScanned: 0,
      profilesPlanned: 0,
      itemsPlanned: 0,
      usersAlsoInTeamWorkspaces: 0,
      planned: 0,
      already_backfilled: 0,
      no_legacy_values: 0,
      no_personal_workspace: 0,
      multiple_personal_workspaces: 0,
      multiple_profiles_in_workspace: 0,
    },
  };
  const memberOf = new Set(
    input.memberships.map(m => `${m.workspaceId}|${m.userId}`)
  );
  const wsById = new Map(input.workspaces.map(w => [w.id, w]));

  const record = (
    userId: number,
    outcome: UserOutcome,
    extra: Partial<BackfillPlan["outcomes"][number]> = {}
  ) => {
    plan.outcomes.push({ userId, outcome, ...extra });
    plan.counts[outcome]++;
  };

  for (const user of input.users) {
    plan.counts.usersScanned++;
    const teamMemberships = input.memberships.filter(
      m =>
        m.userId === user.id &&
        wsById.get(m.workspaceId) &&
        !wsById.get(m.workspaceId)!.isPersonal
    );
    if (teamMemberships.length > 0) plan.counts.usersAlsoInTeamWorkspaces++;

    const values = legacyValues(user);
    if (
      !values.nicheSlugs.length &&
      !values.brandDescription &&
      !values.audience
    ) {
      record(user.id, "no_legacy_values");
      continue;
    }

    const personal = input.workspaces.filter(
      w =>
        w.isPersonal &&
        w.ownerUserId === user.id &&
        w.deletedAt === null &&
        memberOf.has(`${w.id}|${user.id}`)
    );
    if (personal.length === 0) {
      record(user.id, "no_personal_workspace");
      continue;
    }
    if (personal.length > 1) {
      record(user.id, "multiple_personal_workspaces");
      continue;
    }
    const ws = personal[0];

    const liveProfiles = input.profiles.filter(
      p => p.workspaceId === ws.id && p.deletedAt === null
    );
    if (liveProfiles.length > 1) {
      record(user.id, "multiple_profiles_in_workspace", { workspaceId: ws.id });
      continue;
    }

    let profileId: string;
    if (liveProfiles.length === 1) {
      profileId = liveProfiles[0].id;
    } else {
      profileId = deterministicId("legacy-backfill-profile", ws.id);
      plan.profiles.push({
        id: profileId,
        workspaceId: ws.id,
        status: "unlinked",
        createdByUserId: user.id,
      });
      plan.counts.profilesPlanned++;
    }

    const existingKinds = new Set(
      input.items
        .filter(i => i.socialProfileId === profileId && LIVE.has(i.status))
        .map(i => i.kind)
    );
    const wanted: Array<{
      kind: PersonalizationItemKind;
      payload: ItemPayloadByKind[PersonalizationItemKind];
    }> = [
      ...values.nicheSlugs.map(slug => ({
        kind: "niche" as const,
        payload: { slug, label: formatReelTaxonomyLabel(slug) },
      })),
      ...(values.brandDescription
        ? [
            {
              kind: "brand_description" as const,
              payload: { text: values.brandDescription },
            },
          ]
        : []),
      ...(values.audience
        ? [
            {
              kind: "audience" as const,
              payload: { who: values.audience, outcome: "" },
            },
          ]
        : []),
    ];

    const skippedKinds = new Set<PersonalizationItemKind>();
    let added = 0;
    const perKindIndex = new Map<PersonalizationItemKind, number>();
    for (const w of wanted) {
      if (existingKinds.has(w.kind)) {
        skippedKinds.add(w.kind);
        continue;
      }
      const index = perKindIndex.get(w.kind) ?? 0;
      perKindIndex.set(w.kind, index + 1);
      plan.items.push({
        id: deterministicId("legacy-backfill-item", profileId, w.kind, index),
        workspaceId: ws.id,
        socialProfileId: profileId,
        kind: w.kind,
        payload: w.payload,
        source: "user_entered",
        status: "confirmed",
        evidence: "user_provided",
        basedOnVersion: 1,
        sortOrder: index,
        createdByUserId: user.id,
      });
      added++;
    }
    plan.counts.itemsPlanned += added;

    if (added === 0 && liveProfiles.length === 1) {
      record(user.id, "already_backfilled", {
        workspaceId: ws.id,
        skippedKinds: [...skippedKinds],
      });
    } else {
      record(user.id, "planned", {
        workspaceId: ws.id,
        ...(skippedKinds.size ? { skippedKinds: [...skippedKinds] } : {}),
      });
    }
  }
  return plan;
}
