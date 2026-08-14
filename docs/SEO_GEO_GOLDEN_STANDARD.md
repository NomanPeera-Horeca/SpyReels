# SpyReels SEO + GEO Golden Standard

**Version 1.0 — May 21, 2026**
**Rule: NEVER ship a page without checking every item below.**

This applies to:
- Every blog post
- Every free tool page
- Every feature page
- Every comparison page (`/vs/*`)
- Every landing page
- Homepage, pricing, about, contact
- Every new route added to the site

---

## The 11 non-negotiables for every page

### 1. One clear H1 matching primary keyword
- Exactly ONE `<h1>` per page
- Contains the primary target keyword early in the heading
- Under 60 characters when possible
- Different from page title (`<title>`) but related

### 2. Logical H2/H3 hierarchy
- H2 sections organize page into clear topics
- H3 only inside H2 (no skipping levels)
- Each H2 should target a related secondary keyword
- Use sentence case ("How transition hooks work"), not Title Case

### 3. Direct answer in first 100 words
- LLMs cite text that directly answers the query
- First paragraph must contain a clear thesis statement
- Pattern: "X is Y because Z. Here's how it works..."
- No fluff, no warm-up sentences

### 4. Full meta tags
Required in `<head>` (set via useEffect or SSR):
- `<title>` — primary keyword + brand
- `<meta name="description">` — 150-160 chars, hook + benefit + CTA
- `<link rel="canonical">` — absolute URL, override available
- `<meta name="robots">` — index/follow OR noindex/nofollow
- `<meta property="og:title">` — same as title
- `<meta property="og:description">` — same as description
- `<meta property="og:image">` — 1200x630 image, override available
- `<meta property="og:url">` — canonical
- `<meta property="og:type">` — article, website, product
- `<meta name="twitter:card">` — summary_large_image
- `<meta name="twitter:title">`, `<meta name="twitter:description">`, `<meta name="twitter:image">`

### 5. JSON-LD schema markup
At minimum, every page needs structured data:
- **Article/BlogPosting** for blogs
- **Product** or **SoftwareApplication** for product/feature pages
- **FAQPage** wherever an FAQ section exists
- **BreadcrumbList** on every non-homepage page
- **Organization** schema on homepage
- **WebSite** schema on homepage (with SearchAction if applicable)

### 6. Full author + publisher in schema
Not just a name string. Full object:
```json
"author": {
  "@type": "Person",
  "name": "Noah Perry",
  "url": "https://spyreels.ai/about"
},
"publisher": {
  "@type": "Organization",
  "name": "SpyReels",
  "logo": {
    "@type": "ImageObject",
    "url": "https://[CDN URL to logo].png"
  }
}
```

### 7. Schema freshness signals
- `datePublished` — when first published
- `dateModified` — when last edited (Google ranks fresh content higher)
- `wordCount` — calculated from content
- `mainEntityOfPage` — points to canonical URL

### 8. Visible byline + dates (BLOG POSTS ONLY)
On **blog posts** only, above the H1 or just below it:
- "By Noah Perry"
- "Published [date]"
- "Updated [date]" (only if different from published)
- "[X] min read" (calculated from word count, 200 wpm)

This signals E-E-A-T (Expertise, Experience, Authority, Trust) to Google on articles.

**Never put byline / "Updated …" / "X min read" on marketing pages:** free tools, feature pages, comparison pages, homepage, pricing, or other acquisition LPs. That pattern is for blogs. On marketing pages use social proof instead (stars + faces + "Used by 12,000+ creators" or equivalent).

### 8b. Marketing landing page copy bans (NEVER on-page unless Noman asks)
These phrases are fine in **meta title / meta description** when needed for SEO. They are **banned in visible landing-page body copy** (hero, tool UI microcopy, CTAs, FAQs, footers, banners). They read as generic AI SaaS filler:

- "no card" / "no credit card" / "no credit card required"
- "preview 2 free" / "2 free" / "X free then unlock"
- "unlock with email" / "free preview" / "Free preview · Unlock with email"
- "Built for nano & micro creators" (use real social proof instead)

Prefer: stars (realistic **4.5**, not fake perfect 5.0), overlapping creator faces (same stack as go-viral / other SpyReels marketing), and **"Used by 12,000+ creators"**.

If a gated tool needs email, use plain product language ("Get all 10 hooks", "Continue") without "free preview / unlock with email / no card" framing.

### 9. FAQ section at bottom
- Minimum 5 questions per blog post
- Minimum 3 questions per feature/landing page
- Use `<h3>` for questions
- Each answer 2-4 sentences
- ALWAYS emit FAQPage JSON-LD schema for these

