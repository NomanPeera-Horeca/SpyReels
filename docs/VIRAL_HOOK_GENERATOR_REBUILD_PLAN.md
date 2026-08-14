# Viral Hook Generator page rebuild plan

**Canonical URL (keep):** `https://spyreels.ai/free-tools/viral-hooks`  
**Optional vanity (later):** `301` from `/tools/viral-hook-generator` → canonical (only if we want StoryCut-style slug; not required to rank)  
**Status:** Wired to production `HookGenerator.tsx` (Aug 14 2026). Canonical remains `/free-tools/viral-hooks`.

---

## Current state (audit)

| Item | Today |
| --- | --- |
| Route | `/free-tools/viral-hooks` (legacy `/hooks` 301s here) |
| H1 | Free Instagram Viral Hook Generator |
| Title | Free Instagram Viral Hook Generator \| SpyReels |
| Tool UX | Idea + style + format + tone → 10 hooks, 2 free / email unlock → turn into script |
| Below fold | How it works, 10 patterns, 5 product FAQs |
| Missing vs Golden Standard | Byline + dates, richer H2 SEO body, comparison table, Related tools grid, SEO-intent FAQs |
| Missing vs StoryCut/Copy.ai | Social proof under hero, clean conversion card hierarchy, related free tools, educational SEO sections, strong product bridge CTA |

**PostHog last 28d:** `/free-tools/viral-hooks` ≈ **45 visitors**, **58 views**, ~**14.5 min** avg time on page, bounce ~22%. Engagement with the tool is decent; traffic and conversion architecture are the weak spots (vs Viral Reel Finder ~149 visitors).

---

## Keyword strategy (DataForSEO, US, Aug 14 2026)

Source: DataForSEO `keywords_data/google_ads/search_volume/live` + `dataforseo_labs/google/keyword_overview/live` + `related_keywords/live` (location 2840). Slight volume differences between Ads vs Labs are normal; **Labs overview used for KD + intent**.

### Core cluster (ranked)

| Keyword | Vol/mo (Labs) | Intent | KD | Role |
| --- | --- | --- | --- | --- |
| **hook generator** | **720** | transactional | 0 | Secondary in title/body (broader; Copy.ai competes) |
| **viral hooks** | **320** | informational | 0 | Blog/support content; link into tool |
| **ai hook generator** | **140** | transactional | 0 | Strong secondary (H2 / meta) |
| **viral hook generator** | **50** | transactional | 0 | **Primary H1** (exact StoryCut term, video-tool intent) |
| hook for reels | 50 | transactional | 3 | Supporting |
| copy ai hook generator | 50 | informational | — | Competitor PAS; FAQ only |
| hooks generator ai | 50 | — | 0 | Synonym / secondary |
| free hook generator | 40 | informational | 0 | Supporting |
| video hook generator | 40 | transactional | 0 | Supporting |
| tiktok hook generator | 30 | informational | 0 | Platform H2 |
| instagram hook generator | 30 | transactional | 0 | Platform H2 |
| free ai hook generator | 20 | informational | 0 | Supporting |
| instagram reel hook generator | 20 | transactional | 0 | Platform H2 |
| reel hook ideas / instagram reels hook ideas | 10–20 | — | — | Blog cluster |
| free viral hook generator / ai viral hook generator | null | — | — | Use in copy; no measured volume |

### Decision (locked for rebuild)

1. **Primary H1:** `Viral Hook Generator` (50 vol, transactional, KD 0, matches StoryCut + short-video intent).  
2. **Title should also harvest larger terms:** include Free + AI + Hook Generator (720 + 140).  
   Example: `Free Viral Hook Generator (AI) for Reels & TikTok | SpyReels`  
3. Do **not** make plain `hook generator` the only H1 (Copy.ai / generic GTM intent). Cover it in title + first 100 words.  
4. `viral hooks` (320) stays on **blog guides**; tool links from those posts.  

### Cannibalization (one keyword, one URL)

