import { ArrowLeft, Calendar, Clock3, Copy, Film, Linkedin, Mail, MessageCircle, Share2, Tag } from "lucide-react";
import { Link, Redirect, useParams } from "wouter";
import {
  BLOG_RELATED_SLUGS,
  getBlogRedirectTarget,
} from "@shared/blogRedirects";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCanonical } from "@/hooks/useCanonical";
import { useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  InlineCTA,
  LeadMagnet,
  SocialProofBanner,
  StickySignupBar,
} from "@/components/BlogConversion";

const SPYREELS_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

const SLUG_CTA_MAP: Record<
  string,
  { midCta: "default" | "spy" | "script"; leadMagnet: "template" | "checklist" | "guide" }
> = {
  "how-to-transcribe-instagram-reels-automatically": { midCta: "default", leadMagnet: "checklist" },
  "spy-on-competitor-instagram-reels-strategy": { midCta: "spy", leadMagnet: "guide" },
  "viral-instagram-reel-hook-formulas": { midCta: "script", leadMagnet: "template" },
  "how-to-write-viral-instagram-reel-scripts": { midCta: "script", leadMagnet: "template" },
  "best-instagram-reels-analytics-tools-2026": { midCta: "spy", leadMagnet: "guide" },
};

type TocItem = { id: string; text: string; level: 2 | 3 };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-");
}

function normalizeContentToMarkdown(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const normalized: string[] = [];
  let inFaq = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      normalized.push("");
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      normalized.push(trimmed);
      continue;
    }

    if (/^frequently asked questions/i.test(trimmed)) {
      inFaq = true;
      normalized.push(`## ${trimmed}`);
      continue;
    }

    const isListLine = /^[-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed);
    const endsWithPeriod = trimmed.endsWith(".");
    const endsWithQuestion = trimmed.endsWith("?");
    const startsCapital = /^[A-Z]/.test(trimmed);
    const hasCommaEarly = trimmed.slice(0, 30).includes(",");
    const isShort = trimmed.length < 120;

    const isHeadingCandidate =
      isShort &&
      !endsWithPeriod &&
      startsCapital &&
      !hasCommaEarly &&
      !isListLine;

    if (isHeadingCandidate && endsWithQuestion && inFaq) {
      normalized.push(`### ${trimmed}`);
      continue;
    }

    if (isHeadingCandidate && endsWithQuestion && !inFaq) {
      normalized.push(`## ${trimmed}`);
      continue;
    }

    if (isHeadingCandidate) {
      normalized.push(`## ${trimmed}`);
      continue;
    }

    normalized.push(trimmed);
  }

  return normalized.join("\n\n").replace(/^(\|.*\|)\n\n(?=\|)/gm, "$1\n");
}

function extractToc(markdown: string): TocItem[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## ") || line.startsWith("### "))
    .map((line) => {
      const level = line.startsWith("### ") ? 3 : 2;
      const text = line.replace(/^###?\s+/, "");
      return { id: slugify(text), text, level };
    });
}

const SPYREELS_SITE_URL = "https://spyreels.ai";

function formatBlogDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toCanonicalHref(pathname: string): string {
  if (pathname === "/") {
    return `${SPYREELS_SITE_URL}/`;
  }
  return `${SPYREELS_SITE_URL}${pathname}`;
}

type FaqItem = { question: string; answer: string };

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .trim();
}

function parseFaqFromContent(content: string): FaqItem[] | null {
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

  const items: FaqItem[] = [];
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
      currentQuestion = stripMarkdown(trimmed.replace(/^###\s+/, ""));
      continue;
    }
    if (currentQuestion && trimmed) {
      answerParts.push(stripMarkdown(trimmed));
    }
  }
  flush();

  return items.length > 0 ? items : null;
}

function resolveCanonicalPath(canonicalUrl: string | null | undefined, slug: string | undefined): string | undefined {
  if (!canonicalUrl?.trim()) {
    return slug ? `/blog/${slug}` : undefined;
  }
  const trimmed = canonicalUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return new URL(trimmed).pathname;
    } catch {
      return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    }
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const redirectTarget = slug ? getBlogRedirectTarget(slug) : undefined;
  if (redirectTarget) {
    return <Redirect to={`/blog/${redirectTarget}`} />;
  }
  if (!slug) {
    return null;
  }
  return <BlogPostView slug={slug} />;
}

