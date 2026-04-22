# Staging test checklist — Section 3–8 launch

**Purpose:** End-to-end manual verification of everything shipped in
Sections 3–8 before cutting a prod release. Execute each scenario on
the staging deployment with a real browser; check the box once the
observed behavior matches **Expected** in all rows.

**Scope reminders**
- `FEATURE_LAUNCH_DATE_ISO = 2026-04-22T00:00:00Z`
  (`client/src/data/onboardingNiches.ts`). Users created **at or before**
  this timestamp are "pre-launch" and skip `/onboarding`; users created
  **after** it see the new flow.
- Migrations in this launch: **0023, 0024, 0025, 0026**.
- PostHog token: `VITE_PUBLIC_POSTHOG_TOKEN` on the staging build.

**Prep checklist (do once before starting)**

- [ ] Staging URL reachable, latest `staging` branch deployed
  (`git log -1 origin/staging` shows Section 3–8 commits).
- [ ] Access to staging DB (read + occasional write for test-user reset).
- [ ] Access to staging PostHog project; filter by your test email /
      distinct ID during the run.
- [ ] Two browser profiles / incognito windows for parallel test users
      (pre-launch user vs fresh-signup user).
- [ ] At least one featured-account niche is populated
      (`SELECT COUNT(*) FROM featured_account_niches;` > 0); otherwise
      `featured.relatedCreators` + onboarding creator step will appear
      empty regardless of code.

---

## A. Database migrations

Verify migrations **0023–0026** are applied on staging before any
scenario below runs.

| # | Check | SQL | Expected | Pass |
|---|--------|-----|-----------|------|
| A1 | Classify cache columns exist (**0023**) | `SHOW COLUMNS FROM scrape_jobs LIKE 'classified%';` | Rows: `classifiedNicheSlug`, `classifiedConfidence`, `classifiedAt` | [ ] |
| A2 | Onboarding flags exist (**0024**) | `SHOW COLUMNS FROM users WHERE Field IN ('hasSeenWelcome','hasDismissedHintCard','hasCompletedFirstSpy','hasDismissedDemoBanner','demoSeededAt');` | 5 rows returned | [ ] |
| A3 | `scrape_jobs.isDemo` column exists (**0025**) | `SHOW COLUMNS FROM scrape_jobs LIKE 'isDemo';` | Row with `Type=tinyint(1)`, `Default=0`, `Null=NO` | [ ] |
| A4 | Onboarding niche/completion columns exist (**0026**) | `SHOW COLUMNS FROM users WHERE Field IN ('selectedNicheSlugs','onboardingCompletedAt','onboardingSkippedAt');` | 3 rows returned | [ ] |
| A5 | No unapplied drift | `npx drizzle-kit check --config=drizzle.config.ts` (or equivalent) | No pending diff in applied migrations | [ ] |

---

## B. Fresh signup — Google OAuth

**Setup:** Use a brand-new Google account (or one never logged into
staging). Use a browser profile where you are signed out of everything.

| # | Step | Expected | Where to check | Pass |
|---|------|-----------|----------------|------|
| B1 | Load staging root URL unauthenticated | `LandingPage` renders; "Continue with Google" visible | `/` | [ ] |
| B2 | Click **Continue with Google**, complete consent | Redirect lands on `/onboarding` (not `/dashboard`) | URL bar | [ ] |
| B3 | `users` row created with correct `createdAt` | `createdAt` > `2026-04-22T00:00:00Z` | `SELECT id,email,createdAt FROM users WHERE email='<g-email>';` | [ ] |
| B4 | No `onboardingCompletedAt` / `onboardingSkippedAt` yet | Both `NULL` | Same row as B3 | [ ] |
| B5 | Fresh user-level event fired | `$identify` call for new `distinct_id` equals `users.id` (string) | PostHog → Activity, filter by user email | [ ] |

---

## C. Fresh signup — Email / Password

**Setup:** Fresh email not yet in `users`. Use the **Sign Up** tab on
the landing auth card.

