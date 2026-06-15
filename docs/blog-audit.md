# Production blog audit (read-only)

**Database:** `maglev.proxy.rlwy.net:16621` via `.env.had-rotated-creds`  
**Audited:** 2026-05-21  
**Query:**

```sql
SELECT slug, title, excerpt, metaTitle, metaDescription, sourceKeyword,
       LENGTH(content) as content_length, publishedAt, updatedAt
FROM blog_posts
ORDER BY publishedAt ASC;
```

**Row count:** 16 (all `status = published`)

---

## Summary table

| # | slug | sourceKeyword | content_length | publishedAt | metaTitle present? | metaDescription present? |
|---|------|---------------|----------------|-------------|-------------------|--------------------------|
| 1 | how-to-go-viral-on-instagram-reels-2026 | *(null)* | 9049 | null | yes | yes |
| 2 | how-to-spy-on-viral-instagram-reels | *(null)* | 9842 | null | yes | yes |
| 3 | how-to-write-instagram-reels-scripts-that-go-viral | *(null)* | 9752 | null | yes | yes |
| 4 | guide-spy-on-competitor-instagram-reels | *(null)* | 8672 | 2026-04-16 | yes | yes |
| 5 | guide-instagram-reels-script-generator | *(null)* | 7346 | 2026-04-16 | yes | yes |
| 6 | guide-why-reels-get-no-views | *(null)* | 6928 | 2026-04-16 | yes | yes |
| 7 | guide-instagram-reels-hook-examples | *(null)* | 8476 | 2026-04-16 | yes | yes |
| 8 | guide-find-viral-reels-your-niche | *(null)* | 7922 | 2026-04-16 | yes | yes |
| 9 | guide-instagram-reels-analytics-tool | *(null)* | 7794 | 2026-04-16 | yes | yes |
| 10 | guide-grow-instagram-reels-under-10k | *(null)* | 7543 | 2026-04-16 | yes | yes |
| 11 | guide-reverse-engineer-viral-reels | *(null)* | 7957 | 2026-04-16 | yes | yes |
| 12 | guide-instagram-reels-script-template | *(null)* | 7296 | 2026-04-16 | yes | yes |
| 13 | guide-best-time-to-post-reels-2026 | *(null)* | 7167 | 2026-04-16 | yes | yes |
| 14 | spyreels-vs-meedro | *(null)* | 8052 | 2026-04-17 | yes | yes |
| 15 | spyreels-vs-viralfindr | *(null)* | 6329 | 2026-04-17 | yes | yes |
| 16 | best-instagram-reels-tools-2026 | *(null)* | 9945 | 2026-04-21 | yes | yes |

**FAQ column (from full `content` fetch):** posts 4–16 have `## Frequently asked questions` with 5–7 `###` questions; posts 1–3 do not.

**`sourceKeyword`:** null on all 16 rows (column unused in production).

---

## Per-post analysis

### 1. `how-to-go-viral-on-instagram-reels-2026`

1. **FAQ:** No `## Frequently asked questions` section; no FAQ-style `###` questions.
2. **Keyword fit:** `sourceKeyword` null. Title/slug target “go viral on Instagram Reels 2026” — aligned. No stored keyword to validate.

### 2. `how-to-spy-on-viral-instagram-reels`

1. **FAQ:** No.
2. **Keyword fit:** Null DB keyword. Title emphasizes “spy on viral Instagram Reels” — strong match to slug; overlaps thematically with `guide-spy-on-competitor-instagram-reels` (competitor vs viral framing).

### 3. `how-to-write-instagram-reels-scripts-that-go-viral`

1. **FAQ:** No.
2. **Keyword fit:** Null. Title/slug = Reels scripts + viral — aligned. Overlaps `guide-instagram-reels-script-generator` and `guide-instagram-reels-script-template`.

### 4. `guide-spy-on-competitor-instagram-reels`

1. **FAQ:** Yes (7 questions).
2. **Keyword fit:** Null; title/slug clearly target competitor Reels research — good intent match.

### 5. `guide-instagram-reels-script-generator`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; title targets “Instagram Reels script generator” — aligned.

### 6. `guide-why-reels-get-no-views`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; title matches low-views troubleshooting intent — aligned.

### 7. `guide-instagram-reels-hook-examples`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; title is “30 Instagram Reels Hook Examples” — directly on “reel hooks” / “viral hooks” intent (planned post overlap).

### 8. `guide-find-viral-reels-your-niche`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; title = find viral Reels in niche — strong match to planned `how-to-find-viral-instagram-reels` / “instagram reels finder” intent.

### 9. `guide-instagram-reels-analytics-tool`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; title = Reels analytics tool comparison — aligned.

### 10. `guide-grow-instagram-reels-under-10k`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; title = grow Reels under 10K — aligned.

### 11. `guide-reverse-engineer-viral-reels`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; reverse-engineer viral Reels — aligned; partial overlap with find-viral and spy posts.

