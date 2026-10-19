# Onboarding v2: pillar subtopics, edits, undo and topic ideas (data contract)

Status: AWAITING CTO QA and CURSOR CONFIRMATION (PR #130 and Cursor's PR #132).
Storage is Cursor's `pillar_subtopics` table. Migrations: `0104_pillar_subtopics.sql` (Cursor),
`0105_pillar_subtopic_recovery.sql` (PR #130: `dismissedFromStatus` and `pillar_subtopic_jobs`).

Items marked **[PR #130]** are additions beyond Cursor's `subtopics.ts`.

## Storage

- `pillar_subtopics`: one row per topic. `pillarItemId` → the pillar item. `UNIQUE (pillarItemId, normalizedLabel)`.
  `normalizedPillarTitle` is the dismissal key for a title. `status`: `suggested | confirmed | dismissed`.
  `dismissedFromStatus` **[PR #130]**: the status a topic had before the user dismissed it (`suggested | confirmed`), NULL otherwise.
- `pillar_subtopic_jobs` **[PR #130]**: one row per pillar item (`UNIQUE pillarItemId`). Records the explicit topic request:
  `status` (`running | succeeded | failed`), `attempts`, `lastError` (a short code, never message text), `lockedUntil`, `lastClaimedAt`.
- The pillar payload holds only `{ title, description, viewSharePercent }`. No subtopic JSON.

## Writers (every writer)

1. Lock the pillar row (`SELECT … FOR UPDATE`), then the topic rows. The unique key is the backstop.
2. Compare-and-set on the status it read. A lost race returns `conflict`, not success.
3. Scope every read and write to `workspaceId` and `socialProfileId`. Another workspace gets `not_found`.
4. **Store gate:** a write first verifies migrations 0104 and 0105 (`verifyPillarSubtopicStore`). If either is missing,
   the write throws `SubtopicStoreError` (tRPC `PRECONDITION_FAILED`). Nothing is written and nothing is called.

`getState` returns `subtopicStore: { ready, missing[] }`. When not ready: `pillarSubtopics` is empty and
`pillarTopics` is empty; the UI shows no topic line and no topic chips. Pillar saves still succeed.

## One rule for pillar edits (replaces the earlier "title or description" wording)

Pillar edits create a new pillar item id (`editItem` supersedes the old row). Two cases:

- **Same normalized title** (description or share changed): every topic row moves to the new id, keeping its
  status and its dismissals, and the generation job moves with it. Nothing is re-generated.
- **Changed normalized title**: nothing moves. The old topics stay on the superseded pillar as history.
  The new pillar starts with no topics (`never_generated`). A dismissal keeps blocking its label under the
  same title, so renaming back does not bring back a removed topic.

Cursor's PR #132 body says "a title or description edit moves those rows". That differs from the rule above for changed
titles. **Needs Cursor's decision.**

## Undo

- **Undo of one topic dismissal** **[PR #130]**: `restorePillarSubtopic` returns the topic to exactly
  `dismissedFromStatus`. It does not infer the status from `source`. Refused when:
  - `unknown_prior_state`: `dismissedFromStatus` is NULL (never guessed);
  - `pillar_not_live`: the owning pillar is not suggested or confirmed;
  - `duplicate`: another row holds the same label on that pillar;
  - `conflict`: a concurrent change moved it.
  A topic that is not dismissed returns `ok` as a no-op. Two simultaneous undos end in one exact result.
- **Undo of a removed pillar** (`restoreItem`): the pillar comes back as a new item id, and its topic rows and
  job move to it in the same transaction. A second undo is refused.
  **Difference from PR #132:** that body says undo restores *the same item id*. This branch restores a new id with the
  rows moved. **Needs Cursor's decision.**

## Topic ideas (AI generation): explicit, durable, bounded

Nothing generates topics on load, reload, pillar save, or pillar generation.
Pillar generation's own topic groups are still stored from that same request, as before.
Topic ideas run only when the user presses "Find topic ideas" or "Try again" (`requestPillarSubtopics`).

Server checks before any model call, all under the pillar lock:

| Check | Limit |
| --- | --- |
| Topics already live | no call (`already_has_topics`) |
| Job succeeded (even with zero or all-dismissed topics) | no call (`already_generated`); never auto-retried |
| Job running and lock not expired | no call (`in_progress`) |
| Attempts | at most **3** per pillar item (`exhausted` after that) |
| Cooldown | **60 s** between attempts on one pillar item (`cooldown`) |
| Profile claims | at most **10** pillars claimed per profile per hour (`rate_limited`) |
| Timeout | 12 s per model call |

A failed attempt records `failed` with a short error code. Two simultaneous requests for one pillar cause one call.

### State the card shows (`pillarTopics[pillarItemId].state`)

| State | Meaning | UI |
| --- | --- | --- |
| `never_generated` | no job, no topics | "Find topic ideas" |
| `generating` | a request is running | "Finding topic ideas…" |
| `ready` | at least one live topic | topic chips |
| `all_dismissed` | topics exist and the user removed all of them | "All topic ideas removed." (no call) |
| `no_topics` | generation succeeded with nothing usable | "No topic ideas came back…" (no call) |
| `failed` | last attempt failed, attempts left | "Topic ideas didn't load." + "Try again" |
| `exhausted` | last attempt failed, no attempts left | "Topic ideas couldn't load…" (no call) |

Cursor's PR #132 says a `retryPillarSubtopics` call runs for pillars with no rows. **That automatic trigger is removed.**
Cursor's `saveGeneratedSubtopics`, `pillarsMissingSubtopics` and the cache-hit fill in `recommendationService` are also
removed, because they made model calls with no user request.

## API (tRPC `onboardingV2`)

| Procedure | Behavior |
| --- | --- |
| `addPillarSubtopic({ pillarItemId, label })` | Confirmed `user_entered` topic. Dismissed label → `dismissed`. |
| `dismissPillarSubtopic({ subtopicId })` | Sets `dismissed` and records `dismissedFromStatus`. Idempotent. |
| `restorePillarSubtopic({ subtopicId })` **[PR #130]** | Exact undo (above). |
| `requestPillarSubtopics({ pillarItemId })` **[PR #130]** | The only generation path. Replaces `retryPillarSubtopics`. |

## Open items

1. Cursor and CTO: confirm the **one edit rule** (same title moves; changed title does not), against PR #132's body.
2. Cursor: confirm undo of a removed pillar restores a **new id with rows moved** (this branch), not the same id.
3. Cursor and CTO: confirm the limits above (3 attempts, 60 s cooldown, 10 pillars per profile per hour).
4. Migration `0105` must be applied after `0104`, then verified, before the feature is used in a database. Production
   application needs separate approval. `0105` is a one-time `ALTER`: the verifier reports whether it ran.
5. A missing store is reported in `getState.subtopicStore` and fails writes explicitly. Confirm this replaces the silent skip
   Cursor's `repointPillarSubtopics` had.

## Known limits

- Pillars removed before migration 0105 have no tombstone-linked topics to restore.
- A restored AI topic returns to its recorded status (`suggested` or `confirmed`). Statuses from before 0105 have no
  recorded status and are refused, not guessed.
- The hourly limit counts pillars claimed, not individual retries. Retries are bounded by the per-pillar attempts.
