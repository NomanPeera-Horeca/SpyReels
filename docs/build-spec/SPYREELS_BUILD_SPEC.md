# SpyReels Build Spec — Phase B + C + D-lite

**Scope:** Featured creators (Phase B), Dashboard sidebar + view toggle (Phase C), Spy branding + tooltips + onboarding (D-lite). Ship as ONE deploy.

**Source of truth for UI:** `spyreels-research-mockup-v2-2.html` and `spyreels-dashboard-mockup-v3-2.html`. Every layout, component, tooltip copy, modal copy, and behavior is demonstrated there. If the mockup and this spec disagree, mockup wins.

**Work order:** Sections are numbered so Cursor can execute them one at a time. Finish one, verify, then move to the next. Do NOT mass-edit.

---

## 0. Pre-flight checks

1. `git status` clean on branch `staging`
2. Run `pnpm tsc --noEmit` — must pass (0 errors)
3. Confirm Cursor already merged the 3 existing `featured.*` endpoints (`nicheGroups`, `accountsByNiche`, `topReels`) in `server/routers.ts`

---

## 1. Backend — add 2 new tRPC endpoints

**File:** `server/routers.ts`

### 1.1 `featured.relatedCreators`

Input: `{ nicheSlug: string, excludeAccountId?: number, limit?: number }` (default limit 5)

Output: array of `{ id, handle, displayName, followerCount, avgEngagementRate, profilePicUrl, nicheName }` ordered by `followerCount DESC`

SQL logic:
```sql
SELECT fa.id, fa.handle, fa.displayName, fa.followerCount,
       fa.avgEngagementRate, fa.profilePicUrl, n.name AS nicheName
FROM niches n
JOIN featured_account_niches fan ON fan.nicheId = n.id
JOIN featured_accounts fa ON fa.id = fan.accountId
WHERE n.slug = ?
  AND fa.isActive = true
  AND (fa.id != ? OR ? IS NULL)
ORDER BY fa.followerCount DESC
LIMIT ?
```

Convert `avgEngagementRate` decimal → `Number()` at API boundary.

### 1.2 `featured.classifyHandle`

Input: `{ handle: string, bio?: string, captions?: string[] }`

Output: `{ nicheSlug: string, nicheName: string, confidence: 'high' | 'medium' | 'low' }`

Logic:
- Build prompt with all 30 niche slugs + names
- Include handle, bio, and up to 5 top reel captions
- Send to Claude Sonnet with JSON mode
- Parse response, validate slug exists in DB, return

Prompt template:
```
You are classifying an Instagram creator into one of 30 niches for a content analytics tool.

Creator handle: @{handle}
Bio: {bio}
Recent reel captions:
- {caption1}
- {caption2}
...

Available niches (slug: name):
- business: Business & Entrepreneurship
- marketing: Marketing & Sales
... [all 30]

Return JSON only:
{
  "nicheSlug": "<one slug from the list>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence>"
}
```

Cache result on the scrape job row so we don't re-classify the same handle.

**Verification:** Run these 3 queries, all should return data:
```bash
# Against staging DB
pnpm tsx -e "
import { createCaller } from './server/routers';
const c = createCaller({ userId: 'test-user-id' });
console.log(await c.featured.relatedCreators({ nicheSlug: 'business', limit: 4 }));
"
```

---

## 2. Database — onboarding state fields

**File:** new migration `drizzle/0023_onboarding_state.sql`

```sql
ALTER TABLE users
  ADD COLUMN hasSeenWelcome BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN hasDismissedHintCard BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN hasCompletedFirstSpy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN hasDismissedDemoBanner BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN demoSeededAt DATETIME NULL;
```

Add 3 mutation endpoints in `server/routers.ts` under a new `onboarding` router:

- `onboarding.dismissWelcome()` → sets `hasSeenWelcome = true`
- `onboarding.dismissHintCard()` → sets `hasDismissedHintCard = true`
- `onboarding.dismissDemoBanner()` → sets `hasDismissedDemoBanner = true`

And one query:
- `onboarding.getState()` → returns all 4 booleans

---

## 3. Demo creator seeding on first signup

**File:** wherever signup completion is handled (likely `server/auth.ts` or a signup hook)

On first successful signup:
1. Copy `@therealbrianmark` (or `@garyvee` — pick the one with richest reels) from `featured_reels` into a new `scrape_jobs` row for this user
2. Mark `demoSeededAt = NOW()`
3. The user's Dashboard will now show this pre-populated data on first visit

This is the single biggest reducer of time-to-value. New user lands on Dashboard → sees 162 reels → understands the product before spending a credit.

---

## 4. Spy branding — 6 copy changes