### 12. `guide-instagram-reels-script-template`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; script template intent — aligned; overlaps script-generator and how-to-write-scripts posts.

### 13. `guide-best-time-to-post-reels-2026`

1. **FAQ:** Yes (7).
2. **Keyword fit:** Null; posting time / 2026 — aligned.

### 14. `spyreels-vs-meedro`

1. **FAQ:** Yes (5).
2. **Keyword fit:** Null; comparison title matches “SpyReels vs Meedro” — aligned for branded comparison queries.

### 15. `spyreels-vs-viralfindr`

1. **FAQ:** Yes (5).
2. **Keyword fit:** Null; targets ViralFindr comparison — aligned with “viral finder” branded search (partial overlap with planned finder post, different angle: vs review not how-to).

### 16. `best-instagram-reels-tools-2026`

1. **FAQ:** Yes (6).
2. **Keyword fit:** Null; roundup title matches multi-tool comparison; body mentions ViralFindr — overlaps finder/tool-intent posts.

---

## Recommendations

### HIGH quality (ship as-is or minor polish)

| Post | Why |
|------|-----|
| All 10 `guide-*` (rows 4–13) | FAQ block present, 7.1k–8.7k chars, meta title + description set, `publishedAt` set |
| `best-instagram-reels-tools-2026` | Longest content (9945), FAQ, fresh `publishedAt`, strong meta |
| `spyreels-vs-meedro` | FAQ, solid length, comparison meta |
| `spyreels-vs-viralfindr` | FAQ, on-target for ViralFindr SERP (shortest comparison at 6329 chars — consider expanding) |

**Systemic gap (not post-specific):** populate `sourceKeyword` on all rows for admin/SEO tracking.

### LOW quality (prioritize fixes before pushing more posts)

| Post | Why |
|------|-----|
| `how-to-go-viral-on-instagram-reels-2026` | No FAQ; `publishedAt` null; predates FAQ standard |
| `how-to-spy-on-viral-instagram-reels` | No FAQ; `publishedAt` null; cannibalizes competitor-spy guide |
| `how-to-write-instagram-reels-scripts-that-go-viral` | No FAQ; `publishedAt` null; overlaps script generator/template guides |

**All 16 posts:** `sourceKeyword` is null — weak for keyword reporting; meta is present everywhere but inferred intent only.

**Suggested actions (content, not DB ops in this audit):**

- Add FAQ sections to the three `how-to-*` posts or 301/merge into newer `guide-*` equivalents.
- Set `publishedAt` on the three legacy posts or noindex/merge if kept only as duplicates.
- Backfill `sourceKeyword` from slug/title when editing.

### Overlap with planned new posts

#### Planned: `instagram-reel-hooks-examples` (reel hooks, viral hooks)

| Existing post | Overlap |
|---------------|---------|
| **`guide-instagram-reels-hook-examples`** | **Direct cannibalization** — same topic (hook examples list). Prefer one canonical URL: either update/expand the guide slug or redirect new slug to it. |
| `guide-instagram-reels-script-template` | Medium — hooks vs full template |
| `how-to-write-instagram-reels-scripts-that-go-viral` | Medium — scripts, not example lists |

#### Planned: `transition-hooks-for-reels` (transition hook, transitional hooks)

| Existing post | Overlap |
|---------------|---------|
| *(none)* | **No production post** mentions “transition hook” / “transitional hook” in content. **Greenfield** — no cannibalization. |
| `guide-instagram-reels-hook-examples` | Low — opening hooks, not transition-specific |

#### Planned: `how-to-find-viral-instagram-reels` (viral finder, instagram reels finder)

| Existing post | Overlap |
|---------------|---------|
| **`guide-find-viral-reels-your-niche`** | **Strong** — same job-to-be-done (find viral Reels). New slug matches `/features/viral-reel-finder` link target today (404 until published). Decide: rename guide, redirect, or differentiate (tool-led vs method-led). |
| **`spyreels-vs-viralfindr`** | **Strong** for “viral finder” branded queries — comparison, not tutorial |
| `best-instagram-reels-tools-2026` | Medium — includes ViralFindr in roundup |
| `how-to-spy-on-viral-instagram-reels` | Medium — spy/discovery angle |
| `guide-reverse-engineer-viral-reels` | Medium — analysis after find |
| `guide-spy-on-competitor-instagram-reels` | Low–medium — competitor focus |

**Site note:** `ViralReelFinder.tsx` already links to `/blog/how-to-find-viral-instagram-reels` — that URL does not exist in DB yet; publishing this post is high priority for internal linking.

---

## Meta length spot-check

All posts have non-empty `metaTitle` and `metaDescription`. Longest meta titles: `how-to-spy-on-viral-instagram-reels` (80), `best-instagram-reels-tools-2026` (77). Shortest comparison meta description: `spyreels-vs-viralfindr` (115 chars) — still present, could be expanded for SERP.

---

*Generated read-only from production `blog_posts`; no inserts, updates, or deletes.*