| Query family | Canonical |
| --- | --- |
| viral hook generator / free AI video hook generator | **This tool page** |
| Instagram Reels hook ideas / examples / patterns | Existing **blog** guides (link into tool) |
| Full script generator | AI Personal Brand Coach / Idea-to-script (not this page) |

Do **not** create a second indexable page for the same primary.

---

## What to steal from competitors (SpyReels brand, not clone)

### StoryCut pattern
1. Hero: badge + **exact primary H1** + short benefit line + social proof  
2. Tool card above the fold (topic + platform + tone + Generate)  
3. Product bridge: “You’ve got the hooks. Now remake / script the Reel.”  
4. Related free tools grid  
5. Long SEO body: why hooks matter, what makes a great hook (4 cards)  
6. FAQ with search-intent questions  
7. Final CTA band  

### Copy.ai pattern
1. Direct definition in first 100 words  
2. Who it’s for (creator roles)  
3. Step-by-step how to use  
4. Other tools footer cluster  

### SpyReels wedge (do not copy StoryCut editing pitch)
- Hooks tuned for **Reels / Shorts / TikTok** (spoken line + on-screen text)  
- Bridge to **Viral Reel Finder** + **full script / teleprompter** (not caption editor)  
- Keep existing generate → preview → email unlock → turn into script funnel (conversion engine already works)

---

## Proposed page architecture (Golden Standard)

**Meta**
- Title (~60): `Free Viral Hook Generator for Reels, TikTok & Shorts | SpyReels`
- Description (~155): benefit + free preview + CTA  
- Canonical: `/free-tools/viral-hooks`  
- Schema: SoftwareApplication + FAQPage + BreadcrumbList + author/publisher freshness if article-like body  
- Visible: By Noah Perry · Published · Updated · X min read  

**Above the fold**
1. Badge: Free tool · Viral hooks  
2. H1: `Viral Hook Generator` (primary keyword front)  
3. Subhead: one sentence (engage from the first second / first 2 seconds)  
4. Direct answer paragraph (first 100 words): what it is + why SpyReels  
5. Social proof line (honest: do not invent 10,000+; use real product proof or omit stars)  
6. Tool card (keep current controls; polish spacing like StoryCut)  

**Below the fold (H2s)**
1. How the viral hook generator works (3 steps)  
2. Why video hooks matter (2-second rule)  
3. What makes a great viral hook (4 cards: emotion, first impression, algorithm, open loop)  
4. Hook patterns table/list (keep 10 patterns; add platform notes)  
5. Viral hook generator vs ChatGPT / Copy.ai (comparison **table**)  
6. Related free tools (`RelatedToolsGrid`: Reel Finder, TikTok Finder, B-roll, script coach)  
7. You’ve got the hook. Now make the Reel (bridge CTA → signup / Viral Reel Finder)  
8. FAQ (min 5 SEO questions as H3 + FAQPage schema)  

**Suggested FAQ seeds**
- What is a viral hook generator?  
- Is there a free AI video hook generator?  
- How do I create a hook for Instagram Reels / TikTok?  
- What makes a good short-form video hook?  
- How is SpyReels different from Copy.ai or StoryCut?  

---

## Build phases (one change at a time after approval)

1. **Copy + meta + SEO body** on existing `HookGenerator.tsx` (no URL change)  
2. **Hero/tool visual polish** (spacing, proof, CTA hierarchy; mobile first)  
3. **RelatedToolsGrid + bridge CTA**  
4. **Optional:** vanity 301 `/tools/viral-hook-generator`  
5. Post-ship: GSC request indexing on canonical only; update internal links / footer if needed  

---

## Open decisions for Noman

1. Lock primary as **viral hook generator** (recommended) vs keep Instagram-first H1?  
2. Paste Ahrefs/SEMrush volumes for the cluster above?  
3. Social proof: what real number can we show (users, hooks generated, creators)?  
4. Approve build phase 1 (SEO copy + meta + sections) next?
