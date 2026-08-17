# AI Script Generator marketing pages plan

**Status:** Wired to React Aug 17 2026. Mockups remain for reference. After deploy: GSC index the three canonicals.  
**Week of:** Aug 17 2026  
**Playbook:** Same as Viral Hook Generator. Pattern: **hub + platform-specific tool pages** (Restream / GravityWrite style).

---

## Product reality

| Surface | URL | Role today |
| --- | --- | --- |
| In-app studio | `/studio` (`AiCoach.tsx`) | Real script generator (gated) |
| Feature LP | `/features/ai-personal-brand-coach` | Markets “AI Personal Brand Coach” → `/studio` |
| Free Tools hub card | “AI Script Generator” | Currently links to Brand Coach feature page |
| Blog guide | `/blog/guide-instagram-reels-script-generator` | Educational; `sourceKeyword`: `instagram reels script generator` |

---

## Why ElevenLabs / Restream show stars and SpyReels does not

SERP stars are **not** from the on-page “4.5 stars + faces” UI. They come from Google reading **JSON-LD** on the page, usually:

- `SoftwareApplication` (or `Product` / `WebApplication`)
- with **`aggregateRating`** (`ratingValue`, `ratingCount`, `bestRating`)
- plus `offers` (`price: 0` → “Free”) and `applicationCategory` (→ “Multimedia” / “Utilities”)

**What SpyReels ships today** (e.g. Hook Generator): `SoftwareApplication` + `offers` + FAQ/Breadcrumb, but **no `aggregateRating`**. So Google can show a free tool result without stars.

**Ship rule for all new marketing free-tool pages:** add honest `aggregateRating` aligned with on-page proof (prefer **4.5**, count matching “Used by 12,000+” style social proof; never invent 5.0 or fake review counts). Google may still withhold rich results; schema is required but not guaranteed.

Also: many “script for tiktok” results are **transcript** tools (ElevenLabs, Tokscript). Keep **write-a-script** pages separate from **transcript** pages (already on todos).

---

## Keyword focus (Ubersuggest US + SERP, Aug 17 2026)

### Hub page (ship first)

| Keyword | Vol | SD | Role |
| --- | --- | --- | --- |
| **ai script generator** | **4.4K** | 44 | **Primary H1** |
| script generator | 3.6K | 36 | Title harvest (watch font/tattoo noise) |
| video script generator | 480 | 46 | Secondary |
| script generator free / ai | 390 / 320 | — | Supporting (Start free framing) |

**URL:** `/free-tools/ai-script-generator`  
**H1:** AI Script Generator  
**Title:** Free AI Script Generator for Reels, TikTok & Shorts | SpyReels

### Platform page A: TikTok (strongest specific volume)

| Keyword | Vol | SD | Role |
| --- | --- | --- | --- |
| **tiktok script generator** | **880** | **25** | **Primary** |
| AI TikTok script generator | (PASF / Restream H1) | easy SERP | Title / H1 variant |
| script for tiktok / TikTok video script generator | PASF | — | Supporting / FAQ |

**URL:** `/free-tools/tiktok-script-generator`  
**H1:** AI TikTok Script Generator  
**Title:** Free AI TikTok Script Generator | SpyReels  
**Competitor pattern:** Restream tool-first (topic + vibe → Generate)

### Platform page B: Instagram Reels

| Keyword | Vol | SD | Role |
| --- | --- | --- | --- |
| **instagram reels script generator** | (blog owns *guide*; tool owns *product*) | — | Prefer this over bare “instagram script” |
| script for instagram reel(s) | GravityWrite ranks; “instagram script” only **~210** | — | Title / H1 harvest |
| how to script instagram reels | low | — | FAQ / H2 |

**URL:** `/free-tools/instagram-reels-script-generator`  
**H1:** Instagram Reels Script Generator (or AI Script Generator for Instagram Reels)  
**Title:** Free Instagram Reels Script Generator | SpyReels  
**Cannibalization:** Blog keeps how-to guide; this page is the **tool**. Cross-link both ways.  
**Competitor pattern:** GravityWrite `/tools/script-for-instagram-reel`

### Later (same family, not blocking)

| Keyword | Vol | SD | Page |
| --- | --- | --- | --- |
| youtube script generator | 880 | 18 | `/free-tools/youtube-shorts-script-generator` (phase 2) |

**Ignore:** script lettering / tattoo / font generators.

---

## Cannibalization (one keyword, one URL)

| Query family | Canonical |
| --- | --- |
| ai script generator / video script generator (platform-agnostic) | Hub `/free-tools/ai-script-generator` |
| tiktok script generator / AI TikTok script generator / script for tiktok (write) | TikTok tool page |
| instagram reels script generator / script for instagram reel (write) | Instagram tool page |
| how to use / edit / human voice | Blog guide |
| AI Personal Brand Coach / Studio brand | `/features/ai-personal-brand-coach` |
| Reel/TikTok/YouTube **to text** / transcript | Separate transcript pages (todos) |

Hub links to platform pages. Platform pages link back to hub + related tools. Do **not** put TikTok primary on the hub H1.

---

## SpyReels wedge (every page must scream this)

Competitors often dump spoken lines only. SpyReels output is a **ready-to-film pack**:

1. **Spoken script** (HEIT: Hook → Engagement → Insight → Takeaway)  
2. **Production / filming notes** (shots, B-roll cues, delivery)  
3. **On-screen caption / text**  
4. **Music / audio direction** (mood, energy; not pirated track IDs)  
5. Bridge into **Studio + teleprompter + remake from viral Reels**

Hero subcopy and first 100 words must say this. Mockup results UI should show labeled sections for each, not a single blob of dialogue.

---

## Page pattern (hub + each platform page)

1. Badge + exact primary H1 + benefit (script **+** notes / caption / music) + social proof  
2. Tool card above fold (topic + length/tone; platform page locks platform) → generate preview → Start free → Studio  
   - Hub CTA: **Generate Viral Script**  
   - Instagram CTA: **Generate Instagram Script**  
   - TikTok CTA: **Generate TikTok Script**  
   - Never use “Film Pack” on buttons (pack = output tabs / body copy only)  
3. Result preview cards: Script · Filming notes · Caption · Music  
4. Product bridge + related tools (sibling platform pages + hooks + finder + B-roll)  
5. SEO body + comparison table + FAQ (5+)  
6. Schema: SoftwareApplication **with aggregateRating** + FAQPage + BreadcrumbList  

**Copy bans:** no “no card required”, no “unlock with email”. Prefer Start free.

---

## Golden Standard pre-ship checklist

- [ ] One H1 = primary keyword per URL  
- [ ] Direct answer in first 100 words (includes production pack wedge)  
- [ ] Full meta + canonical + OG/Twitter  
- [ ] SoftwareApplication **+ aggregateRating** + FAQPage + BreadcrumbList  
- [ ] FAQ 5+  
- [ ] Table + bullets  
- [ ] 3+ internal links (hub ↔ platforms, hooks, blog, studio)  
- [ ] Free Tools hub + footer links  
- [x] Keyword volumes from Ubersuggest US (Aug 17)  
- [ ] GSC request indexing on each canonical after ship  

---

## Next steps

1. Noman reviews mockups:
   - Hub: `docs/mockups/ai-script-generator-mockup.html`
   - TikTok: `docs/mockups/tiktok-script-generator-mockup.html`
   - Instagram: `docs/mockups/instagram-reels-script-generator-mockup.html`
2. Wire React pages + `aggregateRating` schema + Free Tools/footer links  
3. Ship hub first, then platform pages → GSC  