function BlogPostView({ slug }: { slug: string }) {
  const [progress, setProgress] = useState(0);
  const [activeHeading, setActiveHeading] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  const { data: post, isLoading, error } = trpc.blog.bySlug.useQuery({ slug });
  const { data: allPublished } = trpc.blog.published.useQuery();

  const canonicalPath = useMemo(() => {
    if (!slug) return undefined;
    return resolveCanonicalPath(post?.canonicalUrl, slug);
  }, [post?.canonicalUrl, slug]);
  useCanonical(canonicalPath);

  const ctaConfig = useMemo(() => {
    if (!slug) return { midCta: "default" as const, leadMagnet: "template" as const };
    return SLUG_CTA_MAP[slug] || { midCta: "default" as const, leadMagnet: "template" as const };
  }, [slug]);

  const markdown = useMemo(() => normalizeContentToMarkdown(post?.content || ""), [post?.content]);
  const toc = useMemo(() => extractToc(markdown), [markdown]);

  const readTime = useMemo(() => {
    const words = markdown.replace(/[#>*_`[\]()!-]/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
  }, [markdown]);

  const bylineReadMinutes = useMemo(() => {
    const wordCount = (post?.content || "").split(/\s+/).length;
    return Math.max(1, Math.round(wordCount / 200));
  }, [post?.content]);

  const contentParts = useMemo(() => {
    if (!markdown) return { first: "", second: "" };
    const blocks = markdown.split("\n\n");
    const mid = Math.ceil(blocks.length / 2);
    return {
      first: blocks.slice(0, mid).join("\n\n"),
      second: blocks.slice(mid).join("\n\n"),
    };
  }, [markdown]);

  const relatedPosts = useMemo(() => {
    if (!allPublished || !post) return [];
    const preferred = BLOG_RELATED_SLUGS[post.slug];
    if (preferred?.length) {
      return preferred
        .map((s) => allPublished.find((p) => p.slug === s))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .slice(0, 3);
    }
    return allPublished.filter((p) => p.slug !== post.slug).slice(0, 3);
  }, [allPublished, post]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied!");
    } catch {
      toast.error("Could not copy link");
    } finally {
      setShareOpen(false);
    }
  };

  const openShareUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setShareOpen(false);
  };

  const markdownComponents = useMemo(
    () => ({
      h2: ({ children }: any) => {
        const text = String(children);
        const id = slugify(text);
        return (
          <h2 id={id} className="scroll-mt-24 pl-4 border-l-2 border-primary/60 text-[26px] font-semibold mt-12 mb-4">
            <a href={`#${id}`} className="hover:text-primary transition-colors">{children}</a>
          </h2>
        );
      },
      h3: ({ children }: any) => {
        const text = String(children);
        const id = slugify(text);
        return (
          <h3 id={id} className="scroll-mt-24 text-[20px] font-medium mt-9 mb-3">
            <a href={`#${id}`} className="hover:text-primary transition-colors">{children}</a>
          </h3>
        );
      },
      p: ({ children }: any) => <p className="text-[17px] leading-[1.8] text-muted-foreground mb-5">{children}</p>,
      blockquote: ({ children }: any) => (
        <blockquote className="border-l-2 border-primary/60 pl-4 py-1 text-muted-foreground italic bg-primary/5 rounded-r-md my-6">
          {children}
        </blockquote>
      ),
      ul: ({ children }: any) => <ul className="list-disc pl-6 space-y-2 text-[17px] leading-[1.8] text-muted-foreground mb-5">{children}</ul>,
      ol: ({ children }: any) => <ol className="list-decimal pl-6 space-y-2 text-[17px] leading-[1.8] text-muted-foreground mb-5">{children}</ol>,
      img: ({ ...props }: any) => <img {...props} className="rounded-xl border border-border/50 my-8 w-full" />,
      code: ({ inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || "");
        const code = String(children).replace(/\n$/, "");
        if (!inline) {
          return (
            <SyntaxHighlighter
              style={oneDark}
              language={match?.[1] || "text"}
              PreTag="div"
              customStyle={{ borderRadius: "0.75rem", padding: "1rem", margin: "1.25rem 0" }}
              {...props}
            >
              {code}
            </SyntaxHighlighter>
          );
        }
        return <code className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-sm">{children}</code>;
      },
      strong: ({ children }: any) => <strong className="text-foreground font-semibold">{children}</strong>,
      table: ({ children }: any) => (
        <div className="my-6 w-full overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full border-collapse text-[15px]">{children}</table>
        </div>
      ),
      thead: ({ children }: any) => <thead className="bg-zinc-900/60">{children}</thead>,
      tbody: ({ children }: any) => <tbody>{children}</tbody>,
      tr: ({ children }: any) => (
        <tr className="border-b border-zinc-800 last:border-b-0 transition-colors hover:bg-zinc-900/40">
          {children}
        </tr>
      ),
      th: ({ children }: any) => (
        <th className="px-4 py-3 text-left font-semibold text-foreground">{children}</th>
      ),
      td: ({ children }: any) => (
        <td className="px-4 py-3 text-left text-muted-foreground align-top">{children}</td>
      ),
    }),
    []
  );

  useEffect(() => {
    const original = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = original;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const nextProgress = total > 0 ? (window.scrollY / total) * 100 : 0;
      setProgress(Math.min(100, Math.max(0, nextProgress)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!post) return;
    document.title = post.metaTitle || post.title;
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", post.metaDescription || post.excerpt || "");

    // Open Graph + Twitter card meta tags
    const setMeta = (prop: string, val: string, attr = "property") => {
      let el = document.querySelector(`meta[${attr}="${prop}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, prop);
        document.head.appendChild(el);
      }
      el.setAttribute("content", val);
    };

    const ogImage = post.ogImageUrl || post.coverImageUrl || "";

    // Open Graph
    setMeta("og:title", post.metaTitle || post.title);
    setMeta("og:description", post.metaDescription || post.excerpt || "");
    setMeta("og:image", ogImage);
    setMeta("og:url", window.location.href);
    setMeta("og:type", "article");

    // Twitter
    setMeta("twitter:card", "summary_large_image", "name");
    setMeta("twitter:title", post.metaTitle || post.title, "name");
    setMeta("twitter:description", post.metaDescription || post.excerpt || "", "name");
    setMeta("twitter:image", ogImage, "name");

    setMeta("robots", post.noIndex ? "noindex, nofollow" : "index, follow", "name");

    // JSON-LD Schema
    const removeSchemaScript = (id: string) => {
      document.getElementById(id)?.remove();
    };
    removeSchemaScript("blog-posting-schema");
    removeSchemaScript("blog-breadcrumb-schema");
    removeSchemaScript("blog-faq-schema");

    const schemaPath = resolveCanonicalPath(post.canonicalUrl, post.slug);
    const canonicalHref = schemaPath ? toCanonicalHref(schemaPath) : window.location.href;
    const dateModified = post.updatedAt || post.publishedAt || new Date().toISOString();
    const wordCount = post.content.split(/\s+/).length;
    const schema = document.createElement("script");
    schema.id = "blog-posting-schema";
    schema.type = "application/ld+json";
    schema.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": post.title,
      "description": post.metaDescription || post.excerpt || "",
      "image": post.coverImageUrl || "",
      "url": canonicalHref,
      "datePublished": post.publishedAt || new Date().toISOString(),
      "dateModified": dateModified,
      "wordCount": wordCount,
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
          "url": "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": canonicalHref
      }
    });
    document.head.appendChild(schema);

    const breadcrumb = document.createElement("script");
    breadcrumb.id = "blog-breadcrumb-schema";
    breadcrumb.type = "application/ld+json";
    breadcrumb.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": `${SPYREELS_SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Blog",
          "item": `${SPYREELS_SITE_URL}/blog`,
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": post.title,
          "item": canonicalHref,
        },
      ],
    });
    document.head.appendChild(breadcrumb);

    const faqItems = parseFaqFromContent(post.content);
    if (faqItems) {
      const faqSchema = document.createElement("script");
      faqSchema.id = "blog-faq-schema";
      faqSchema.type = "application/ld+json";
      faqSchema.text = JSON.stringify({
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
      });
      document.head.appendChild(faqSchema);
    }

    return () => {
      removeSchemaScript("blog-posting-schema");
      removeSchemaScript("blog-breadcrumb-schema");
      removeSchemaScript("blog-faq-schema");
    };
  }, [post]);

  useEffect(() => {
    if (!toc.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) {
          setActiveHeading(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0.1 }
    );

    toc.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc, markdown]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="h-1 w-full bg-muted/20">
          <div className="h-full bg-primary/50 animate-pulse" style={{ width: "30%" }} />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-pulse space-y-6">
          <div className="h-[280px] rounded-2xl bg-muted/20" />
          <div className="h-12 rounded bg-muted/20 w-3/4" />
          <div className="h-5 rounded bg-muted/20 w-1/3" />
          <div className="space-y-3">
            <div className="h-5 rounded bg-muted/20 w-full" />
            <div className="h-5 rounded bg-muted/20 w-5/6" />
            <div className="h-5 rounded bg-muted/20 w-4/6" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Post Not Found</h1>
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
      <div className="fixed top-0 left-0 right-0 z-[60] h-1 bg-transparent">
        <div className="h-full bg-primary transition-[width] duration-100" style={{ width: `${progress}%` }} />
      </div>

      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img src={SPYREELS_LOGO} alt="SpyReels" className="h-9 w-9" />
              <span className="font-semibold text-lg tracking-tight">SpyReels</span>
            </Link>
            <div className="flex items-center gap-4">
              <Popover open={shareOpen} onOpenChange={setShareOpen}>
                <PopoverTrigger asChild>
                  <button className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-2 bg-card border-border/60">
                  <div className="flex flex-col">
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    >
                      <Copy className="h-4 w-4" /> Copy link
                    </button>
                    <button
                      onClick={() =>
                        openShareUrl(
                          `https://wa.me/?text=${encodeURIComponent(`Check this out: ${shareUrl}`)}`
                        )
                      }
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" /> Share on WhatsApp
                    </button>
                    <button
                      onClick={() =>
                        openShareUrl(
                          `https://twitter.com/intent/tweet?url=${encodeURIComponent(
                            shareUrl
                          )}&text=${encodeURIComponent(post.title)}`
                        )
                      }
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    >
                      <span className="w-4 text-center font-semibold">𝕏</span> Share on X (Twitter)
                    </button>
                    <button
                      onClick={() =>
                        openShareUrl(
                          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
                        )
                      }
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    >
                      <Linkedin className="h-4 w-4" /> Share on LinkedIn
                    </button>
                    <button
                      onClick={() =>
                        openShareUrl(
                          `mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(
                            `Check this out: ${shareUrl}`
                          )}`
                        )
                      }
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    >
                      <Mail className="h-4 w-4" /> Share via Email
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
              <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" /> All Posts
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="max-w-[720px] w-full">
          <div className="rounded-2xl overflow-hidden h-[400px] mb-8 border border-border/50 relative">
            {post.coverImageUrl ? (
              <img src={post.coverImageUrl} alt={post.title} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-end p-8"
                style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 55%, #111827 100%)" }}
              >
                <p className="text-white/95 text-xl sm:text-2xl font-semibold max-w-xl">{post.title}</p>
              </div>
            )}
          </div>

          {post.tags && (post.tags as string[]).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {(post.tags as string[]).map((tag) => (
                <span key={tag} className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                  <Tag className="h-3 w-3" /> {tag}
                </span>
              ))}
            </div>
          )}

          <div className="text-sm text-muted-foreground mb-6">
            <span>By Noah Perry</span>
            {post.publishedAt && (
              <>
                <span> · </span>
                <span>Published {formatBlogDate(post.publishedAt)}</span>
              </>
            )}
            {post.publishedAt &&
              post.updatedAt &&
              new Date(post.updatedAt).getTime() !== new Date(post.publishedAt).getTime() && (
                <>
                  <span> · </span>
                  <span>Updated {formatBlogDate(post.updatedAt)}</span>
                </>
              )}
            <span> · </span>
            <span>{bylineReadMinutes} min read</span>
          </div>

          <h1 className="text-[36px] sm:text-[42px] leading-tight font-semibold mb-4">{post.title}</h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-b border-border/50 pb-6 mb-8">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
                NP
              </div>
              <span>Noah Perry</span>
            </div>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />
              {readTime} min read
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {post.status === "draft"
                ? "Draft"
                : post.publishedAt
                  ? new Date(post.publishedAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Published"}
            </span>
            {post.status === "draft" && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Draft
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,720px)_240px] gap-10">
          <article className="max-w-[720px]">
            <SocialProofBanner />

            <div className="mt-8 space-y-8">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents as any}
              >
                {contentParts.first}
              </ReactMarkdown>

              <InlineCTA variant={ctaConfig.midCta} />

              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents as any}
              >
                {contentParts.second}
              </ReactMarkdown>
            </div>

            <LeadMagnet type={ctaConfig.leadMagnet} />

            <div className="mt-12 rounded-2xl border border-primary/20 p-6 bg-gradient-to-br from-[#111827] via-[#1f1b2e] to-[#0f172a]">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold">
                  NP
                </div>
                <div>
                  <p className="font-semibold text-foreground text-lg">Noah Perry</p>
                  <p className="text-primary/90 text-sm font-medium mt-0.5">Founder &amp; CEO</p>
                  <div className="mt-2">
                    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                      Instagram Growth Expert · 12,000+ creators helped
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    Founder & CEO of SpyReels.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 p-8 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 text-center">
              <h3 className="text-xl font-semibold mb-2">Ready to grow your Reels?</h3>
              <p className="text-muted-foreground mb-4">
                Spy on viral creators in your niche and turn winning Reels into scripts in under a minute.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={getLoginUrl()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  Try SpyReels Free
                </a>
                <Link
                  href="/free-tools/viral-hooks"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-primary/30 text-foreground font-medium hover:bg-primary/10 transition-colors"
                >
                  Free hook generator
                </Link>
              </div>
            </div>

            <nav
              className="mt-8 rounded-xl border border-border/50 bg-muted/20 p-5"
              aria-label="SpyReels tools"
            >
              <p className="text-sm font-medium text-foreground mb-3">Try SpyReels</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/free-tools/viral-hooks" className="text-primary hover:underline">
                    Free viral hook generator
                  </Link>
                </li>
                <li>
                  <Link href="/features/viral-reel-finder" className="text-primary hover:underline">
                    Viral Reel Finder feature
                  </Link>
                </li>
                <li>
                  <Link href="/blog/best-instagram-reels-tools-2026" className="text-primary hover:underline">
                    Best Instagram Reels tools (2026)
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="text-primary hover:underline">
                    Pricing and plans
                  </Link>
                </li>
              </ul>
            </nav>

            {relatedPosts.length > 0 && (
              <section className="mt-14">
                <h3 className="text-xl font-semibold mb-4">Related Posts</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {relatedPosts.map((item) => (
                    <Link key={item.id} href={`/blog/${item.slug}`}>
                      <article className="h-full rounded-xl border border-border/50 bg-card/50 overflow-hidden hover:border-primary/30 transition-colors">
                        {item.coverImageUrl ? (
                          <div className="h-36 overflow-hidden">
                            <img
                              src={item.coverImageUrl}
                              alt={item.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div
                            className="h-36 flex items-end p-3"
                            style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4C1D95 55%, #111827 100%)" }}
                          >
                            <p className="text-white/95 text-sm font-medium line-clamp-2">{item.title}</p>
                          </div>
                        )}
                        <div className="p-4">
                          <p className="font-medium text-foreground mb-2 line-clamp-2">{item.title}</p>
                          {item.excerpt && <p className="text-sm text-muted-foreground line-clamp-3">{item.excerpt}</p>}
                        </div>
                      </article>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </article>

          <aside className="hidden lg:block">
            {toc.length > 0 && (
              <div className="sticky top-24 rounded-xl border border-border/50 bg-card/40 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">On this page</p>
                <div className="space-y-1">
                  {toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`block text-sm transition-colors ${
                        item.level === 3 ? "pl-3" : ""
                      } ${activeHeading === item.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {item.text}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>

      <footer className="border-t border-border/50 py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted-foreground/60">
          <span>&copy; {new Date().getFullYear()} SpyReels</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
            <Link href="/affiliate" className="hover:text-foreground">Affiliate</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </div>
        </div>
      </footer>

      <StickySignupBar />
    </div>
  );
}
