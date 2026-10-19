# Pillar subtopics API

Contract for onboarding v2 personalization. Draft until CTO QA approves both
this branch (`fix/personalization-reliability-20261019`, PR #132) and
`fix/onboarding-v2-confirmed-saves-20261019` (PR #130). Do not merge either
branch on its own.

`pillar_subtopics` is the only store. PR #130 must remove the JSON copy:

- `PillarPayload.subtopics`
- `shared/personalization/subtopics.ts` helpers (`visibleSubtopics`, `withSubtopicRemoved`)
- `setPillarSubtopicRemoved` and the `setSubtopicRemoved` procedure
- `planItemEdit` copying subtopics onto the new pillar payload
- pillar delete Undo that calls `addItem` with the old payload
- subtopic Undo that calls `setSubtopicRemoved` with `removed: false`

Table: `drizzle/0104_pillar_subtopics.sql`. Not applied to production from
this branch. Rows are never deleted. A title or description edit moves the
rows onto the new pillar id and keeps each status. `dismissedFromStatus` is
the status Undo restores.

## Read

`onboardingV2.getState` includes `pillarSubtopics`:

- `id`
- `pillarItemId` (the active pillar after an edit)
- `label`
- `status`: `suggested`, `confirmed`, or `dismissed`
- `source`: `ai_suggested`, `user_entered`, or `user_edited`

The list includes dismissed rows so the client does not offer them again.
Render `suggested` and `confirmed` only, and only when `pillarItemId` is a
live pillar (`suggested` or `confirmed`). An empty list means there are no
topics, or migration 0104 is not applied yet. Reads do not fail in that case.

## Dismiss

`onboardingV2.dismissPillarSubtopic({ subtopicId })`

Sets that row to `dismissed` and stores the previous status. The row stays.
A later generation or `addPillarSubtopic` for the same label on that pillar
returns `{ ok: false, reason: "dismissed" }`. Another workspace gets
`NOT_FOUND`.

## Restore

`onboardingV2.restorePillarSubtopic({ subtopicId })`

Returns that one row to `suggested` or `confirmed`. Other topics on the
pillar are unchanged, including ones the user dismissed on purpose.

`onboardingV2.restorePersonalizationItem({ itemId })`

Undo of a user delete. The same item id comes back (`suggested` if it was a
suggestion, `confirmed` if the user deleted a confirmed value), and its
subtopics stay on that id with their own statuses. A dismissed topic is not
resurrected.

Do not call this to undo an edit. A live successor makes it `CONFLICT`.
Call `editItem` with the previous payload instead. That moves the subtopics
again. Do not call `addItem` for Undo: a new id leaves the topics behind.

A row superseded by AI regeneration (no user-delete marker) is `CONFLICT`
and stays superseded.

## Retry

`onboardingV2.retryPillarSubtopics({ pillarItemId })`

Fills topics for one live pillar that has none. Dismissed labels are not
inserted again. Result: `{ ok: true, inserted }` or
`{ ok: false, reason: "not_found" | "failed" }`.

## Add

`onboardingV2.addPillarSubtopic({ pillarItemId, label })`

User-typed topic, stored as `confirmed`. Same label on that pillar returns
the existing id. A dismissed label is refused.
