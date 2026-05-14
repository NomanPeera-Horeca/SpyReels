import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";

const SECTIONS = [
  { id: "health", num: "01", label: "Site Health", blurb: "PageSpeed, schema, CWV, SSL, indexability — daily snapshot + recommended action." },
  { id: "gsc", num: "02", label: "Google Search Console", blurb: "Tiles, top queries, Reddit-strategy highlights." },
  { id: "bing", num: "03", label: "Bing Webmaster", blurb: "ChatGPT-via-Bing callout; metrics aligned with GSC layout." },
  { id: "ai-mentions", num: "04", label: "AI Mentions", blurb: "Weekly runs across engines; tracked prompts + honest competitor board." },
  { id: "bots", num: "05", label: "Bot Crawl", blurb: "30-day activity; stale badges for extended Google/Apple bots." },
  { id: "sitemap", num: "06", label: "Sitemap & IndexNow", blurb: "GSC / Bing / IndexNow submissions and logs." },
] as const;

export type SeoHubSub = (typeof SECTIONS)[number]["id"];

export default function SeoHubPage({ activeSub }: { activeSub: SeoHubSub }) {
  const [loc] = useLocation();
  const section = SECTIONS.find((s) => s.id === activeSub);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">SEO Hub</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Phase 3 — six sub-sections. Tables are migrated; live metrics and crons ship per{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">spyreels-admin-cursor-prompts-phase3.md</code>.
        </p>
      </div>

      <nav
        aria-label="SEO Hub sections"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-border pb-2"
      >
        {SECTIONS.map((s) => {
          const href = `/admin/seo/${s.id}`;
          const active = activeSub === s.id;
          return (
            <Link
              key={s.id}
              href={href}
              className={cn(
                "flex min-w-[8.5rem] shrink-0 flex-col rounded-lg border px-2.5 py-2 text-left text-xs transition-colors sm:min-w-0 sm:px-3",
                active
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground"
              )}
            >
              <span className="font-mono text-[10px] font-medium text-muted-foreground">{s.num}</span>
              <span className="font-medium leading-snug">{s.label}</span>
            </Link>
          );
        })}
      </nav>

      {section ? (
        <section className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 sm:p-5">
          <h3 className="text-base font-semibold">
            <span className="mr-2 font-mono text-sm text-muted-foreground">{section.num}</span>
            {section.label}
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{section.blurb}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            Current path: <code className="rounded bg-background px-1 py-0.5">{loc}</code>
          </p>
        </section>
      ) : null}
    </div>
  );
}
