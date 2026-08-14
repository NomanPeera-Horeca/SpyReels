import type { BlogPost } from "../drizzle/schema";
import {
  buildCrawlerSnapshotHtml,
  getStaticCrawlerSnapshot,
  type CrawlerPageSnapshot,
} from "../shared/crawlerPageSnapshot";
import {
  canonicalUrlForPathname,
  getStaticPublicPageSeo,
  isPrivateAppPath,
  normalizePublicPathname,
} from "../shared/publicPageMeta";
import { getStaticPageJsonLdScripts } from "../shared/staticPageStructuredData";
import { DEFAULT_OG_IMAGE } from "../shared/defaultOgImage";

const SITE_URL = "https://spyreels.ai";

export type PageHeadMeta = {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  ogType?: string;
  robots?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inject crawler-visible title, description, canonical, and OG/Twitter tags into index.html. */
export function injectPageHeadMeta(html: string, meta: PageHeadMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = escapeHtml(meta.canonical);
  const ogImage = escapeHtml(meta.ogImage || DEFAULT_OG_IMAGE);
  const ogType = escapeHtml(meta.ogType || "website");
  const robots = escapeHtml(meta.robots || "index, follow");

  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${description}" />`
  );

  const headExtras = [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
  ].join("\n    ");

  return out.replace("</head>", `    ${headExtras}\n  </head>`);
}

export function injectCrawlerSnapshot(html: string, snapshot: CrawlerPageSnapshot): string {
  const snippet = buildCrawlerSnapshotHtml(snapshot);
  if (html.includes('<div id="root">')) {
    return html.replace('<div id="root">', `${snippet}\n    <div id="root">`);
  }
  return html.replace("</body>", `  ${snippet}\n  </body>`);
}

export function blogIndexHeadMeta(): PageHeadMeta {
  const seo = getStaticPublicPageSeo("/blog");
  return {
    title: seo?.title ?? "Instagram Reels Growth Blog - SpyReels",
    description:
      seo?.description ??
      "Articles on Instagram Reels, viral hooks, content strategy, and creator growth. Tips for nano and micro creators by SpyReels.",
    canonical: canonicalUrlForPathname("/blog"),
    ogImage: DEFAULT_OG_IMAGE,
    ogType: "website",
  };
}

export function blogPostHeadMeta(post: BlogPost): PageHeadMeta {
  const title = post.metaTitle || post.title;
  const description =
    post.metaDescription || post.excerpt || "Instagram Reels growth tips from SpyReels.";
  const canonical = post.canonicalUrl || `${SITE_URL}/blog/${post.slug}`;
  const robots = post.noIndex ? "noindex, nofollow" : "index, follow";

  return {
    title,
    description,
    canonical,
    ogImage: post.ogImageUrl || post.coverImageUrl || DEFAULT_OG_IMAGE,
    ogType: "article",
    robots,
  };
}

/** Pathname from Express originalUrl (req.path is wrong under app.use("*")). */
export function pathnameFromRequestUrl(originalUrl: string): string {
  return normalizePublicPathname(originalUrl);
}

export function parseBlogSlugFromPath(pathname: string): string | null {
  const match = /^\/blog\/([^/?#]+)\/?$/.exec(pathname);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function resolveCanonicalHref(post: BlogPost): string {
  const raw = post.canonicalUrl?.trim();
  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        return new URL(raw).href;
      } catch {
        return raw;
      }
    }
    return raw.startsWith("/") ? `${SITE_URL}${raw}` : `${SITE_URL}/${raw}`;
  }
  return `${SITE_URL}/blog/${post.slug}`;
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .trim();
}

function parseFaqFromContent(content: string): Array<{ question: string; answer: string }> | null {
  if (!/##\s+(frequently asked questions|faq)\b/i.test(content)) {
    return null;
  }

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let faqStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^##\s+(frequently asked questions|faq)\s*$/i.test(trimmed)) {
      faqStart = i + 1;
      break;
    }
  }
  if (faqStart < 0) {
    return null;
  }

  const items: Array<{ question: string; answer: string }> = [];
  let currentQuestion: string | null = null;
  let answerParts: string[] = [];

  const flush = () => {
    const answer = answerParts.join("\n\n").trim();
    if (currentQuestion && answer) {
      items.push({ question: currentQuestion, answer });
    }
    currentQuestion = null;
    answerParts = [];
  };

  for (let i = faqStart; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^##\s+/.test(trimmed)) {
      break;
    }
    if (/^###\s+/.test(trimmed)) {
      flush();
      currentQuestion = stripMarkdownInline(trimmed.replace(/^###\s+/, ""));
      continue;
    }
    if (currentQuestion && trimmed) {
      answerParts.push(stripMarkdownInline(trimmed));
    }
  }
  flush();

  return items.length > 0 ? items : null;
}