Only these 6. Don't touch anything else.

| File | Find | Replace |
|------|------|---------|
| `client/src/components/Sidebar.tsx` (or nav) | `Research Viral Reels` | `Spy Viral Reels` |
| `client/src/pages/research.tsx` (page title) | `Research Viral Reels` | `Spy Viral Reels` |
| Same page (card heading) | `New Research Job` | `New Spy Session` |
| Same page (submit button) | `Start Research` | `Start Spying` |
| Same page (credit label) | `X/50 scrapes used this month` | `X/50 spy credits used this month` |
| Same page (featured section heading) | `Or explore viral creators` | `Or spy on top viral creators` |

Do NOT rename: Dashboard, Collected Reels, Account Monitoring, My Scripts, Idea to Script, My Library, Saved Reels, Settings, Billing, Transcribe, Export CSV, Connect to Sheets.

---

## 5. Global Tooltip component

**New file:** `client/src/components/Tooltip.tsx`

Requirements:
- Single shared DOM node appended to `<body>`
- Activated via `data-tip="..."` attribute OR React prop
- 250ms hover delay before show
- Smart position: above element by default, flip below if no room
- Max-width 260px, dark theme styling
- Small arrow pointing to element
- Long-press on mobile (touchstart + 500ms timer)

Copy the CSS and JS logic from the mockup's `#tooltip` element and `bindTooltips()` function. It already works.

Wire it up once in the app shell (probably `client/src/App.tsx`) so all `data-tip` attributes across the app are captured.

**Places to add `data-tip`:** see mockup files. Every sidebar item, icon button, info dot, status badge, metric display, view toggle, Export/Sheets buttons, related creator cards, AI badge, upgrade card credit counter.

---

## 6. `/research` page rebuild (per v2.2 mockup)

**File:** `client/src/pages/research.tsx` (or equivalent)

### 6.1 Structure (top to bottom)
1. Page header: icon + "Spy Viral Reels" title + description
2. **3-step hint card** (conditional: only if `!user.hasDismissedHintCard && !user.hasCompletedFirstSpy`). Exact layout and copy from mockup.
3. **New Spy Session** card (the form) — unchanged functionality, just new label
4. Soft divider
5. **Featured section** — eyebrow pill, "Or spy on top viral creators" heading, 2.5B+ followers copy
6. Niche pills row (all 30 from DB via `featured.nicheGroups()`)
7. Results meta row
8. Creator grid (3 columns on desktop, responsive)
9. "Load more creators" button (pagination, 12 at a time)
10. Info cards at bottom (Spy / Analyze / Transcribe)

### 6.2 Hint card behavior
- Shows for new users
- X button calls `onboarding.dismissHintCard()` mutation
- Auto-hides when `hasCompletedFirstSpy` becomes true (triggered when the first scrape job completes server-side)

### 6.3 Welcome modal
- Appears ONCE on first visit to the app (not every page load)
- Check `user.hasSeenWelcome`; if false, show modal, then call `onboarding.dismissWelcome()` on any action (close X / Start tour / Watch demo / overlay click)
- X button, "Take the 60-second tour" button, "Watch the 2-minute demo" button
- Tour action: for now just set a flag, actual Shepherd.js tour is Phase E
- Demo video: open Supademo embed (URL TBD — placeholder modal for now)

