# Home v2 + New Onboarding: Phase 1 groundwork

Status: Phase 1 only. Flags added, OFF by default. No UI, no schema, no migrations.

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

## 2. Personalization data model (PROPOSED, not implemented)

Ownership: user (account answers) > workspace (owns social profiles) > social profile (owns analysis + personalization) > membership (active profile per member).

| Table / column | Purpose | Key rules |
|---|---|---|
| `social_profiles` | Instagram, TikTok, YouTube profiles per workspace | unique (workspaceId, platform, normalizedHandle); public facts + fetchedAt; `authorization` none / authorized / reconnect_required; soft delete |
| `workspaceMembers.activeSocialProfileId` | active profile per member | nullable |
| `users.primaryUseCase`, `users.attributionSource`, `*AnsweredAt` | step 3a and 3b answers | nullable; a skip stays null, never "Other" |
| `profile_analysis_runs` | one run per analysis | links to `durable_jobs` key `profile_analysis:{profileId}:{inputHash}`; status queued / running / partial / succeeded / failed; never deleted |
| `profile_analysis_stages` | per-stage status for the checklist | 4 stages, real status only |
| `personalization_items` | goals, audiences, pillars, niche, language | `source` ai_suggested / user_entered / user_edited; `status` suggested / confirmed / dismissed; `version`, `supersedesId`, `analysisRunId` |
| `personalization_progress` | one row per profile | per-step status pending / suggested / confirmed / skipped; `resumeStep`; `completedAt`; `personalizationVersion` |

State rules:

- Four separate signals: personalization completed, analysis completed, recommendations ready, 30-Day Plan available. None implies another.
- Confirmed items are never overwritten by AI. AI only adds new suggested rows.
- Editing a goal or audience writes a new row (old row superseded, kept), bumps `personalizationVersion`, and marks pillar suggestions from older versions stale. Analytics and run history are never deleted.
- Analysis runs on the existing durable job system (`server/durableJobs/`): add job type `profile_analysis`.
- Backfill: copy each user's `selectedNicheSlugs`, `businessDescription`, `targetAudience` into their personal workspace as `user_entered` + `confirmed`. Do not create a profile from `users.instagramHandle` (it is a carousel watermark today).
- During the flag period, `server/planCoachProfile.ts` reads new items first and falls back to the `users` columns.

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