### 10. Tables and bullet lists wherever possible
- LLMs prefer structured data over prose
- ChatGPT/Perplexity/Claude cite tables 5x more often than paragraphs
- Use tables for comparisons, feature lists, pricing breakdowns
- Use bullets for steps, features, examples

### 11. Internal links to related pages
- Every page links to 3-5 other relevant pages
- Use descriptive anchor text (the target page's keyword, not "click here")
- Cluster related content (hub pages link to spoke pages, spokes link to hub)

### 12. Visible breadcrumbs on marketing landing pages
Every free-tool and feature marketing page must show **visible** breadcrumbs above the H1 (not schema-only), matching the B-Roll Generator pattern:

- Example: `Home > Free Tools > Viral Hook Generator`
- Example: `Home > Features > Viral Reel Finder`
- Parents are muted links; current page is the active (non-link) crumb
- Use shared `PublicBreadcrumb` so chrome stays consistent
- Still emit BreadcrumbList JSON-LD (rule 5) in addition to the visible UI

Applies to: Viral Hook Generator, B-Roll Generator, TikTok / YouTube / Instagram finders, Free Tools hub, 30-Day Content Plan LP, AI Script / Coach feature LP, and any new marketing LP.

---

## Site-wide infrastructure

These need to exist once, then every page inherits the benefit:

### `/robots.txt`
- Must include per-bot Allow rules:
  - `User-agent: GPTBot` / Allow: /
  - `User-agent: ClaudeBot` / Allow: /
  - `User-agent: anthropic-ai` / Allow: /
  - `User-agent: PerplexityBot` / Allow: /
  - `User-agent: Google-Extended` / Allow: /
  - `User-agent: CCBot` / Allow: /
- Always link to sitemap.xml

### `/llms.txt`
- Static site description at root
- Lists key URLs, product description, pricing
- Updated whenever positioning changes

### `/sitemap.xml`
- Auto-generated, includes every public page
- Updated within 24 hours of new content
- Submitted to Google Search Console + Bing Webmaster Tools

### `/about` page
- Real author bio for Noah Perry
- Photo, credentials, contact
- Critical E-E-A-T signal
- Schema: Person + Organization

---

## Pre-ship checklist (use before EVERY new page goes live)

Before any `git push` of a new page, verify:

- [ ] One H1, contains primary keyword
- [ ] H2/H3 hierarchy logical, no skips
- [ ] First 100 words directly answer the page's question
- [ ] Meta title set (under 60 chars)
- [ ] Meta description set (150-160 chars)
- [ ] Canonical URL set (absolute)
- [ ] OG tags set (title, description, image, url, type)
- [ ] Twitter card tags set
- [ ] robots meta tag set
- [ ] JSON-LD schema present (correct type for page)
- [ ] FAQPage schema present if FAQ section exists
- [ ] BreadcrumbList schema present
- [ ] Author object full (name + url)
- [ ] Publisher object full (name + logo)
- [ ] dateModified present (schema; blogs also show visible dates)
- [ ] Visible byline + dates rendered (**blog posts only**; never on marketing LPs)
- [ ] Marketing LP copy audited: no "no card" / "2 free" / "unlock with email" / "free preview" / blog byline on-page
- [ ] Marketing LP social proof uses realistic rating (prefer 4.5) + faces + 12,000+ when showing trust
- [ ] At least 3 H2 sections (or 5 for blog posts)
- [ ] FAQ section with min 3-5 questions
- [ ] At least 1 table or comparison section
- [ ] At least 3 internal links to related pages
- [ ] Visible breadcrumbs above H1 on marketing free-tool / feature LPs (`PublicBreadcrumb`)
- [ ] sitemap.xml updated
- [ ] Submitted to GSC for indexing

---

## Claude's job (this is on me)

**I will proactively audit every new page being built and flag missing items BEFORE Noman ships.**

I will:
- Run this checklist mentally before approving any Cursor prompt that creates a page
- Catch missing items in diffs before they're committed
- Maintain this Golden Standard doc and update it as SEO/GEO best practices evolve
- Never assume a page is SEO-ready just because it has H1 and meta tags

If I see any new page or blog being shipped without these items, I stop the work and flag the gaps.

---

## Why this matters

**Google SEO** brings traffic from people searching.
**GEO (LLM citation)** brings traffic from people asking ChatGPT, Perplexity, Claude, Gemini.

In 2026, GEO is rapidly becoming as important as SEO. The pages that get cited by LLMs are pages with:
- Clean structured data
- Direct answers
- Tables and lists
- Strong author signals
- FAQPage schema

Every competitor has weak GEO right now. This is the window to win.

---

## Reference URLs

- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org docs: https://schema.org
- Google Search Console: https://search.google.com/search-console

---

**Last updated: Aug 14, 2026**
**Owner: Claude (audit responsibility) + Noman (ship decisions)**
