import { Film, ArrowLeft, Calendar, Tag, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { StickySignupBar } from "@/components/BlogConversion";

const SPYREELS_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

export default function BlogList() {
  const { data: posts, isLoading } = trpc.blog.published.useQuery();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <img src={SPYREELS_LOGO} alt="SpyReels" className="h-9 w-9" />
              <span className="font-semibold text-lg tracking-tight">SpyReels</span>
            </Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> Back to App
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Hero CTA Banner */}
        <div className="mb-10 relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-8 sm:p-10">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-primary text-sm font-semibold mb-2">
                <Sparkles className="h-4 w-4" />
                <span>SPYREELS AI</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                Spy on any Instagram account's Reels
              </h2>
              <p className="text-muted-foreground max-w-lg">
                Analyze competitor Reels, get full transcripts, review engagement metrics, and generate your own viral scripts with AI. Free to start.
              </p>
            </div>
            <a
              href={getLoginUrl()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 whitespace-nowrap shrink-0"
            >
              Try Free <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Blog</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Industry insights, product updates, and tips for Instagram content creators.
          </p>
        </div>

        {/* Social Proof */}
        <div className="mt-3 mb-2 text-sm text-muted-foreground">
          Trusted by <strong className="text-foreground">12,000+</strong> creators
        </div>

        {isLoading ? (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 mt-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-card/50 overflow-hidden animate-pulse">
                <div className="h-48 bg-muted/30" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-muted/30 rounded w-3/4" />
                  <div className="h-3 bg-muted/30 rounded w-full" />
                  <div className="h-3 bg-muted/30 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : !posts || posts.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Film className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No posts published yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Check back soon for new articles on Instagram Reels strategy, content creation, and growth tactics.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 mt-8">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`}>
                <article className="group rounded-xl border border-border/50 bg-card/50 overflow-hidden hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 h-full flex flex-col">
                  {post.coverImageUrl ? (
                    <div className="h-48 overflow-hidden">
                      <img
                        src={post.coverImageUrl}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className="h-48 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Film className="h-12 w-12 text-primary/40" />
                    </div>
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    {post.tags && (post.tags as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {(post.tags as string[]).slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <h2 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
                        {post.excerpt}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/30">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {post.status === "draft"
                          ? "Draft"
                          : post.publishedAt
                          ? new Date(post.publishedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "Published"}
                      </div>
                      <span className="text-xs text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                        Read <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between text-xs text-muted-foreground/60">
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
