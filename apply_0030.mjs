Staging testing complete. 32/37 passed but 5 blockers + 5 high 
priority issues surfaced. Prioritized fix list below. Fix blockers 
first in the order specified. Don't auto-deploy. Push to staging, 
I'll re-test the blockers, then we ship.

==============================================================
BLOCKER 1 — First-time dashboard shows fake stats
==============================================================

Reproduction: Sign up a new user, complete onboarding (pick niches 
+ creators), click "Spy on them". Lands on dashboard showing:
- "You saved approximately 2.5 hours of manual research"
- "30 Reels Researched"  
- "0 Scripts Created, 0 Saved Reels, 0 Collected Reels"
- "Recent Spy Sessions: @garyvee completed · 30 reels · Last 365 
  days · 4/23/2026"

None of this is true. User just signed up. They never researched 
anything. The stats are fabricated from onboarding picks.

Root cause: The Home/Dashboard overview probably pulls 
`totalReelsAcrossAllJobs` which includes seeded demo jobs from the 
old ensureDemoJob path, and "2.5 hours saved" is computed from 
that count.

Fix:
1. Overview stats (reels researched, time saved, scripts, saved, 
   collected) should query ONLY user-originated data. Exclude 
   featured/demo job sources.
2. "Recent Spy Sessions" should list ONLY scrape_jobs the user 
   actually initiated (not featured views). Probably filter by 
   scrape_jobs WHERE isDemo = false OR a similar flag.
3. For brand-new users with zero activity: show an empty-state 
   UI with CTAs to start first search or browse featured creators. 
   Not fake numbers.

Empty state copy suggestion:
"Welcome to SpyReels. Start by searching a creator or exploring 
the featured grid. Your stats will build up as you research."

==============================================================
BLOCKER 2 — Em dash site-wide audit
==============================================================

Reproduction: Onboarding Step 1 shows "interested in — what you 
create, admire, or want to learn from. The more we know..." The 
em dash violates Noman's strict no-em-dash rule.

Fix: Grep the entire codebase for em dashes (— and --) in all 
user-facing strings. Replace with periods, commas, semicolons, or 
rephrase entirely.

Files to check: all .tsx files in client/src, all toast/error 
messages in server/, all marketing copy in landing pages.

Command to start:
  grep -rn "—" client/src server --include="*.tsx" --include="*.ts"
  grep -rn " -- " client/src server --include="*.tsx" --include="*.ts"

Report what you find. Fix each one. No em dashes anywhere.

==============================================================
BLOCKER 3 — Featured reel transcribe stuck on "Transcribing..."
==============================================================

Reproduction: Open /dashboard?featuredAccountId=X, click Transcribe 
on a reel. Toast shows "Transcription already available!" 
(bottom-right) but UI stays on "Processing/Transcribing..." state 
indefinitely.

Root cause: The cache-first transcribe.start endpoint (Commit 4b) 
correctly detects a cached transcript and returns it, but the 
frontend state machine in InlineWorkflow or ReelActionButtons 
isn't transitioning the local UI state from pending → completed.

Investigate:
1. Check transcribe.start mutation response shape when cache hit 
   vs live transcription. Is it returning the same shape?
2. Check the useEffect or onSuccess handler that updates local 
   state — is it reading the correct field?
3. Likely bug: the optimistic pending state overwrites the cached 
   completed state because mutation fires after cache arrived.

Fix: Ensure that when transcribe.start returns cached data 
(status='completed' with transcript populated), the local UI 
state immediately reflects completed. Skip any pending→processing 
state transitions for cache hits.

Toast should only show "Transcription ready" on cache hit, not 
"Transcription already available!" which reads like an error.

==============================================================
BLOCKER 4 — Featured grid transcribe UX is broken (redesign)
==============================================================

Reproduction: On featured creator dashboard, toggle to Grid view. 
Click Transcribe on a reel card. Instead of transcribing, the card 
shows a big panel: "Transcribe this reel to unlock Make My Version 
and workflow features" with ANOTHER "Transcribe Now" button. User 
has to click Transcribe TWICE to actually transcribe.

The non-featured creator dashboard (jobId= URL) does this 
correctly: click Transcribe → instant inline expansion with 
Transcript + Copy + Timestamped + SRT + Make this viral hit YOURS 
section. That's the pattern we want.

