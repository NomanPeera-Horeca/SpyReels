# Blog publish checklist (SEO + GEO + GSC)

Use this every time a new post is published or an existing post is materially updated.
Read `docs/SEO_GEO_GOLDEN_STANDARD.md` first for content/schema requirements.

---

## Before writing (planning)

- [ ] Pick **one primary keyword** (`sourceKeyword`). Search GSC and existing slugs; avoid cannibalization with another live post.
- [ ] If topic overlaps an old post: **301 + noindex + canonical** to the canonical guide (see `shared/blogRedirects.ts`), do not publish a second competing URL.
- [ ] Slug is stable, descriptive, and matches intent (prefer `guide-*` for hubs).

---

## Content (in markdown body)

- [ ] One **H1** with primary keyword (title field in admin).
- [ ] Logical **H2/H3** hierarchy (no skipped levels).
- [ ] **First 100 words** directly answer the query (thesis, no fluff).
- [ ] **FAQ** section: `## Frequently asked questions` (or `## FAQ`) with at least **5** `###` questions, 2-4 sentence answers each.
- [ ] At least one **table** or structured comparison where it fits.
- [ ] **3+ internal links** to related guides/tools with descriptive anchor text (not "click here").

---

## Database (`blog_posts` row)

- [ ] `status` = `published`, `publishedAt` set.
- [ ] `metaTitle` (under ~60 chars when possible), `metaDescription` (150-160 chars).
- [ ] `sourceKeyword` set to primary keyword.
- [ ] `noIndex` = `0` for the **canonical** post only.
- [ ] `canonicalUrl` = NULL on the canonical post (self-canonical via slug). On **legacy/duplicate** posts only: full URL of canonical + `noIndex` = `1`.
- [ ] `coverImageUrl` or `ogImageUrl` for OG (1200x630 ideal).

---

## App code (when needed)

- [ ] If consolidating a legacy slug: add to `shared/blogRedirects.ts` (server 301 + client redirect in `BlogPost.tsx`).
- [ ] If hub post: add related slugs in `BLOG_RELATED_SLUGS` in `shared/blogRedirects.ts`.
- [ ] If major hub: consider adding to `POPULAR_GUIDES` in `client/src/pages/LandingPage.tsx`.
- [ ] Sitemap auto-includes indexable posts via `getPublishedIndexableBlogPosts()` (no `noIndex`). No manual sitemap edit unless new static route.

Production SQL template: `scripts/sql/blog-seo-fixes-production.sql` (one-off UPDATE patterns).

---

## After deploy

- [ ] Confirm live URL loads, single H1, FAQ visible, related posts if configured.
- [ ] Legacy URLs return **301** to canonical (if applicable): `curl -sI https://spyreels.ai/blog/OLD-SLUG`
- [ ] Confirm post appears in `https://spyreels.ai/sitemap.xml` (only if `noIndex` = 0).
- [ ] Confirm post **not** in sitemap if `noIndex` = 1.

---

## Google Search Console

- [ ] **Request indexing** on the new/updated canonical URL (URL Inspection).
- [ ] Do **not** request indexing on `noIndex` or legacy URLs being merged away.
- [ ] If hub post or homepage links changed: request indexing on `https://spyreels.ai/` once.
- [ ] Resubmit sitemap only after large batch of new URLs (optional).

Wait 1-2 weeks for recrawl before judging "Duplicate, Google chose different canonical."

---

## Do not

- Publish a second post targeting the same primary keyword without consolidating the old URL.
- Request indexing on legacy `how-to-*` duplicates after merge.
- Skip FAQ on new guides (required for GEO + rich results).

---

*Last updated: May 26, 2026*