| # | Step | Expected | Where to check | Pass |
|---|------|-----------|----------------|------|
| C1 | Switch auth card to **Sign Up** | Name field appears; Sign In / Sign Up toggle highlights Sign Up | Landing modal | [ ] |
| C2 | Submit name / email / password → success | Redirect to `/onboarding` | URL bar | [ ] |
| C3 | DB row exists with `loginMethod='password'` (or your email flag) and `passwordHash` is non-null | `SELECT loginMethod, passwordHash IS NOT NULL AS has_hash FROM users WHERE email='…';` | DB | [ ] |
| C4 | Onboarding state row exists via `trpc.onboarding.getState` | Response has all flags `false`, `selectedNicheSlugs=null` | Browser devtools → Network → `onboarding.getState` | [ ] |

---

## D. Onboarding — multi-niche + manual creator pick (happy path)

**Setup:** Fresh user from B or C sitting on `/onboarding` step 1.

| # | Step | Expected | Where to check | Pass |
|---|------|-----------|----------------|------|
| D1 | Step 1 UI renders | Niche grid with emoji, search input, "0 niches selected" pill | `/onboarding` | [ ] |
| D2 | Pick 3 niches (e.g. business, marketing, content) | Count pill updates to `3`; "3 niches selected" text | UI | [ ] |
| D3 | Click **Continue** | Transitions to step 2; progress bar full | UI | [ ] |
| D4 | `onboarding_niches_selected` fired | Event has `niche_slugs: [<3 slugs>]`, `count: 3` | PostHog events, filtered by user | [ ] |
| D5 | Creator cards grouped by niche render | One section per picked niche with avatars, followers, avg ER, reels count | UI | [ ] |
| D6 | Click a creator card | Card highlights; primary CTA changes to `Spy on <firstName>` | UI | [ ] |
| D7 | `onboarding_creator_selected` fired | `creator_handle` lowercased/stripped `@`; `is_pick_for_me: false` | PostHog | [ ] |
| D8 | Click the primary CTA | Completion screen ("Setting up your dashboard…") then redirects to `/dashboard?jobId=<demoId>` | URL bar | [ ] |
| D9 | `onboarding_completed` fired | `niches_selected: 3`, `demo_creator_handle` matches **seeded job handle** (may differ from pick if fallback), `demo_seeded: true` | PostHog | [ ] |
| D10 | DB reflects completion | `onboardingCompletedAt IS NOT NULL`, `selectedNicheSlugs` array has 3 slugs, `demoSeededAt IS NOT NULL` | `SELECT onboardingCompletedAt, selectedNicheSlugs, demoSeededAt FROM users WHERE id=?;` | [ ] |
| D11 | A `scrape_jobs` demo row exists | `isDemo=1`, `status='completed'`, `userId=<your id>`, `totalReels>0` | `SELECT id,handle,isDemo,status,totalReels FROM scrape_jobs WHERE userId=? ORDER BY id DESC LIMIT 1;` | [ ] |

---

## E. Onboarding — Skip path

**Setup:** Fresh user, back on `/onboarding` step 1 (reset flags in DB
if needed: see **§S — Resetting a test user** below).

| # | Step | Expected | Pass |
|---|------|-----------|------|
| E1 | Click **Skip setup →** in the top-right | Completion screen ("Picking a great default creator…"), then redirect to `/dashboard?jobId=<demoId>` | [ ] |
| E2 | `onboarding_skipped` event fires (no props) | Visible in PostHog | [ ] |
| E3 | `onboarding_completed` also fires | `niches_selected: 0`, `demo_seeded: true`, `demo_creator_handle: <richness-winner handle, lowercased>` | [ ] |
| E4 | DB: `onboardingSkippedAt IS NOT NULL`, `onboardingCompletedAt IS NULL`, `selectedNicheSlugs IS NULL` | Match | [ ] |
| E5 | Demo scrape job created (`isDemo=1`) | Match | [ ] |
| E6 | `/dashboard?jobId=...` loads seeded reels | Reels grid non-empty; no loading loop | [ ] |

---

## F. Onboarding — "Pick for me"

**Setup:** Fresh user on `/onboarding` step 2 with ≥1 niche picked.

| # | Step | Expected | Pass |
|---|------|-----------|------|
| F1 | Click the **Pick for me** tile at the bottom | One creator card in one of the niche sections becomes highlighted | [ ] |
| F2 | `onboarding_creator_selected` fires | `is_pick_for_me: true`; `creator_handle` is the highlighted creator, normalized | [ ] |
| F3 | Submit → onboarding completes successfully | `onboarding_completed` fires with matching `demo_creator_handle` | [ ] |
| F4 | If no creators exist across all picks, copy reads | "No creators in these niches? We'll choose a strong global default." | [ ] |
| F5 | Submitting with pick-for-me selected while `groupedCreators` is empty | No crash; either seed uses richness winner OR the button is a no-op that sets `null` | [ ] |

