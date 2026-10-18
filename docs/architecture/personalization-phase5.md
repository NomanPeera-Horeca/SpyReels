# Personalization Phase 5: onboarding v2, Home v2, launch preparation

Status: built and tested locally on `feature/onboarding-home-v2`. Not pushed, not deployed. Production database NOT changed. Both switches default to `off`.

Launch path (CEO approved): Build, Verify, Deploy hidden, Test internally, CEO approval, then 100% of new signups. No percentage cohorts. Existing customers stay on today's experience.

## 1. Rollout switch and rollback (REPLACE build-time flags)

Server side, per signed-in user, read on every request (`shared/onboardingV2Access.ts`, `server/experienceAccess.ts`):

| Setting | Values | Default |
|---|---|---|
| `ONBOARDING_V2_MODE` | `off`, `internal`, `new_signups` | `off` |
| `HOME_V2_MODE` | `off`, `internal`, `new_signups` | `off` |
| `EXPERIENCE_V2_INTERNAL_EMAILS` | comma-separated test accounts | empty |
| `EXPERIENCE_V2_NEW_SIGNUPS_FROM` | ISO time; accounts created at or after it | empty (fails closed) |

- `internal`: admins and allowlisted emails only. `new_signups`: internal plus accounts created at or after the cutoff. Existing customers never qualify.
- Home v2 is only ever on for a user who also has onboarding v2.
- Safety net: until all seven personalization tables exist in that database, everyone gets the current experience whatever the modes say.
- Every onboarding v2 and Home v2 API procedure checks the switch (guard tests enforce this). Customers cannot reach them by calling the API directly.
- **Rollback: set `ONBOARDING_V2_MODE=off` and `HOME_V2_MODE=off`, restart.** No rebuild, no database change. Data already saved stays; users fall back to the current onboarding and the research page.

Launch settings after CEO approval: both modes `new_signups`, cutoff = the launch time.

## 2. Production database (Task 1): BLOCKED on access

This session has no production database access and does not request credentials. Done here:

| Check | Result |
|---|---|
| Migration numbers on GitHub (all 166 branches, 9 open PRs, 2026-10-16) | none at 0103 or above; `main` latest is 0102 and has not moved since this branch started |
| Draft schema vs SQL | identical (guard tests) |
| Local MySQL 8.0 | all real-database tests pass (schema, isolation, history, onboarding service, backfill) |
| Production preflight | NOT RUN (needs authorized access) |

To run (read only, refuses writes, never prints the connection string):

```
PREFLIGHT_DATABASE_URL='mysql://<read-only user>@<host>/<db>' pnpm exec tsx scripts/personalization-preflight.ts
```

It verifies applied migration history (hashes), MySQL version, collations of `users`, `workspaces`, `workspace_members`, and that none of the seven tables exist. Exit 0 only if all pass.

Migration plan (unchanged from Phase 3, needs CEO approval before any live change):

1. Preflight passes. CEO confirms the number (expected next: 0103, never assumed).
2. Railway managed snapshot of production (recovery point).
3. Copy `docs/architecture/drafts/onboarding_v2_personalization.sql` to `drizzle/migrations/<number>_onboarding_v2_personalization.sql`, apply once, record its hash.
4. Verify with the information_schema queries in `home-v2-phase1.md`; re-run the preflight (only "tables absent" should now fail).
5. Backfill dry run, review, then execute (`scripts/personalization-legacy-backfill.ts`, production needs `PERSONALIZATION_BACKFILL_ALLOW_PRODUCTION=yes` after approval).

Recovery: the migration only creates new tables (no ALTER on existing tables). Undo = switches `off`, then drop the seven tables in reverse dependency order, or restore the snapshot. Nothing existing reads them.

## 3. Backend (Task 2)

| Area | Classification | Where |
|---|---|---|
| Social profiles, active profile per member, profile list and switch | NEW | `onboardingService.ts` (`listWorkspaceProfiles`, `switchActiveProfile`) |
| Goal, Audience, Pillars persistence; edits supersede; history kept | REUSE (Phase 2 to 4) | `onboardingService.ts` |
| Resume state; Finish setup (`?step=`); Add profile (`?add=`) | EXTEND | `OnboardingV2Flow.tsx` |
| Profile analysis and AI suggestions | REUSE existing durable queue | `server/personalization/jobs.ts` |
| Provider budgets | REUSE (Phase 4 meter) | `scrapeCreatorsMeter.ts` |
| First analysis | included in onboarding, no research credits | `onboardingV2Router.confirmProfile` |
| "Try again" after a failed analysis | REUSE same run budget | `onboardingV2Router.retryAnalysis` |
| Home read model | NEW, read only | `server/personalization/home/homeService.ts`, `server/routers/homeV2Router.ts` |
| Videos for you | EXTEND Viral Posts browse: existing pools only | `browseIndexedViralPosts`, `findExistingPools` |