### 6.4 Niche pills behavior
- Clicking a pill filters creator grid client-side (we've already loaded all accounts via `accountsByNiche` or `nicheGroups`)
- Empty state if niche has 0 matching accounts

### 6.5 Creator card click
- Routes to `/dashboard?featuredAccountId={id}&from=featured`
- Backend resolves pre-scraped reels for this account (no new scrape)

---

## 7. `/dashboard` page updates (per v3.2 mockup)

**File:** `client/src/pages/dashboard.tsx` (or equivalent)

### 7.1 Layout becomes 2-column on desktop
- Main content: min 0, 1fr
- Right sidebar: 320px fixed, sticky
- On screens < 1100px: sidebar stacks below main content
- On screens < 700px: sidebar hidden or moved further below

### 7.2 View toggle (List / Grid)
- Place in toolbar row, top right, before Export CSV button
- Pill-style toggle, active state uses accent color
- List view is default (current existing layout)
- Grid view: `aspect-ratio: 9/14` cards with rank, ER% badge, caption overlay, views counter
- Persist choice to localStorage: `spyreels_dashboard_view`

### 7.3 Right sidebar — 3 panels

**Panel 1: "Top creators in this niche"**
- Niche tag (small pill) showing this creator's niche
- Subtitle: "Also spying on @X? These creators share the same niche." (or AI-classified variant)
- 4-5 related creator cards (call `featured.relatedCreators({ nicheSlug, excludeAccountId })`)
- Each card: avatar, name, @handle, followers · ER
- Clicking a card routes to `/dashboard?featuredAccountId={id}`
- "View all in niche →" link at bottom routes to `/research` with that niche pill pre-selected

**Panel 2: "Going viral now"**
- Same niche, filter for creators with 20%+ engagement boost in last 7 days
- For this deploy, can stub as "recent spike" if we don't have trend tracking yet
- 3 cards, same style as Panel 1

**Panel 3: Upgrade card**
- "5 of 20 spy credits left" (read from user's plan)
- Gradient background with accent color
- "Upgrade to Pro" button → routes to `/pricing`

### 7.4 Demo banner
- Shows at top of Dashboard when `scrapeJob.demoSeededAt IS NOT NULL` for this job AND `!user.hasDismissedDemoBanner`
- Copy: "📺 This is a demo dashboard. We've pre-loaded @therealbrianmark's reels so you can explore. Ready to spy on a real creator?"
- CTA button: "Start spying →" routes to `/research`
- X button calls `onboarding.dismissDemoBanner()`

### 7.5 AI badge for non-featured handles
- When user scrapes an arbitrary handle (not in featured list):
  1. After scrape completes, call `featured.classifyHandle({ handle, bio, captions })`
  2. Store `classifiedNicheSlug` on the scrape job row
  3. Dashboard displays niche with small `✦ AI` badge next to it
  4. Subtitle in right sidebar: "We analyzed @X's content and matched them to [niche]. Here are similar creators."

### 7.6 Empty state (no research yet, no demo seeded)
- Big centered empty state with icon
- "Your first spy session starts here"
- CTA: "Go to Spy Viral Reels"
- Sidebar hidden in this state

---

## 8. Analytics events

Use PostHog (already set up per memory). Fire these 4 events:

| Event name | When | Properties |
|------------|------|-----------|
| `welcome_modal_action` | User interacts with welcome modal | `{ action: 'tour_clicked' | 'demo_clicked' | 'dismissed' }` |
| `hint_card_dismissed` | User clicks X on 3-step hint card | `{}` |
| `demo_banner_cta_clicked` | User clicks "Start spying" on demo banner | `{}` |
| `first_spy_completed` | First scrape job completes for a user | `{ handle, nicheSlug, durationSeconds }` |

---

## 9. Testing checklist before merge

Run through these on staging:

**Research page:**
- [ ] Sidebar shows "Spy Viral Reels" (not Research Viral Reels)
- [ ] Welcome modal appears on first visit only
- [ ] Hint card appears for new users, dismisses on X click, stays dismissed after reload
- [ ] "Start Spying" button works (existing scrape flow unchanged)
- [ ] Credit counter says "spy credits"
- [ ] Featured creators grid loads, shows all 75
- [ ] Niche pills filter grid correctly
- [ ] Clicking a creator routes to `/dashboard` with pre-scraped data, no wait
- [ ] All tooltips work on hover (desktop) and long-press (mobile)
- [ ] Info icons (i) show correct tooltips

**Dashboard page:**
- [ ] Demo banner shows for first-time users with seeded data
- [ ] Banner X dismisses and stays dismissed
- [ ] List view is default, renders all 162 reels correctly
- [ ] Grid view toggles via top-right button, persists on reload
- [ ] Export CSV and Connect to Sheets unchanged
- [ ] Right sidebar shows 4-5 related creators
- [ ] Clicking a related creator navigates to their dashboard, sidebar updates
- [ ] AI badge appears for arbitrary handles (try scraping a random handle)
- [ ] Empty state shows for brand new users with no data
- [ ] All transcribe buttons, bookmark icons, external links work

**Mobile:**
- [ ] Sidebar collapses, all flows work on 375px width
- [ ] Long-press triggers tooltips
- [ ] Grid view responsive

**Migration:**
- [ ] 0023 migration applies cleanly on staging DB
- [ ] No data loss on existing users

---

## 10. Deploy sequence

1. Merge feature branch → `staging`
2. Push to GitHub
3. Manual deploy on Render (auto-deploy is broken per memory)
4. Run migration 0023 on Railway staging DB
5. Smoke test on staging.spyreels.com
6. Merge staging → main
7. Manual deploy production
8. Run migration 0023 on prod DB
9. Post-deploy smoke test

---

## Notes

- Don't touch `server/_core/voiceTranscription.ts` (separate feature)
- Use `pnpm add --config.strict-peer-dependencies=false` for any new deps
- tsconfig target is `es2020`
- NO em dashes anywhere in UI copy (per brand guideline)
- Reference mockups are the source of truth for all visual decisions
