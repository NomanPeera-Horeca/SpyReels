import type { Metadata } from "next";
import { DEFAULT_OG_IMAGE, SPYREELS_LOGO_OG_URL } from "../../../shared/defaultOgImage";
import { SPYREELS_SITE_URL } from "../../../shared/publicPageMeta";
import {
  buildFaqPageJsonLd,
  jsonLdScript,
  type MarketingFaqItem,
} from "../../components/marketingFaqJsonLd";
import type { PublicBlogPost } from "./types";

const SITE_URL = SPYREELS_SITE_URL;

export function resolveCanonicalHref(post: PublicBlogPost): string {
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

export function resolveCoverImage(post: PublicBlogPost): string {
  return post.coverImageUrl || post.ogImageUrl || DEFAULT_OG_IMAGE;
}

export function toIsoDate(value: string | Date | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function formatBlogDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildBlogArticleMetadata(post: PublicBlogPost): Metadata {
  const title = post.metaTitle || post.title;
  const description =
    post.metaDescription || post.excerpt || "Instagram Reels growth tips from SpyReels.";
  const canonical = resolveCanonicalHref(post);
  const ogImage = post.ogImageUrl || post.coverImageUrl || DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    alternates: { canonical },
    robots: post.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      images: [{ url: ogImage }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export function buildBlogArticleJsonLd(
  post: PublicBlogPost,
  faqItems: readonly MarketingFaqItem[] | null
): Array<{ id: string; json: string }> {
  const canonicalHref = resolveCanonicalHref(post);
  const datePublished = toIsoDate(post.publishedAt);
  const dateModified = toIsoDate(post.updatedAt || post.publishedAt);
  const wordCount = post.content.split(/\s+/).filter(Boolean).length;
  const image = resolveCoverImage(post);

  const scripts: Array<{ id: string; json: string }> = [
    {
      id: "blog-posting-schema",
      json: jsonLdScript({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.metaDescription || post.excerpt || "",
        image,
        url: canonicalHref,
        datePublished,
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
            url: SPYREELS_LOGO_OG_URL,
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": canonicalHref,
        },
      }),
    },
    {
      id: "blog-breadcrumb-schema",
      json: jsonLdScript({
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
    },
  ];

  if (faqItems && faqItems.length > 0) {
    scripts.push({
      id: "blog-faq-schema",
      json: jsonLdScript(buildFaqPageJsonLd(faqItems)),
    });
  }

  return scripts;
}