---

## G. Onboarding — Edge cases

| # | Step | Expected | Pass |
|---|------|-----------|------|
| G1 | Start onboarding, pick 2 niches, hard-refresh browser on step 1 | Loader renders briefly; state resets (step 1, no niches selected) — NOT an infinite loading screen | [ ] |
| G2 | Pick 2 niches, go to step 2, refresh | User lands back on step 1 with no niches selected; no client crash | [ ] |
| G3 | On step 1, click **Continue** without selecting any niche | Button disabled (opacity-40, not clickable) | [ ] |
| G4 | On step 2, click primary CTA without picking a creator | Button disabled | [ ] |
| G5 | Complete onboarding once → navigate to `/onboarding` manually | Instant redirect to `/dashboard` (`shouldBypassOnboarding` = true) | [ ] |
| G6 | Network fail `onboarding.complete` (offline mode / devtools block) | Redirect does **not** happen; loader clears; no event fires | [ ] |
| G7 | Network fail `onboarding.skip` | Same: no event fires, loader clears, user stays on onboarding | [ ] |

---

## H. Pre-launch (existing) user login

**Setup:** A user whose `createdAt <= '2026-04-22T00:00:00Z'`. If you
don't have one, update a throwaway test row:

```sql
UPDATE users SET createdAt='2026-04-21 12:00:00' WHERE id=<test id>;
```

| # | Step | Expected | Pass |
|---|------|-----------|------|
| H1 | Log in | Lands on `/` (or whatever they last used), **not** `/onboarding` | [ ] |
| H2 | Manually visit `/onboarding` | Redirect to `/dashboard` immediately (pre-launch bypass) | [ ] |
| H3 | `onboarding_*` events do **not** fire for this user | PostHog filter shows none | [ ] |
| H4 | `users` row has `onboardingCompletedAt=NULL` and `selectedNicheSlugs=NULL` (bypass is date-based, not flag-based) | DB query | [ ] |

---

## I. Demo dashboard visibility

**Setup:** Use the user from **D** or **E** — they have a demo
`scrape_jobs` row with `isDemo=1` and `hasDismissedDemoBanner=false`.

| # | Surface | Expected | Pass |
|---|----------|-----------|------|
| I1 | `/dashboard?jobId=<demo>` loads | Demo banner visible at top with "📺 This is a demo dashboard preloaded for you." and **Start a new spy session** CTA | [ ] |
| I2 | Banner dismiss button (X) | Click dismisses; banner disappears immediately | [ ] |
| I3 | Post-dismiss DB | `users.hasDismissedDemoBanner=1` | [ ] |
| I4 | AI badge renders when job has `classifiedNicheSlug` + `classifiedConfidence` | Badge shows "AI: <Niche> (high/medium/low)" with correct color | [ ] |
| I5 | AI badge hover | Tooltip: "AI-classified niche with <confidence> confidence" | [ ] |
| I6 | Right sidebar at ≥1024px: Related creators panel | Shows "Top creators in this niche" header with niche chip, 2–5 creator rows | [ ] |
| I7 | Related creators panel excludes current creator | None of the rows match `@<current handle>` | [ ] |
| I8 | Related creators panel links | Click routes to `/dashboard?featuredAccountId=<id>` which resolves to a new `scrape_jobs` row | [ ] |
| I9 | "Going viral now" placeholder | Visible with trending icon + "Trending creators coming soon" copy; no CTA | [ ] |
| I10 | Upgrade panel — **free / starter**: | "Unlock unlimited spying" copy + "View plans & billing" button to `/billing` | [ ] |
| I11 | Upgrade panel — **pro** (set `subscriptions.plan='pro'` for your user): | "Thanks for being on Pro" + "Go Business" text + "Manage billing" button | [ ] |
| I12 | Upgrade panel — **business / agency**: | Panel entirely hidden | [ ] |

---

## J. First real spy session (triggers `first_spy_completed`)

**Setup:** User who has `hasCompletedFirstSpy=false` in DB (brand-new
user from D/E qualifies).