AI never blocks: every step can be confirmed, edited by hand or skipped; completion works with no AI result.

### Refresh allowance: PROPOSAL, needs CEO approval (not enabled)

User refresh is not exposed anywhere. Proposal:

- 1 refresh per social profile per 7 days, up to 4 per month, all plans, shown separately from research credits.
- Existing guards stay: 60-minute cooldown, 3 attempts x 25 provider requests per run, 150 posts.
- Cost ceiling: worst case about $0.15 provider + about $0.03 AI per refresh (estimated prices), so at most about $0.70 per profile per month; typical is a few cents per refresh.
- Background refresh stays off.

## 4. Onboarding UI (Task 3)

Built from the Figma design system (Foundation, Core Component, Pattern, Page):

- Steps 1, 2 (Instagram, TikTok, YouTube), 3a (locked), 3b, mobile-only 3c, 4a Goal, 4b Audience, 4c Pillars (build plan version, CEO decision), then Home.
- Edge cases: handle not found, private account, no public posts, I don't post yet (Figma edge-case frame 1078:1011), analysis failed (real failure only, "Try again"), manual entry everywhere, interrupted onboarding resumes on the server's next step.
- No invented numbers: analysis checklist shows the real job state only; the pillar "% of views" tile appears only for measured values; 3c shows the real best Reel only with 10+ analyzed posts; insight cards ("3.2x more views when...") are hidden until patterns are proven (Figma "insight not ready yet" fallback).

## 5. Home v2 (Task 5)

Figma Home v2 frames A to D and the States sheet are marked **provisional, review only** in Figma. Built as drawn, behind `HOME_V2_MODE`.

| Section | Source | Cost on render |
|---|---|---|
| Agent composer, quick actions | existing Agent (`/studio`) via its prefill; auto-submits once | none until the user submits |
| Paste a video link | existing Collected Reels link box | none |
| Ideas for your next video | existing 30-Day Plan cards | none |
| Videos for you | existing Viral Posts pools (no new pools, no refresh) | none |
| Creators going viral | stored featured catalog | none |
| Your profiles | personalization tables | none |

`/research` is unchanged. Desktop `/` shows Home v2 only for Home v2 users; research intent links still go to research. Sidebar gets a Home item only for Home v2 users.

Viral badge (locked rule): views at least 3x followers and at least 5,000 views; Healthy 5x, Strong 25x, Viral 100x, Explosive 500x; 3x to 5x shows no badge; no badge without a real follower count. Creator signal = best video in the last 90 days (engineering default, needs confirmation); stale or missing data hides the badge.

## 6. Visual QA (local, fixture data, against Figma)

| Screen | Figma | Result |
|---|---|---|
| 4a Goal | 1293:19647 | match; niche/language widths fixed to 317/190 |
| 4b Audience | 1216:178 | match to build plan rows; sentence wrap fixed |
| 4c Pillars | 1216:106 | match |
| 3c mobile | 1239:656 | match, pattern card hidden (no proven patterns) |
| Step 4 mobile | 390 wide | match; long main button fixed |
| Home A, B, C | 1353:2, 1365:21832, 1365:22572 | match (content area) |
| Home 1280x800 | 1353:503 | match; card actions fixed to fit |
| Home D, States sheet | 1366:2, 1378:2 | match |

Known differences: step 3 and 4 content starts 15px lower than the 4a frame on purpose (same top line on every step, no jump). Right-panel insight video on step 4 desktop uses the Figma fallback until patterns exist.

## 7. Decisions needed

1. Production preflight run (developer with Railway access), then migration approval.
2. Refresh allowance (section 3).
3. Home v2 design approval (Figma frames are provisional), plus: 90-day creator signal, tooltip text, Explosive badge color (uses warning tokens).
4. Theme: the locked tokens are light only and the app defaults to dark. Home v2 is built light (Figma) through one local color layer; a dark mapping can be added once Figma defines dark values.
5. Hidden deployment approval (switches off, internal emails only).
