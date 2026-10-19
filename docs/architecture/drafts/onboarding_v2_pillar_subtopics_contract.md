# Onboarding v2: pillar subtopics and undo, data contract

Status: PROPOSED for Cursor (owner of AI subtopic generation and backend intelligence).
Not yet confirmed by Cursor. Integration of a generator must wait for that confirmation.

## Where the data lives

No new table and no migration. Subtopics are stored inside the existing
`personalization_items.payload` JSON of a `kind = 'pillar'` row.

```json
{
  "title": "20-minute dinners",
  "description": "Fast recipes for weeknights.",
  "viewSharePercent": null,
  "subtopics": [
    { "id": "s1", "text": "One-pan meals", "removed": false },
    { "id": "s2", "text": "Budget weeknight recipes", "removed": true }
  ]
}
```

- `subtopics` is optional. Rows written before this change have no key, which means none.
- `id` is stable for the life of the pillar. Use a short unique string (max 64 chars).
- `text` is 1 to 60 characters, plain text.
- `removed: true` is kept, never deleted. A removed subtopic must not come back when the
  pillar is regenerated unless the pillar meaningfully changes (product rule).

## Who writes what

| Writer | May write |
|---|---|
| Client (users) | `title`, `description`, and `removed` on subtopics through `setSubtopicRemoved`. Never new subtopic text. |
| Server edit path | Keeps stored `subtopics` on every title or description edit (`planItemEdit`). The client cannot send `subtopics`; Zod strips it. |
| AI generator (Cursor) | Creates `subtopics` for new pillars, and regenerates them only when a pillar meaningfully changes. Must keep `removed` flags of existing subtopics that are still relevant. |

## Undo (exact restore)

- Removing a confirmed value writes two rows in one transaction: the old row becomes
  `superseded`, and a tombstone copy (`superseded`, `supersedesItemId` = old id) is inserted.
- `restoreItem` rebuilds the value from the tombstone's source row (payload, subtopics and
  removal states, evidence, source, analysis run) and inserts a new `confirmed` row.
- Restore is refused when the value was not removed by the user (for example a suggestion
  superseded by regeneration), or when it was already restored.
- A dismissed suggestion is restored only while `dismissedAtVersion` equals the current
  personalization version.

## Compatibility checklist for Cursor to confirm

1. Field names and types above match the generator's output.
2. Generator never deletes or re-IDs existing subtopics; it preserves `removed: true`.
3. Generator never writes `superseded` rows for user-removed values (only the tombstone
   path does that), so restore rules hold.
4. Coach profile resolver ignores `subtopics` (or agrees how it should use them).
