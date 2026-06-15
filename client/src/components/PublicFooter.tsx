import { Link } from "wouter";

const SPYREELS_LOGO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

const NAV_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "Features", href: "/#features", external: true },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq", external: true },
  { label: "Blog", href: "/blog" },
  { label: "Affiliate", href: "/affiliate" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Contact", href: "/contact" },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-border/50 bg-background py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <Link href="/" className="flex items-center gap-2">
            <img
              src={SPYREELS_LOGO}
              alt="SpyReels logo, Instagram Reels spy tool"
              className="h-7 w-7"
            />
            <span className="font-semibold tracking-tight">SpyReels</span>
          </Link>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {NAV_LINKS.map(link =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              )
            )}
          </div>

          <div className="text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} SpyReels. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