| # | Step | Expected | Pass |
|---|------|-----------|------|
| J1 | From `/research`, enter a small-account public IG handle | Profile preview renders; Start button enabled | [ ] |
| J2 | Submit | Redirects to `/scraping?jobId=…` | [ ] |
| J3 | `research_started` fires | PostHog event with `handle`, `timeframe_days` | [ ] |
| J4 | Scrape runs to completion (watch progress) | Redirects to `/dashboard?jobId=…` once done | [ ] |
| J5 | DB: `scrape_jobs.status='completed'`, `isDemo=0` | Match | [ ] |
| J6 | DB: `users.hasCompletedFirstSpy` flips to `1` | `SELECT hasCompletedFirstSpy FROM users WHERE id=?;` | [ ] |
| J7 | PostHog: `first_spy_completed` fires **exactly once** | Props: `handle` (lowercased), `niche_slug` (may be `null`), `job_id` | [ ] |
| J8 | Start a **second** real scrape in the same tab | `first_spy_completed` does **NOT** fire again (guarded by `firstSpyMilestoneLoggedRef`) | [ ] |
| J9 | Start a second real scrape in a **new tab** after J6 | Still no fire (auth.me returns `hasCompletedFirstSpy=true` so the prior-value guard holds) | [ ] |

---

## K. Creator card click flow (`/research` → demo dashboard)

| # | Step | Expected | Pass |
|---|------|-----------|------|
| K1 | From `/research`, click a featured creator card | Navigates to `/dashboard?featuredAccountId=<id>` | [ ] |
| K2 | While `ensureDemoJob` runs | "Loading creator reels…" spinner | [ ] |
| K3 | After resolution | URL becomes `/dashboard?jobId=<newJobId>` (history replaced) | [ ] |
| K4 | DB | A new `scrape_jobs` row exists with `isDemo=1`, same `userId` | [ ] |
| K5 | If handle no longer active | "Featured creator unavailable" error card with Retry / Back | [ ] |

---

## L. Related creators sidebar navigation

**Setup:** `/dashboard?jobId=<completed non-demo or demo with niche>`.

| # | Step | Expected | Pass |
|---|------|-----------|------|
| L1 | Niche source = `classifiedNicheSlug` when present | Niche chip label matches classified niche | [ ] |
| L2 | Demo job with no classification but seeded via handle | Niche chip uses primary niche from `featured.accountContextByHandle` | [ ] |
| L3 | No classifiable niche AND not a recognized demo handle | Panel shows "Start exploring creators" CTA → `/research`, no creator list | [ ] |
| L4 | Click a related creator | `related_creator_clicked` fires with `from_creator_handle`, `to_creator_handle` (both lowercased), `from_niche` = slug used for the query | [ ] |
| L5 | Navigation | URL → `/dashboard?featuredAccountId=<id>` then `/dashboard?jobId=<id>` | [ ] |

---

## M. View toggle (List / Grid)

| # | Step | Expected | Pass |
|---|------|-----------|------|
| M1 | Load a completed `/dashboard?jobId=…`, default view is **List** | List layout renders | [ ] |
| M2 | Click **Grid** | Grid layout renders; `view_toggled` fires with `mode: "grid"` | [ ] |
| M3 | Click **Grid** again (already active) | `view_toggled` does **NOT** fire | [ ] |
| M4 | Click **List** | `view_toggled` fires with `mode: "list"` | [ ] |
| M5 | Grid column counts match spec | **<640px: 2**, **640–1023: 3**, **1024+: 4** | [ ] |

---

## N. Tooltips

Wrap the cursor/mouse so it hovers on each element ≥250ms (custom
`Tooltip` hover delay). On touch, long-press ≥500ms.

### N1. Sidebar nav (DashboardLayout, verbatim v2.2 strings)

| Item | Expected tooltip | Pass |
|-------|-------------------|------|
| Dashboard | "See past scrape results and saved reel data" | [ ] |
| Spy Viral Reels | "Spy on any public Instagram creator" | [ ] |
| Collected Reels | "Individual reels you've saved from past research" | [ ] |
| Account Monitoring | "Track & re-sync previously scraped creators" | [ ] |
| My Scripts | "Your AI-generated scripts library" | [ ] |
| Idea to Script | "Turn a rough idea into a viral-ready script" | [ ] |
| My Library | "Browse your hook library and templates" | [ ] |
| Saved Reels | "Reels you bookmarked for later" | [ ] |

