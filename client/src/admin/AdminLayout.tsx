import { cn } from "@/lib/utils";
import { Link } from "wouter";

const TABS: { id: string; label: string; href: string }[] = [
  { id: "traffic", label: "Traffic", href: "/admin/traffic" },
  { id: "blogs", label: "Blog Studio", href: "/admin/blogs" },
  { id: "creators", label: "Creators", href: "/admin/creators" },
  { id: "emails", label: "Emails", href: "/admin/emails" },
  { id: "users", label: "Users", href: "/admin/users" },
  { id: "seo", label: "SEO Hub", href: "/admin/seo/health" },
];

export function AdminLayout({
  activeTab,
  children,
}: {
  activeTab: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-background dark:text-foreground">
      <div className="border-b border-violet-200/90 bg-violet-100 px-4 py-2.5 text-center text-sm text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/50 dark:text-violet-100">
        SpyReels admin. Access is limited to the address in{" "}
        <code className="rounded bg-white/60 px-1 py-0.5 text-xs dark:bg-black/30">ADMIN_EMAIL</code>
        .
      </div>
      <div className="mx-auto max-w-7xl px-3 py-5 sm:px-4 sm:py-6">
        <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Admin</h1>
            <p className="text-sm text-muted-foreground">
              Traffic through SEO Hub — gated by <code className="text-xs">ADMIN_EMAIL</code> / client allowlist.
            </p>
          </div>
        </header>
        <nav
          aria-label="Admin sections"
          className="-mx-1 mb-5 flex gap-1 overflow-x-auto pb-1 sm:mb-6 sm:flex-wrap sm:overflow-visible"
        >
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className={cn(
                "inline-flex cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <main className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">{children}</main>
      </div>
    </div>
  );
}
