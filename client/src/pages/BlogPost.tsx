import { Film, ArrowLeft, Calendar, Tag, Share2 } from "lucide-react";
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo } from "react";
import { getLoginUrl } from "@/const";
import { InlineCTA, LeadMagnet, StickySignupBar, SocialProofBanner } from "@/components/BlogConversion";

// Map slugs to specific CTA/lead magnet variants for relevance
const SLUG_CTA_MAP: Record<string, { midCta: "default" | "spy" | "script"; leadMagnet: "template" | "checklist" | "guide" }> = {
  "how-to-transcribe-instagram-reels-automatically": { midCta: "default", leadMagnet: "checklist" },
  "spy-on-competitor-instagram-reels-strategy": { midCta: "spy", leadMagnet: "guide" },
  "viral-instagram-reel-hook-formulas": { midCta: "script", leadMagnet: "template" },
  "how-to-write-viral-instagram-reel-scripts": { midCta: "script", leadMagnet: "template" },
  "best-instagram-reels-analytics-tools-2026": { midCta: "spy", leadMagnet: "guide" },
};

/**
 * Injects an inline CTA into HTML content after the 3rd <h2> or halfway through
 */
function injectMidArticleCTA(html: string, ctaHtml: string): string {
  const h2Regex = /<h2[\s>]/gi;
  let match;
  let count = 0;
  let insertPos = -1;

  while ((match = h2Regex.exec(html)) !== null) {
    count++;
    if (count === 3) {
      insertPos = match.index;
      break;
    }
  }

  // If fewer than 3 h2s, insert at roughly 40% of content
  if (insertPos === -1) {
    insertPos = Math.floor(html.length * 0.4);
    // Find the nearest closing </p> tag to avoid breaking HTML
    const nearestP = html.indexOf("</p>", insertPos);
    if (nearestP !== -1) {
      insertPos = nearestP + 4;
    }
  }

  return html.slice(0, insertPos) + ctaHtml + html.slice(insertPos);
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading, error } = trpc.blog.bySlug.useQuery(
    { slug: slug || "" },
    { enabled: !!slug }
  );

  const ctaConfig = useMemo(() => {
    if (!slug) return { midCta: "default" as const, leadMagnet: "template" as const };
    return SLUG_CTA_MAP[slug] || { midCta: "default" as const, leadMagnet: "template" as const };
  }, [slug]);

  // Inject mid-article CTA placeholder into content
  const processedContent = useMemo(() => {
    if (!post?.content) return "";
    const ctaPlaceholder = '<div id="mid-article-cta-slot"></div>';
    return injectMidArticleCTA(post.content, ctaPlaceholder);
  }, [post?.content]);

  // Update page title and meta for SEO
  useEffect(() => {
    if (post) {
      document.title = (post.metaTitle || post.title) + " | SpyReels Blog";
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute("content", post.metaDescription || post.excerpt || "");

      let script = document.getElementById("blog-post-jsonld");
      if (!script) {
        script = document.createElement("script");
        script.id = "blog-post-jsonld";
        script.setAttribute("type", "application/ld+json");
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.metaDescription || post.excerpt || "",
        image: post.coverImageUrl || undefined,
        datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
        dateModified: new Date(post.updatedAt).toISOString(),
        author: { "@type": "Organization", name: "SpyReels" },
        publisher: { "@type": "Organization", name: "SpyReels" },
        mainEntityOfPage: { "@type": "WebPage", "@id": window.location.href },
        keywords: (post.tags as string[])?.join(", ") || "",
      });

      return () => {
        document.title = "SpyReels";
        const el = document.getElementById("blog-post-jsonld");
        if (el) el.remove();
      };
    }
  }, [post]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Film className="h-5 w-5 text-primary" />
                </div>
                <span className="font-semibold text-lg tracking-tight">SpyReels</span>
              </Link>
            </div>
          </div>
        </nav>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-pulse space-y-6">
          <div className="h-8 bg-muted/30 rounded w-3/4" />
          <div className="h-4 bg-muted/30 rounded w-1/3" />
          <div className="h-64 bg-muted/30 rounded" />
          <div className="space-y-3">
            <div className="h-4 bg-muted/30 rounded w-full" />
            <div className="h-4 bg-muted/30 rounded w-5/6" />
            <div className="h-4 bg-muted/30 rounded w-4/6" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Post Not Found</h1>
          <p className="text-muted-foreground mb-6">This article doesn't exist or has been removed.</p>
          <Link href="/blog" className="text-primary hover:underline">
            &larr; Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Film className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold text-lg tracking-tight">SpyReels</span>
            </Link>
            <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> All Posts
            </Link>
          </div>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Tags */}
        {post.tags && (post.tags as string[]).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {(post.tags as string[]).map((tag) => (
              <span key={tag} className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                <Tag className="h-3 w-3" /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4">
          {post.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b border-border/50">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "Draft"}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
            }}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>

        {/* Social Proof */}
        <SocialProofBanner />

        {/* Cover image */}
        {post.coverImageUrl && (
          <div className="rounded-xl overflow-hidden mb-10">
            <img
              src={post.coverImageUrl}
              alt={post.title}
              className="w-full h-auto"
            />
          </div>
        )}

        {/* Content - Part 1: before mid-article CTA */}
        {(() => {
          const parts = processedContent.split('<div id="mid-article-cta-slot"></div>');
          return (
            <>
              <div
                className="prose prose-invert prose-lg max-w-none
                  [&_h2]:text-foreground [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-4
                  [&_h3]:text-foreground [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mt-8 [&_h3]:mb-3
                  [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-4
                  [&_strong]:text-foreground
                  [&_a]:text-primary [&_a]:underline
                  [&_ul]:text-muted-foreground [&_ol]:text-muted-foreground
                  [&_li]:mb-1
                  [&_blockquote]:border-l-primary [&_blockquote]:text-muted-foreground
                  [&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
                  [&_pre]:bg-card [&_pre]:border [&_pre]:border-border/50 [&_pre]:rounded-lg
                  [&_table]:w-full [&_table]:border-collapse [&_table]:my-6
                  [&_th]:bg-card [&_th]:border [&_th]:border-border/50 [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:text-foreground [&_th]:font-semibold
                  [&_td]:border [&_td]:border-border/50 [&_td]:px-4 [&_td]:py-2 [&_td]:text-muted-foreground
                  [&_img]:rounded-lg"
                dangerouslySetInnerHTML={{ __html: parts[0] || "" }}
              />

              {/* Mid-article CTA */}
              <InlineCTA variant={ctaConfig.midCta} />

              {/* Content - Part 2: after mid-article CTA */}
              {parts[1] && (
                <div
                  className="prose prose-invert prose-lg max-w-none
                    [&_h2]:text-foreground [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-4
                    [&_h3]:text-foreground [&_h3]:text-xl [&_h3]:font-medium [&_h3]:mt-8 [&_h3]:mb-3
                    [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_p]:mb-4
                    [&_strong]:text-foreground
                    [&_a]:text-primary [&_a]:underline
                    [&_ul]:text-muted-foreground [&_ol]:text-muted-foreground
                    [&_li]:mb-1
                    [&_blockquote]:border-l-primary [&_blockquote]:text-muted-foreground
                    [&_code]:text-primary [&_code]:bg-primary/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
                    [&_pre]:bg-card [&_pre]:border [&_pre]:border-border/50 [&_pre]:rounded-lg
                    [&_table]:w-full [&_table]:border-collapse [&_table]:my-6
                    [&_th]:bg-card [&_th]:border [&_th]:border-border/50 [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:text-foreground [&_th]:font-semibold
                    [&_td]:border [&_td]:border-border/50 [&_td]:px-4 [&_td]:py-2 [&_td]:text-muted-foreground
                    [&_img]:rounded-lg"
                  dangerouslySetInnerHTML={{ __html: parts[1] }}
                />
              )}
            </>
          );
        })()}

        {/* Lead Magnet */}
        <LeadMagnet type={ctaConfig.leadMagnet} />

        {/* Bottom CTA */}
        <div className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 text-center">
          <h3 className="text-xl font-semibold mb-2">Ready to grow your Reels?</h3>
          <p className="text-muted-foreground mb-4">
            Start analyzing top-performing content and creating viral scripts today.
          </p>
          <a
            href={getLoginUrl()}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Try SpyReels Free
          </a>
        </div>
      </article>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted-foreground/60">
          <span>&copy; {new Date().getFullYear()} SpyReels</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
          </div>
        </div>
      </footer>

      {/* Sticky signup bar */}
      <StickySignupBar />
    </div>
  );
}
