import type { BlogPost } from "../drizzle/schema";

const SITE_URL = "https://spyreels.ai";
const DEFAULT_OG_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

const BLOG_INDEX_TITLE = "Instagram Reels Growth Blog - SpyReels";
const BLOG_INDEX_DESCRIPTION =
  "Articles on Instagram Reels, viral hooks, content strategy, and creator growth. Tips for nano and micro creators by SpyReels.";

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

export function blogIndexHeadMeta(): PageHeadMeta {
  return {
    title: BLOG_INDEX_TITLE,
    description: BLOG_INDEX_DESCRIPTION,
    canonical: `${SITE_URL}/blog`,
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

export function parseBlogSlugFromPath(pathname: string): string | null {
  const match = /^\/blog\/([^/?#]+)\/?$/.exec(pathname);
  return match?.[1] ?? null;
}

export async function enrichSpaHtmlForPublicPath(
  html: string,
  pathname: string,
  loadPostBySlug: (slug: string) => Promise<BlogPost | undefined>
): Promise<string> {
  if (pathname === "/blog" || pathname === "/blog/") {
    return injectPageHeadMeta(html, blogIndexHeadMeta());
  }

  const slug = parseBlogSlugFromPath(pathname);
  if (!slug) {
    return html;
  }

  const post = await loadPostBySlug(slug);
  if (!post || post.status !== "published") {
    return html;
  }

  return injectPageHeadMeta(html, blogPostHeadMeta(post));
}