### N2. Sidebar items that should **NOT** show a mockup tooltip

(They either use the collapsed-only shadcn tooltip showing the label,
or show nothing when expanded.)

- Paste Script
- Light/Dark mode
- Settings
- Billing
- Admin (admin users only)

### N3. Dashboard header / toolbar tooltips

| Element | Expected tooltip | Pass |
|----------|-------------------|------|
| Back arrow on job page | "Back to Spy Viral Reels" | [ ] |
| Status badge | "All reels successfully collected. Use Account Monitoring to re-sync." | [ ] |
| Date range select | "Filter reels by date posted" | [ ] |
| Sort select | "Change how reels are sorted" | [ ] |
| List/Grid toggle | "Switch between detailed list and visual grid view" | [ ] |
| Export CSV | "Download all reels data as a CSV file" | [ ] |
| Export Sheets | "Live-sync this data to a Google Sheet" | [ ] |
| AI badge | "AI-classified niche with <confidence> confidence" | [ ] |
| Demo banner close (X) | "Hide this banner" | [ ] |

### N4. Welcome modal + hint card

| Element | Expected tooltip | Pass |
|----------|-------------------|------|
| Welcome modal X | "Dismiss. We won't show this again." | [ ] |
| Hint card X | "Dismiss. We won't show this again." | [ ] |

---

## O. Welcome modal on first login

**Setup:** User with `hasSeenWelcome=false`.

| # | Step | Expected | Pass |
|---|------|-----------|------|
| O1 | Visit `/research` | Welcome modal opens automatically | [ ] |
| O2 | Click **60-second tour** | Modal closes; toast "Tour coming soon! Explore on your own for now."; `welcome_modal_action` fires with `action: "tour"` | [ ] |
| O3 | Reset `hasSeenWelcome=0`, reload, click **Watch 2-min demo** | Modal closes; demo toast; event fires with `action: "demo"` | [ ] |
| O4 | Reset, click **X** | Modal closes; event fires with `action: "dismiss"` | [ ] |
| O5 | Reset, click **Continue without walkthrough** | Modal closes; event fires with `action: "dismiss"` (conflated with X — intentional per spec) | [ ] |
| O6 | `users.hasSeenWelcome` is `1` after each close path | DB query | [ ] |
| O7 | Next visit does not re-open modal | `/research` renders cleanly | [ ] |

---

## P. 3-step hint card visibility + dismissal

**Setup:** User with `hasDismissedHintCard=false` AND
`hasCompletedFirstSpy=false`.

| # | Step | Expected | Pass |
|---|------|-----------|------|
| P1 | Visit `/research` (after closing welcome modal) | Hint card visible with 3 numbered steps | [ ] |
| P2 | Click X | Card disappears; `hint_card_dismissed` event fires; `users.hasDismissedHintCard=1` | [ ] |
| P3 | Complete first real spy (flow J) | `hasCompletedFirstSpy` flips to `1`; if hint card had been left alone, it now auto-hides on next `/research` visit | [ ] |
| P4 | Once dismissed OR completed first spy, hint card never reappears | Visit `/research` again | [ ] |

---

## Q. Sidebar responsive breakpoints

Resize viewport precisely using Chrome DevTools device toolbar.

| Width | Expected right-rail behavior | Main grid columns | Pass |
|-------|-------------------------------|--------------------|------|
| 375 (mobile) | Right rail stacks **below** main column; top border + padding separator visible | n/a (single column) | [ ] |
| 768 (tablet) | Stacks below (still <1024) | Reels grid: 3 columns | [ ] |
| 1024 (lg) | Rail becomes right column (320px); sticky scroll active | Reels grid: 4 columns | [ ] |
| 1279 (just below xl) | Same as 1024 (rail visible) — regression test for old `xl`-only bug | 4 columns | [ ] |
| 1280 (xl) | Same layout as 1024; nothing changes at this breakpoint | 4 columns | [ ] |
| 1440 | Same | 4 columns | [ ] |
| 1600 | Same | 4 columns (no 5-col tier yet) | [ ] |

**Sidebar nav (DashboardLayout):**

