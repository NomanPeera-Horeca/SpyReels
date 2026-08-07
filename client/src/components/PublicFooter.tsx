import { Link } from "wouter";

const SPYREELS_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

type FooterLink = {
  label: string;
  href: string;
  /** Use native <a> for cross-page hash targets (e.g. /#faq) so the browser navigates then scrolls. */
  hashNav?: boolean;
};

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Affiliate", href: "/affiliate" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Viral Reel Finder", href: "/features/viral-reel-finder" },
      { label: "30-Day Content Plan", href: "/features/30-day-content-plan" },
      { label: "AI Personal Brand Coach", href: "/features/ai-personal-brand-coach" },
      { label: "Pricing", href: "/pricing" },
      { label: "How It Works", href: "/#how-it-works", hashNav: true },
      { label: "Extension", href: "/extension" },
    ],
  },
  {
    title: "Free Tools",
    links: [
      { label: "Viral Hooks", href: "/free-tools/viral-hooks" },
      { label: "B-Roll Generator", href: "/free-tools/broll-generator" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "FAQ", href: "/#faq", hashNav: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

function FooterNavLink({ link }: { link: FooterLink }) {
  const className =
    "text-sm text-muted-foreground transition-colors hover:text-foreground";

  if (link.hashNav) {
    return (
      <a href={link.href} className={className}>
        {link.label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

/**
 * Site-wide public marketing footer. Use on public pages only — not logged-in app
 * routes and not PublicScriptView (which keeps its own CTA footer).
 */
export function PublicFooter() {
  return (
    <footer className="border-t border-border/50 bg-background py-12 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-3">
            <Link href="/" className="inline-flex items-center gap-2">
              <img
                src={SPYREELS_LOGO}
                alt="SpyReels logo, Instagram Reels spy tool"
                className="h-7 w-7"
              />
              <span className="font-semibold tracking-tight">SpyReels</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Research, plan, and script Instagram Reels that actually get watched.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-9 lg:grid-cols-5">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-foreground">
                  {column.title}
                </p>
                <ul className="mt-3 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <FooterNavLink link={link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex justify-end border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} SpyReels. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
