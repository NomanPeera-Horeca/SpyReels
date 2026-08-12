import { Link } from "wouter";

export type RelatedToolItem = {
  title: string;
  imageUrl: string;
  href: string;
  /** Show card but do not navigate (e.g. YouTube finder before that page ships). */
  comingSoon?: boolean;
};

type RelatedToolsGridProps = {
  /** Section heading. Defaults to "Related tools". */
  heading?: string;
  /** Optional supporting line under the heading. */
  subtitle?: string;
  /** Up to 4 tools. Extra items are ignored. */
  tools: RelatedToolItem[];
  /** Optional wrapper class for section background/spacing overrides. */
  className?: string;
};

/**
 * OpusClip-style related tools grid: image tile + title, whole card clickable.
 * 4 across on wide screens; horizontal snap-slider on small screens.
 */
export function RelatedToolsGrid({
  heading = "Related tools",
  subtitle,
  tools,
  className = "",
}: RelatedToolsGridProps) {
  const items = tools.slice(0, 4);

  if (items.length === 0) return null;

  const colClass =
    items.length >= 4
      ? "lg:grid-cols-4"
      : items.length === 3
        ? "lg:grid-cols-3"
        : "lg:grid-cols-2";

  return (
    <section
      className={`bg-white py-12 lg:py-16 ${className}`.trim()}
      aria-labelledby="related-tools-heading"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2
          id="related-tools-heading"
          className="font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.015em] text-zinc-900 lg:text-[32px]"
        >
          {heading}
        </h2>
        {subtitle ? (
          <p className="mt-2 max-w-2xl font-sans text-[14px] leading-relaxed text-zinc-500 lg:text-[15px]">
            {subtitle}
          </p>
        ) : null}

        <ul
          className={`mt-8 flex gap-6 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:overflow-visible sm:pb-0 sm:snap-none sm:grid-cols-2 sm:gap-6 lg:gap-8 ${colClass}`}
        >
          {items.map((tool) => {
            const cardInner = (
              <>
                <div className="relative overflow-hidden rounded-2xl bg-zinc-900 aspect-[16/10] ring-1 ring-zinc-200 transition group-hover:ring-violet-400 group-hover:shadow-lg group-hover:shadow-violet-100">
                  <img
                    src={tool.imageUrl}
                    alt=""
                    width={640}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                  {tool.comingSoon ? (
                    <span className="absolute right-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Coming soon
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 font-sans text-[16px] font-semibold leading-snug text-zinc-900 transition group-hover:text-violet-700 lg:text-[17px]">
                  {tool.title}
                </p>
              </>
            );

            return (
              <li
                key={tool.href}
                className="w-[min(78vw,280px)] shrink-0 snap-start sm:w-auto sm:shrink"
              >
                {tool.comingSoon ? (
                  <div
                    className="group block cursor-default"
                    aria-label={`${tool.title} (coming soon)`}
                  >
                    {cardInner}
                  </div>
                ) : (
                  <Link
                    href={tool.href}
                    className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500"
                  >
                    {cardInner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