function jsonLdScript(id: string, data: Record<string, unknown>): string {
  return `<script id="${id}" type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export function injectStructuredDataScripts(
  html: string,
  scripts: Array<{ id: string; data: Record<string, unknown> }>
): string {
  if (scripts.length === 0) {
    return html;
  }
  const tags = scripts.map((script) => jsonLdScript(script.id, script.data)).join("\n    ");
  return html.replace("</head>", `    ${tags}\n  </head>`);
}

export function injectStaticPageStructuredData(html: string, pathname: string): string {
  return injectStructuredDataScripts(html, getStaticPageJsonLdScripts(pathname));
}

export function injectBlogPostStructuredData(html: string, post: BlogPost): string {
  const canonicalHref = resolveCanonicalHref(post);
  const dateModified = post.updatedAt || post.publishedAt || new Date().toISOString();
  const wordCount = post.content.split(/\s+/).filter(Boolean).length;

  const scripts = [
    jsonLdScript("blog-posting-schema", {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.metaDescription || post.excerpt || "",
      image: post.coverImageUrl || post.ogImageUrl || DEFAULT_OG_IMAGE,
      url: canonicalHref,
      datePublished: post.publishedAt || new Date().toISOString(),
      dateModified,
      wordCount,
      author: {
        "@type": "Person",
        name: "Noah Perry",
        url: `${SITE_URL}/about`,
      },
      publisher: {
        "@type": "Organization",
        name: "SpyReels",
        logo: {
          "@type": "ImageObject",
          url: DEFAULT_OG_IMAGE,
        },
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": canonicalHref,
      },
    }),
    jsonLdScript("blog-breadcrumb-schema", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Blog",
          item: `${SITE_URL}/blog`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: post.title,
          item: canonicalHref,
        },
      ],
    }),
  ];

  const faqItems = parseFaqFromContent(post.content);
  if (faqItems) {
    scripts.push(
      jsonLdScript("blog-faq-schema", {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      })
    );
  }

  return html.replace("</head>", `    ${scripts.join("\n    ")}\n  </head>`);
}

function extractTitleFromHtml(html: string): string | null {
  const match = /<title>([^<]*)<\/title>/i.exec(html);
  return match?.[1]?.trim() || null;
}

function extractDescriptionFromHtml(html: string): string | null {
  const match = /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/i.exec(html);
  return match?.[1]?.trim() || null;
}

function injectCanonicalFallbackMeta(html: string, pathname: string): string {
  const canonical = canonicalUrlForPathname(pathname);
  return injectPageHeadMeta(html, {
    title: extractTitleFromHtml(html) ?? "SpyReels",
    description:
      extractDescriptionFromHtml(html) ??
      "SpyReels helps Instagram creators find viral Reels, transcribe them, and generate scripts.",
    canonical,
  });
}

function injectNotFoundMeta(html: string): string {
  return injectPageHeadMeta(html, {
    title: "Page Not Found | SpyReels",
    description: "This SpyReels page does not exist or has moved.",
    canonical: `${SITE_URL}/404`,
    robots: "noindex, nofollow",
  });
}

export type SpaPublicHtmlResult = {
  html: string;
  /** HTTP status for crawlers. Private app shells stay 200. */
  status: number;
};

export async function enrichSpaHtmlForPublicPath(
  html: string,
  originalUrl: string,
  loadPostBySlug: (slug: string) => Promise<BlogPost | undefined>
): Promise<SpaPublicHtmlResult> {
  const pathname = pathnameFromRequestUrl(originalUrl);
  const hasQueryString = originalUrl.includes("?");

  if (isPrivateAppPath(pathname)) {
    return { html, status: 200 };
  }

  if (pathname === "/blog") {
    let enriched = injectPageHeadMeta(html, blogIndexHeadMeta());
    const snapshot = getStaticCrawlerSnapshot("/blog");
    if (snapshot) {
      enriched = injectCrawlerSnapshot(enriched, snapshot);
    }
    return { html: enriched, status: 200 };
  }

  const slug = parseBlogSlugFromPath(pathname);
  if (slug) {
    const post = await loadPostBySlug(slug);
    if (!post || post.status !== "published") {
      // Missing / draft blog URLs must not soft-404 as 200 SPA shells.
      const notFoundHtml = hasQueryString
        ? injectCanonicalFallbackMeta(injectNotFoundMeta(html), pathname)
        : injectNotFoundMeta(html);
      return { html: notFoundHtml, status: 404 };
    }

    let enriched = injectPageHeadMeta(html, blogPostHeadMeta(post));
    enriched = injectBlogPostStructuredData(enriched, post);
    enriched = injectCrawlerSnapshot(enriched, {
      h1: post.title,
      summary: post.excerpt || post.metaDescription || undefined,
    });
    return { html: enriched, status: 200 };
  }

  const staticSeo = getStaticPublicPageSeo(pathname);
  if (staticSeo) {
    let enriched = injectPageHeadMeta(html, {
      title: staticSeo.title,
      description: staticSeo.description,
      canonical: staticSeo.canonical,
      ogImage: DEFAULT_OG_IMAGE,
      ogType: "website",
    });
    enriched = injectStaticPageStructuredData(enriched, pathname);
    const snapshot = getStaticCrawlerSnapshot(pathname);
    if (snapshot) {
      enriched = injectCrawlerSnapshot(enriched, snapshot);
    }
    return { html: enriched, status: 200 };
  }

  if (hasQueryString) {
    // Tracking variants of known pages already handled above. Unknown path +
    // query still gets a clean noindex 404 rather than a soft 404 shell.
    return { html: injectNotFoundMeta(html), status: 404 };
  }

  // Junk paths like "/$" were returning 200 SPA HTML and showing as
  // "Crawled - currently not indexed" / soft 404 in GSC.
  return { html: injectNotFoundMeta(html), status: 404 };
}
