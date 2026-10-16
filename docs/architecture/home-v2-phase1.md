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
- Server checks: `server/personalization/authorization.ts`, `server/personalization/analysisJobKey.ts`.
- Guards: `shared/personalization/schemaGuard.test.ts` keeps Drizzle and SQL identical (columns, enums, FKs, CHECKs, unique keys) and blocks accidental use.
- Real-database test: `shared/personalization/schema.mysql.test.ts` (runs only with `PERSONALIZATION_SCHEMA_TEST_DB`; skipped in CI).

Design change from the earlier proposal: **no ALTER on `users` or `workspace_members`.** Those tables are read on every request; new columns in Drizzle before the migration runs would break every query on them. Use case, attribution and active profile get their own tables instead. Rollback = drop the new tables.

### Everyone gets Goal, Audience and Pillars

There is no post-count threshold and no "not applicable" step. Missing history changes where suggestions come from, never whether a step is shown.

| Situation | Analysis availability | Suggestions allowed |
|---|---|---|
| Any account with 1+ analyzed posts | `available` | measured (`performance_backed`) + recommended (`profile_inferred`) |
| 0 public posts | `no_public_posts` | recommended only |
| Private account | `private_account` | recommended only |
| "I don't post yet" | `not_posting_yet` | recommended only |
| Analysis failed / not found | `unavailable` | recommended only |
| Analysis running | `in_progress` | recommended only (measured ones arrive later) |

Every item carries `evidence`: `performance_backed`, `profile_inferred` or `user_provided`, so the UI can label measured findings differently from AI recommendations. Numbers are blocked twice: `validateSuggestion` in code, and DB CHECKs (`performance_backed` needs a run; a pillar view share needs `performance_backed`). A user cannot type a "measured" number.

"I don't post yet" = a `social_profiles` row with status `not_posting_yet` and no handle. Its strategy carries over when the user later adds their handle.

### Isolation guarantees

| # | Requirement | Database | Server |
|---|---|---|---|
| 1 | Profile belongs to exactly one workspace | `workspaceId NOT NULL` + FK to `workspaces` | `assertSocialProfileInWorkspace` |
| 2 | No selecting another workspace's profile | FK `(socialProfileId, workspaceId)` to `social_profiles (id, workspaceId)`; FK `(workspaceId, userId)` to `workspace_members` | `buildActiveSelection` takes workspace and user from ctx only |
| 3 | Runs belong to the right profile and workspace | composite FK `(socialProfileId, workspaceId)` | `assertChildOfProfile` |
| 4 | Items cannot attach to unrelated profiles | composite FK `(socialProfileId, workspaceId)`; FK `(analysisRunId, socialProfileId)` to the run | `assertChildOfProfile` (also for the superseded item) |
| 5 | Switching workspace exposes nothing | every row pinned by composite FKs | `ctx.workspaceId` is membership-checked in `server/_core/workspaceContext.ts`; `resolveActiveProfileId` ignores foreign ids |
| 6 | No invalid active selection | selection FK targets `social_profiles (id, liveWorkspaceId)`: soft delete is refused while selected, and a soft-deleted profile cannot be selected; member removal cascades | `planProfileDeactivation` clears selections then soft deletes; readers ignore stale ones |
| 7 | Server-side permissions | n/a | NOT_FOUND for other workspaces; removing a profile is owner-only |

Tested on real MySQL 8.0 (`schema.mysql.test.ts`, 30 cases). Mutation checks (weakening a constraint) make the suite fail, so the tests do guard.

### History protection (analysis vs strategy)

| Rule | How it is enforced |
|---|---|
| Deleting, retrying or cleaning up an analysis run never deletes confirmed goals, audiences, pillars, niche or language | every FK between history tables is `ON DELETE RESTRICT`; a delete of anything still referenced is refused |
| Analysis history is not casually deleted | runs are append-only in product code; stages and items reference runs with RESTRICT; profiles and workspaces with history refuse hard delete |
| Confirmed values survive failure, cleanup and regeneration | failure and retry only change the run row; regeneration supersedes unconfirmed AI suggestions (`idsToSupersedeOnRegeneration`) and never touches confirmed, user-written or dismissed rows |
| Analytics separate from strategy | runs and stages never point at items; an item only cites a run for provenance (`evidence = performance_backed`) |
| Soft delete keeps history, removes selection | see isolation row 6 |
| Full erasure | explicit ops procedure, child-first order in `server/personalization/lifecycle.ts` (`PERSONALIZATION_PURGE_ORDER`), scoped to one workspace |

Only three FKs cascade, none on history: selection when a member leaves, selection when its profile row is purged, and a user's own onboarding answers when the user is deleted.

### Analysis retry and refresh

One run = one logical request. `decideAnalysisRequest` (pure) decides; the existing durable queue executes.

