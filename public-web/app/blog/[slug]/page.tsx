import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BLOG_RELATED_SLUGS, getBlogRedirectTarget } from "../../../../shared/blogRedirects";
import { BlogArticleBody } from "../../../components/BlogArticleBody";
import { BlogRelatedArticles } from "../../../components/BlogRelatedArticles";
import { MarketingArticleCta } from "../../../components/MarketingArticleCta";
import { MarketingFooter } from "../../../components/MarketingFooter";
import { MarketingHeader } from "../../../components/MarketingHeader";
import {
  MarketingFaq,
  MarketingFinalCta,
} from "../../../components/MarketingPageSections";
import { MarketingTableOfContents } from "../../../components/MarketingTableOfContents";
import { fetchBlogPostBySlug, fetchPublishedBlogPosts } from "../../../lib/blog/fetchBlogPost";
import {
  extractToc,
  normalizeContentToMarkdown,
  parseFaqFromContent,
  splitMarkdownForMidCta,
  stripFaqSection,
} from "../../../lib/blog/markdown";
import {
  buildBlogArticleJsonLd,
  buildBlogArticleMetadata,
  formatBlogDate,
  resolveCoverImage,
} from "../../../lib/blog/seo";
import type { PublicBlogPost } from "../../../lib/blog/types";
import "../../homepage.css";
import styles from "./BlogArticlePage.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function relatedForPost(
  post: PublicBlogPost,
  published: PublicBlogPost[]
): PublicBlogPost[] {
  const preferred = BLOG_RELATED_SLUGS[post.slug];
  if (preferred?.length) {
    return preferred
      .map((slug) => published.find((item) => item.slug === slug))
      .filter((item): item is PublicBlogPost => Boolean(item))
      .slice(0, 3);
  }
  return published.filter((item) => item.slug !== post.slug).slice(0, 3);
}

function estimateReadMinutes(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const redirectTarget = getBlogRedirectTarget(slug);
  if (redirectTarget) {
    return {};
  }
  const post = await fetchBlogPostBySlug(slug);
  if (!post || post.status !== "published") {
    return { title: "Page Not Found | SpyReels", robots: { index: false, follow: false } };
  }
  return buildBlogArticleMetadata(post);
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const redirectTarget = getBlogRedirectTarget(slug);
  if (redirectTarget) {
    permanentRedirect(`/blog/${redirectTarget}`);
  }

  const post = await fetchBlogPostBySlug(slug);
  if (!post || post.status !== "published") {
    notFound();
  }

  const published = await fetchPublishedBlogPosts();
  const markdown = normalizeContentToMarkdown(post.content || "");
  const faqRaw = parseFaqFromContent(markdown);
  const faqItems =
    faqRaw?.map((item) => ({
      q: item.question,
      a: item.answer,
    })) ?? null;
  const bodyMarkdown = stripFaqSection(markdown);
  const toc = extractToc(bodyMarkdown, post.slug);
  const { first, second } = splitMarkdownForMidCta(bodyMarkdown);
  const related = relatedForPost(post, published);
  const coverSrc = resolveCoverImage(post);
  const publishedLabel = formatBlogDate(post.publishedAt);
  const updatedLabel = formatBlogDate(post.updatedAt || post.publishedAt);
  const readMinutes = estimateReadMinutes(post.content || "");
  const jsonLd = buildBlogArticleJsonLd(post, faqItems);

  return (
    <div className={styles.page} data-blog-article-page="">
      {jsonLd.map((script) => (
        <script
          key={script.id}
          id={script.id}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: script.json }}
        />
      ))}

      <MarketingHeader />

      <main className={styles.main}>
        <div className={styles.frame}>
          <header className={styles.articleHeader}>
            <h1 className={styles.title}>{post.title}</h1>

            <div className={styles.meta}>
              {publishedLabel || updatedLabel ? (
                <p className={cx("sr-text-marketing-body-small", styles.metaLine)}>
                  {publishedLabel ? `Published ${publishedLabel}` : null}
                  {publishedLabel && updatedLabel ? " · " : null}
                  {updatedLabel ? `Last updated ${updatedLabel}` : null}
                </p>
              ) : null}
              <p className={cx("sr-text-marketing-body-small", styles.authorLine)}>
                Noah Perry · {readMinutes} min read
              </p>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.cover} src={coverSrc} alt="" />
          </header>

          <div className={styles.bodyLayout}>
            {toc.length > 0 ? (
              <aside className={styles.toc}>
                <MarketingTableOfContents items={toc} />
              </aside>
            ) : null}

            <article className={styles.articleColumn}>
              <BlogArticleBody markdown={first} />
              <MarketingArticleCta />
              <BlogArticleBody markdown={second} showAuthorSignature />
            </article>
          </div>
        </div>
      </main>

      {faqItems && faqItems.length > 0 ? (
        <MarketingFaq
          variant="article"
          eyebrow=""
          title="Frequently asked questions."
          description=""
          items={faqItems}
          defaultOpen="first"
          questionHeading="h3"
        />
      ) : null}

      <BlogRelatedArticles posts={related} />

      <MarketingFinalCta
        title="Your next viral idea starts here."
        body="Find proven videos in your niche. Remake them in your voice."
        buttonLabel="Find viral Reels for free"
        href="/?auth=signup&returnTo=%2Fresearch"
      />

      <MarketingFooter />
    </div>
  );
}
