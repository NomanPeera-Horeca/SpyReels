# Onboarding v2: pillar subtopics and undo, data contract

Status: AWAITING CURSOR CONFIRMATION. Cursor owns the `pillar_subtopics` table
(migration `drizzle/0104_pillar_subtopics.sql`, branch `fix/personalization-reliability-20261019`)
and AI subtopic generation. This document describes how the Onboarding v2 editor
(PR #130) uses that table. It does not define a second storage design.

Items marked **[added by PR #130]** are additions to Cursor's
`server/personalization/subtopics.ts`. They need Cursor's review before merge.

## Where the data lives

One storage: the `pillar_subtopics` table, keyed by the pillar's item id.

- `pillarItemId` → `personalization_items.id` (the pillar row).
- `UNIQUE (pillarItemId, normalizedLabel)`: no duplicate topic on one pillar.
- `normalizedPillarTitle`: the key that keeps a dismissed topic dismissed under the same title, even after the pillar is edited.
- `status`: `suggested | confirmed | dismissed`. `dismissed` rows stay in the table so generation never recreates them.
- `source`: `ai_suggested | user_entered | user_edited`.

The payload of a pillar row holds only `{ title, description, viewSharePercent }`.
There is no subtopic JSON in `personalization_items.payload`.

## Reading

`getState` returns `pillarSubtopics` (Cursor's `listProfileSubtopics`), including
dismissed rows. The client shows a pillar's subtopics by matching `pillarItemId`
to the live pillar's id.

## Mutations (tRPC `onboardingV2`)

| Procedure | Behavior |
| --- | --- |
| `addPillarSubtopic({ pillarItemId, label })` | Cursor. Adds a `confirmed`, `user_entered` row. A dismissed label stays dismissed (`reason: "dismissed"`). |
| `dismissPillarSubtopic({ subtopicId })` | Cursor. Sets `dismissed`; the row stays. |
| `retryPillarSubtopics({ pillarItemId })` | Cursor. Generates subtopics for one pillar (LLM call, 12 s timeout). The client calls it only for pillars with no subtopic rows. |
| `restorePillarSubtopic({ subtopicId })` **[added by PR #130]** | Undo of a dismissal. See below. |

### restorePillarSubtopic (added by PR #130)

Compare-and-set, so it cannot revive anything else:

- Only a row whose status is `dismissed` changes. A live row is a no-op (`ok`).
- The owning pillar must be `suggested` or `confirmed`; otherwise `pillar_not_live`.
- No other row with the same `(pillarItemId, normalizedLabel)` may exist; otherwise `duplicate`.
- Status returns to the source's prior state: `ai_suggested` → `suggested`; `user_entered` / `user_edited` → `confirmed`.
- Scoped to workspace and social profile; another workspace gets `not_found`.

Client mapping: `not_found` → NOT_FOUND; `pillar_not_live` and `duplicate` → CONFLICT
("This topic can no longer be restored. Reload to see the current version.").

## Pillar identity changes (the main risk)

Editing a pillar creates a new item id (`editItem` supersedes the old row).
Subtopics must follow the pillar's meaning, not its row id.

- **Same-title edit** (description or share changed; title normalizes equal):
  `repointPillarSubtopics(from: old id, to: new id)` moves every row, dismissals
  included. **[added by PR #130]**
- **Title change**: no subtopics carry over. The new title starts with none; the
  old rows stay on the superseded pillar. Generation then sees the new pillar as
  missing subtopics. Dismissals are keyed by the normalized old title, so they do
  not block the new title. This is Cursor's rule.
- **Remove pillar** (confirmed): the row is superseded and a tombstone copy is
  written in one transaction. Its subtopic rows stay on the superseded id, hidden
  because the pillar is no longer live.
- **Undo pillar removal** (`restoreItem`): inserts the restored pillar and moves
  the removed pillar's subtopic rows onto it, in the same transaction. **[added by PR #130]**
- A second undo of the same removal is refused ("already restored").

`isSamePillarTitle` **[added by PR #130]** is the title comparison for the
same-title rule (`normalizeTopicLabel` on both sides; empty titles never match).

## Client behavior (Onboarding v2 editor)

- Remove a subtopic: `dismissPillarSubtopic`, then a toast with **Undo** for 6 s
  that calls `restorePillarSubtopic`, then a refresh.
- Retry: when the pillars step opens and no AI run is in progress, each pillar with
  no subtopic rows gets one `retryPillarSubtopics` call. A ref set makes it run once
  per pillar per screen visit. Failure leaves the pillar without subtopics; it does
  not block Continue.

## Open items for Cursor

1. Confirm `restorePillarSubtopic`: its semantics above, including restoring an AI topic to `suggested`.
2. Confirm `repointPillarSubtopics` on same-title edit and on undo, and that the title-change rule (no carry-over) matches generation.
3. Confirm the retry trigger: an LLM call on the pillars screen whenever a pillar has no subtopic rows. It is gated only by "no AI run in progress" and "no rows". Confirm cost and rate limits are acceptable.
4. `repointPillarSubtopics` returns quietly when the table is missing (before 0104). Confirm that is acceptable, or prefer failing loudly once 0104 is deployed.
5. Migration 0104 must be applied to a database before the feature is enabled there. Production application needs a separate approval.

## Known limits

- Pillars removed before this change have no tombstone and cannot be undone.
- A restored AI topic returns as `suggested`, not as an earlier confirmed state, because confirmation of AI topics is not stored separately.