| Request | Identity (idempotency key) | Behaviour |
|---|---|---|
| Automatic retry | same key as the original request | durable job retries the same row (attempt counter, lease expiry); `enqueueDurableJob` requeues failed/dead in place; no new run, no duplicate provider work |
| Initial ("That's me") | account identity + `initial` | reloads and double taps reuse it; failed = retried in place; succeeded = reused (not re-run) |
| User refresh | account identity + refresh sequence n | allowed when no analysis is active, the cooldown since the last finished run has passed, and the existing usage-limit check allows it; creates run n+1 and keeps all earlier runs; two simultaneous taps compute the same n and collapse into one job |
| Background refresh | account identity + policy period index | off until a policy is approved; when on, only if the last success is older than the interval; schedulers in the same period collapse into one job |
| Private / not found / not posting yet | n/a | never triggers provider calls |

Simultaneous duplicates are prevented at three layers: `durable_jobs.idempotencyKey` UNIQUE (upsert), `profile_analysis_runs.idempotencyKey` UNIQUE, and `profile_analysis_runs.activeProfileSlot` UNIQUE (at most one queued/running analysis per profile, any kind). A real two-connection race test confirms exactly one wins.

PROVISIONAL policy values (`ANALYSIS_REFRESH_POLICY`, need CEO confirmation): user refresh cooldown 60 minutes; background refresh disabled; interval 7 days. Which usage counter a user refresh consumes is also a CEO decision.

### Seven-table review

| Table | Responsibility | Why separate | Could an existing table do it? | Multi-profile |
|---|---|---|---|---|
| `social_profiles` | identity + public facts of each account (or "not posting yet") | the owner of everything below; workspace-scoped | `users.instagramHandle` is one handle per user and means "carousel watermark". No. | one row per account |
| `workspace_member_active_profiles` | which profile each member is working on | per member, per workspace; changes often | `workspace_members` would need ALTER on a hot table. No. | switch without touching profiles |
| `user_onboarding_answers` | steps 3a + 3b (account level, not per profile) | different owner (user) and lifetime | `users` would need ALTER on the hottest table. No. | answered once per user |
| `profile_analysis_runs` | one row per analysis: inputs, status, post count | history, idempotency, links measured items to their run | `durable_jobs` is generic queue state and is cleaned up; it has no workspace or profile. No. | runs per profile |
| `profile_analysis_stages` | per-stage status for the checklist | 4 rows per run; updated independently by the worker | could be a JSON column on runs, but stage updates would race (read-modify-write). Kept separate. | n/a |
| `personalization_items` | goals, audiences, pillars, niche, language, with history | many rows per profile, versioned, with evidence | `users.selectedNicheSlugs/targetAudience` are single text fields with no history. No. | items per profile |
| `personalization_progress` | stepper status, version, completion per profile | one row per profile; read on every Home load | could be derived from items, but "skipped" and the version are user actions, not item facts. Kept. | progress per profile |

Conclusion: seven is the minimum that keeps one source of truth per fact without ALTERing hot tables. The only merge candidate is `profile_analysis_stages` into runs (JSON). Not recommended because of concurrent worker updates.

## 3. Migration gate (BLOCKED)

Checked again on 2026-10-16:

- `main` (ce3b64a): latest file `drizzle/0102_saved_reels_canonical_identity.sql`; duplicate-number check passes.
- All 166 remote branches and 128 PR heads: none contain `0103` or higher.
- Note: PR #28 (`feature/content-agent-runtime-v1`) has `0097_content_agent_runs.sql`, which collides with `main`'s `0097_ai_gateway_oauth.sql`.
- Production: **not verified** (no database access from this environment).

Exact checks needed before a number is assigned (read-only, run by someone with production access):

1. `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 15;` plus the applied-migrations log in `docs/deploy-notes/manual-migrations.md`: confirm 0102 is the latest applied and nothing higher exists.
2. `SELECT VERSION();` must be 8.0.16 or later (CHECK constraints are enforced from 8.0.16).
3. `SHOW CREATE TABLE workspaces; SHOW CREATE TABLE workspace_members; SHOW CREATE TABLE users;` collation must be `utf8mb4_0900_ai_ci` and `users.id` must be `int` (foreign keys fail otherwise).
4. `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('social_profiles','workspace_member_active_profiles','user_onboarding_answers','profile_analysis_runs','profile_analysis_stages','personalization_items','personalization_progress');` must return nothing.

Migration notes:

- The numbered migration must be the hand-written SQL, not `drizzle-kit generate` output: Drizzle does not write a collation, so generated SQL would inherit the server default. Both were loaded into MySQL 8.0 and compared via information_schema: identical columns, nullability, collations, generated columns, indexes, FKs with delete/update rules and CHECKs (only cosmetic literal-charset labels and `now()` vs `CURRENT_TIMESTAMP` differ).
- Ordering: one file, tables created parent first (`social_profiles` before its children). It depends only on `users`, `workspaces`, `workspace_members` (0000, 0042).
- Backward compatible: only new tables; no existing table, column or row is changed. Nothing reads the tables until Phase 3 code ships behind the flags.

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