Fix: Match the user-scraped dashboard's inline expansion pattern 
for featured creator grid cards. Click Transcribe → expand card 
with transcript inline → show Make My Version section below → 
after generation, show generated script inline.

No intermediate "Transcribe this reel to unlock..." panel. Direct 
transcribe action on click.

Reference the working pattern in the InlineWorkflow component as 
used in List view. The Grid version needs the same behavior but 
may need layout tweaks since grid cards are narrower.

==============================================================
BLOCKER 5 — R-01: "Open My Script ✓" doesn't show script
==============================================================

Reproduction: Generate a script for a reel (Make My Version). 
Button changes to "Open My Script ✓" green. Click it. 

Expected: Immediately shows the generated script in an editor 
view (like the one that appears right after first generation 
completes) with Edit / Rewrite / Teleprompter controls.

Actual: Shows the "Make this viral hit YOURS" section AGAIN with 
Grade Level / Topic / Make My Version button. Under it, a tiny 
"Previous scripts: Same topic [Done]" chip on the LEFT that users 
miss entirely. User has to click that chip to see their existing 
script.

Fix: When clicking "Open My Script ✓":
1. Skip the "Make this viral hit YOURS" regeneration section
2. Scroll directly to / render the existing generated script 
   with full editor (Your Script, Viral Structure, Save & 
   Schedule sections)
3. Show Edit / Rewrite / Teleprompter buttons
4. If user wants to regenerate, they can click a "New" or 
   "Rewrite" button from the script editor view

Pattern: the script editor UI shown in the 3rd screenshot of 
@noman_peera reel #2 is the target state. User should land there 
directly.

==============================================================
HIGH 6 — "Going viral now" sidebar shows same creator 5x
==============================================================

Reproduction: On Naval dashboard, "Going viral now" sidebar shows 
Dan Martell 5 times with 339K, 210K, 161K, 103K, 78K views.

If these are 5 different viral REELS by Dan Martell, UI is wrong. 
Should show:
- Reel thumbnail (not creator avatar)
- Reel title (not creator name)
- View count

Current UI shows same creator face/name 5x, makes it look broken.

Fix: Update the GoingViralNow panel layout:
- Use featured_reel.thumbnailUrl as the main visual
- Show reel caption or title as primary text
- Creator name as secondary text below
- View count right-aligned

Reference: how ViralFindr shows trending reels — thumbnail-first, 
not creator-first.

==============================================================
HIGH 7 — Sidebar tooltip positioning covers nav items
==============================================================

Reproduction: Hover over "Collected Reels" in left sidebar. 
Tooltip appears ABOVE the item, covering the "Dashboard" menu 
item above it.

Fix: All sidebar item tooltips should position to the RIGHT of 
the item (Notion/Linear/Stripe pattern), not above or below. 
Tooltip placement should:
- Appear to the right of the sidebar
- Not overlap any other nav items
- Have a small arrow pointing left (to the source item)
- Have ~200ms delay before showing

Check all sidebar items: Dashboard, Spy Viral Reels, Collected 
Reels, Account Monitoring, My Scripts, Idea to Script, My Library, 
Saved Reels, Paste Script, Light mode, Settings, Billing.

==============================================================
HIGH 8 — /research page not cached, loads every time
==============================================================

Reproduction: Navigate to /research, wait for featured creators 
to load. Navigate away (Dashboard, Saved Reels, etc.). Navigate 
back to /research. Page shows full loading state again, even 
though nothing has changed.

Fix: Update the React Query config for the featured creators 
list query:
  staleTime: 5 * 60 * 1000  (5 minutes) OR
  staleTime: Infinity        (never stale, manual invalidation)

Since featured creators data changes rarely (manual seed updates), 
Infinity is fine. Invalidate the cache manually after any 
featured_accounts mutation.

Same fix applies to any niche-filtered featured account queries.

==============================================================
HIGH 9 — R-03: "Open My Script ✓" button shows too early
==============================================================

Reproduction: Click "Make My Version" on a transcribed reel. 
While generation is still in progress (10-20 sec), the button on 
the reel row already changes to green "Open My Script ✓".

