# Home v2 + New Onboarding: Phase 1 groundwork

Status: flags added (OFF by default) and the personalization model drafted. No UI, no live schema, no migrations.

## 1. Feature flags

| Flag (env) | Client build var | Default | Effect when on |
|---|---|---|---|
| `ONBOARDING_V2_ENABLED` | `__ONBOARDING_V2_ENABLED__` | `false` everywhere | `/onboarding` renders `pages/OnboardingV2.tsx` (desktop and mobile) |
| `HOME_V2_ENABLED` | `__HOME_V2_ENABLED__` | `false` everywhere | desktop `/` renders `pages/HomeV2.tsx`. **Only when `ONBOARDING_V2_ENABLED` is also on.** |

- Parsing: `shared/homeV2FeatureFlags.ts`. On only for `true`, `1`, `yes`. Unlike `DISCOVERY_V1_ENABLED`, these stay off in development and test too.
- Client values are fixed at build time (`vite.config.ts` `define`). Rollback: unset the env var and redeploy. No database rollback.
- `VITE_HOME_V2_ENABLED` / `VITE_ONBOARDING_V2_ENABLED` are accepted as fallbacks, same as Discovery.
- Phase 1 placeholders: `HomeV2.tsx` re-exports the research page and `OnboardingV2.tsx` re-exports the current onboarding, so an accidental flag flip changes nothing.

### Routing rules (`resolveDesktopRootView`)

| URL | Flag off | Flag on |
|---|---|---|
| `/` | research | Home v2 |
| `/research` (any query) | research | research (never behind a flag) |
| `/?creator=x&start=1` (saved-search hand-off) | research | research |
| `/?platform=tiktok&jobId=42` (job deep link) | research | research |
| `/` with a handle stashed before sign-in | research | research |
| Mobile `/`, `/research` | redirect `/plan` | redirect `/plan` (unchanged) |

Known follow-up for when the flag is turned on: `pages/Dashboard.tsx:2432` sends "back" to `/`. It should point to `/research` before rollout.

## 2. Personalization data model (DRAFT, coded, not migrated)

Files:

- `shared/personalization/model.ts`: shared values (platforms, use cases, attribution, steps, statuses, stages).
- `shared/personalization/state.ts`: pure rules (resume step, four readiness signals, AI merge, edits, staleness, run status, handle parsing).
- `drizzle/personalizationSchema.ts`: Drizzle tables. Not in `drizzle.config.ts`, not imported by runtime code.
- `docs/architecture/drafts/onboarding_v2_personalization.sql`: matching SQL, unnumbered.
- Guards: `shared/personalization/schemaGuard.test.ts` keeps Drizzle and SQL identical and blocks accidental use.

Design change from the earlier proposal: **no ALTER on `users` or `workspace_members`.** Those tables are read on every request; new columns in Drizzle before the migration runs would break every query on them. Use case, attribution and active profile get their own tables instead. Rollback = drop the new tables.

| Table | Purpose | Key rules |
|---|---|---|
| `social_profiles` | Instagram, TikTok, YouTube profiles per workspace | unique (workspaceId, platform, normalizedHandle); soft delete; re-adding restores the row; `authorization` default none |
| `workspace_member_active_profiles` | active profile per member | PK (workspaceId, userId) |
| `user_onboarding_answers` | steps 3a and 3b | skip = null answer + `attributionSkippedAt`, never "other" |
| `profile_analysis_runs` | one row per analysis | unique `idempotencyKey` = durable job key `profile_analysis:{profileId}:{inputHash}`; never deleted |
| `profile_analysis_stages` | checklist stage status | PK (runId, stage); real job status only |
| `personalization_items` | goal, audience, pillar, niche, language | `source`, `status` (suggested / confirmed / dismissed / superseded), `basedOnVersion`, `supersedesItemId` |
| `personalization_progress` | stepper state per profile | goal / audience / pillars status incl. `not_applicable`; `personalizationVersion`; `completedAt`. Resume step is derived, not stored |

Every table carries `workspaceId` so every query filters by workspace.

State rules (all in `state.ts`, all tested):

- Four separate signals: personalization completed, analysis completed, recommendations ready, plan available.
- AI merge only inserts. It never suggests over a confirmed or user-written goal, niche or language, and never re-adds a dismissed item.
- Editing goal, audience or niche supersedes the old row, writes a confirmed `user_edited` row, bumps `personalizationVersion`, and makes older AI pillar suggestions stale. Nothing is deleted.
- Fewer than 10 posts: Audience and Pillars start as `not_applicable`.

Still to do after the migration number is confirmed: backfill from `users` columns into the personal workspace, `planCoachProfile` read-new-then-fallback, and the `profile_analysis` durable job type.

## 3. Migration gate (BLOCKED)

Checked on 2026-10-16:

- `main` (ce3b64a): latest file `drizzle/0102_saved_reels_canonical_identity.sql`.
- All 166 remote branches and 128 PR heads: none contain `0103` or higher.
- Note: branch `feature/content-agent-runtime-v1` (PR #28) has `0097_content_agent_runs.sql`, which collides with `main`'s `0097_ai_gateway_oauth.sql`.
- Production `__drizzle_migrations`: **not verified** (no database access from this environment).

Rule: no migration file is created until the CEO confirms the next number against production.

## 4. Component reuse map

| Figma | Production today | Class | Notes |
|---|---|---|---|
| App / Sidebar (1350:79) | `components/DashboardLayout.tsx` (`buildNavSections`), `WorkspaceSwitcher.tsx` | EXTEND | add Home nav item behind flag |
| Home / Agent Composer (1376:31) | `components/AiCoachCommandShell.tsx` | EXTEND | Home hands off via `STUDIO_PREFILL_KEY`; no second composer |
| Quick actions | capability chips in `AiCoachCommandShell` (`shared/studioCoachUi.ts`) | REUSE | labels need CEO choice |
| Home / Result Card compact (1364:22001) | `PlatformVideoCard.tsx`, `viral-posts/ViralPostCard.tsx` | EXTEND | add compact density to the canonical card; do not add a third card |
| Home / Creator Row (1376:2) | `CreatorSelectGrid.tsx`, Dashboard related creators | EXTEND | row layout variant |
| Home / Idea Card (1376:22) | `SparkDeckSection.tsx` | EXTEND | compact variant |
| Profile cards | none | NEW | needed for Step 2, 4a and Manage profiles |
| Goal selection (4a) | `NicheSelectGrid.tsx`, onboarding chips (`shared/onboardingFlow.ts`) | EXTEND | |
| Audience cards (4b) | onboarding audience chips | EXTEND | |
| Pillar cards (4c) | none | NEW | "% of views" tile must use real data |
| Personalization stepper | none (`AgentProgressPanel.tsx` is a progress list, not a stepper) | NEW | |
| Analysis checklist (3a/3b) | `components/AgentProgressPanel.tsx` | REUSE | states from real job status |
| Modal | `components/ui/dialog.tsx` | REUSE | |
| Empty / loading / error | `ui/empty.tsx`, `ui/skeleton.tsx`, `ui/alert.tsx` | REUSE | |

Every NEW or EXTEND item needs: purpose, existing alternative considered, and regression risk documented in its PR before it is built.