- [ ] Expand/collapse toggle works.
- [ ] Collapsed state shows only icons; hover shows the shadcn tooltip
      **only for items without a mockup tooltip** (Paste Script,
      theme, Settings, Billing, Admin). Items with mockup tooltips
      show the custom v2.2 Tooltip content instead.
- [ ] Resize handle: drag the right edge of the sidebar, width
      persists (localStorage `sidebar-width`).

---

## R. PostHog analytics — full event matrix

Filter each event by your test user's `distinct_id` in PostHog to
isolate the run. Confirm presence + property shape.

| Event | Fires on | Required props | Pass |
|--------|-----------|-----------------|------|
| `onboarding_niches_selected` | Step 1 **Continue** click | `niche_slugs: string[]`, `count: int` | [ ] |
| `onboarding_creator_selected` | Each creator card click + pick-for-me | `creator_handle: string`, `is_pick_for_me: bool` | [ ] |
| `onboarding_skipped` | Skip success (not alreadyDone) | *(none)* | [ ] |
| `onboarding_completed` | Complete OR skip success | `niches_selected: int`, `demo_creator_handle: string`, `demo_seeded: bool` | [ ] |
| `welcome_modal_action` | Tour / demo / dismiss / X / Continue without walkthrough | `action: "tour" \| "demo" \| "dismiss"` | [ ] |
| `hint_card_dismissed` | Hint X click (mutation success) | *(none)* | [ ] |
| `demo_banner_cta_clicked` | Banner CTA click | *(none)* | [ ] |
| `demo_banner_dismissed` | Banner X click (mutation success) | *(none)* | [ ] |
| `view_toggled` | List/Grid toggle when mode actually changes | `mode: "list" \| "grid"` | [ ] |
| `first_spy_completed` | First real job status transitions to completed | `handle: string` (lowercased), `niche_slug: string \| null`, `job_id: int` | [ ] |
| `related_creator_clicked` | Sidebar creator row click | `from_creator_handle: string`, `to_creator_handle: string`, `from_niche: string` | [ ] |
| `research_started` | Scrape submit on `/research` | `handle`, `timeframe_days` | [ ] |
| `user_signed_out` | Sidebar footer → Sign out | *(none)* | [ ] |

**Handle normalization check:** pick any 2 events with `handle` props
(e.g. `first_spy_completed`, `related_creator_clicked`). Confirm the
stored string is `lowercase`, has no leading `@`, no whitespace.

**Dedupe check:** events that should fire **only once** per qualifying
path:

- [ ] `onboarding_completed` — exactly once across the full signup →
      finish flow. Refreshing `/onboarding` after completion must not
      re-fire it.
- [ ] `first_spy_completed` — exactly once. Refresh the page after J7,
      confirm no duplicate.
- [ ] `hint_card_dismissed` — once per hint dismissal (not once per
      render of the dismissed state).

---

## S. Resetting a test user

Handy when re-running D / E / F / G / O / P back-to-back. Replace
`<uid>` with your test user's `users.id`.

```sql
-- Full reset: behave like brand-new signup
UPDATE users SET
  hasSeenWelcome=0,
  hasDismissedHintCard=0,
  hasCompletedFirstSpy=0,
  hasDismissedDemoBanner=0,
  demoSeededAt=NULL,
  selectedNicheSlugs=NULL,
  onboardingCompletedAt=NULL,
  onboardingSkippedAt=NULL
WHERE id=<uid>;

-- Drop demo scrape(s) so the next onboarding seed path runs clean
DELETE FROM scrape_jobs WHERE userId=<uid> AND isDemo=1;
```

Narrower resets:

```sql
-- Replay welcome modal only
UPDATE users SET hasSeenWelcome=0 WHERE id=<uid>;

-- Replay hint card only
UPDATE users SET hasDismissedHintCard=0 WHERE id=<uid>;

-- Replay demo banner dismiss
UPDATE users SET hasDismissedDemoBanner=0 WHERE id=<uid>;
```

---

## Sign-off

- [ ] All **Pass** boxes above checked (or failures filed as issues
      with links from this doc).
- [ ] PostHog Live Events shows clean, deduped firings matching the
      matrix in §R.
- [ ] No console errors across the flows (open DevTools during each
      section).
- [ ] No 500s in server logs across the flows.
- [ ] Staging DB matches expected state after each scenario's cleanup.

Once signed off, Section 9 is complete and Section 10 (prod deploy)
is unblocked.