User clicks it expecting to see the script. Gets a half-generated 
or empty state.

Fix: Add an intermediate "Generating..." state on the button:
- Click Make My Version → button shows "Generating..." with 
  spinner icon (disabled, not clickable)
- On mutation success → transition to "Open My Script ✓" green
- On mutation error → transition back to "Make My Version" + 
  toast with error

State machine:
  idle ("Make My Version") 
    → generating ("Generating..." + spinner, disabled)
    → complete ("Open My Script ✓" green, clickable)

==============================================================
HIGH 10 — SpyReels logo check
==============================================================

Reproduction: Onboarding shows "Spy" in white + "Reels" italicized 
in purple. Sidebar shows plain "SpyReels" in white.

Question: Is the italicized purple "Reels" treatment intentional 
across the whole app, or is onboarding a regression?

Action: Decide on the canonical logo style and apply it everywhere 
(onboarding, sidebar, landing page, emails). Consistency matters 
for brand trust.

==============================================================
MEDIUM 11 — SET-03 Your Interests layout pushes content down
==============================================================

Reproduction: Settings page. "Your Interests" section shows all 
niche options in an editable grid. Takes up significant vertical 
space, pushes Telegram Bot, Timezone, other settings way below 
the fold.

Fix options (pick one):
A) Collapsible section: "Your Interests" with expand/collapse, 
   collapsed by default showing only selected chips
B) Separate /settings/preferences sub-page, link from Settings
C) Move Your Interests into a modal triggered by "Edit interests" 
   button

Recommend Option A (collapsible) for simplicity.

==============================================================
MEDIUM 12 — First signup destination should not be overview
==============================================================

Reproduction: New user completes onboarding, clicks "Spy on them". 
Lands on /home which shows the fake stats dashboard (Blocker 1).

Fix: After first onboarding completion, redirect new users to 
/research (featured creators grid) instead of /home. This:
- Showcases the product value immediately
- Avoids empty stats dashboard awkwardness
- Guides them to click a featured creator (hero moment)

After user has completed at least one research session, they 
can go to /home for stats. Or merge /home and /research for 
new users.

==============================================================
EXECUTION PLAN
==============================================================

Fix in this order, push each to staging, I'll re-test:

Phase 1 (ship before TAAFT — blockers only):
  Commit A: Blockers 1, 2 (fake stats + em dashes)
  Commit B: Blockers 3, 4 (transcribe stuck + grid UX)  
  Commit C: Blocker 5 (Open My Script flow)
  Staging retest of all 5 blockers

Phase 2 (ship with or right after launch):
  Commit D: High 6, 7 (Going viral UI + sidebar tooltip)
  Commit E: High 8, 9 (page caching + generating state)
  Commit F: High 10 (logo consistency)
  Staging retest

Phase 3 (this week):
  Commit G: Medium 11, 12 (Settings layout + first destination)

Phase 4 (post-launch backlog):
  B-05, B-06 Saved reels edge cases (Noman will document)

Start Blocker 1 investigation now. Report findings before writing 
code so I can verify scope.import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config({ override: true });

const url = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  multipleStatements: true,
});
console.log(`Target DB: ${url.pathname.slice(1)} @ ${url.hostname}`);

async function tableColumns(table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return new Set(rows.map((r) => r.COLUMN_NAME));
}

try {
  const cols = await tableColumns("featured_accounts");
  const additions = [];
  if (!cols.has("bestPostingHour")) {
    additions.push("ADD COLUMN `bestPostingHour` INT NULL AFTER `lastFullScrape`");
  }
  if (!cols.has("bestPostingDay")) {
    additions.push("ADD COLUMN `bestPostingDay` VARCHAR(10) NULL AFTER `bestPostingHour`");
  }
  if (additions.length > 0) {
    console.log(`→ featured_accounts: ADD ${additions.length} column(s)…`);
    await conn.query(
      `ALTER TABLE \`featured_accounts\` ${additions.join(", ")}, ALGORITHM=INSTANT`
    );
    console.log("  ok");
  } else {
    console.log("→ featured_accounts posting time columns already present — skipping");
  }
  console.log("\n✓ Migration 0030 applied successfully.");
} catch (err) {
  console.error(`\n✗ Migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await conn.end();
}
