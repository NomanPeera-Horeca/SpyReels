import { Link } from "wouter";

export type RelatedToolItem = {
  title: string;
  imageUrl: string;
  href: string;
};

type RelatedToolsGridProps = {
  /** Section heading. Defaults to "Related tools". */
  heading?: string;
  /** Up to 3 tools. Extra items are ignored. */
  tools: RelatedToolItem[];
  /** Optional wrapper class for section background/spacing overrides. */
  className?: string;
};

/**
 * OpusClip-style related tools grid: image tile + title, whole card clickable.
 * Reusable across free-tool and feature pages.
 */
export function RelatedToolsGrid({
  heading = "Related tools",
  tools,
  className = "",
}: RelatedToolsGridProps) {
  const items = tools.slice(0, 3);

  if (items.length === 0) return null;

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
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {items.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500"
              >
                <div className="overflow-hidden rounded-2xl bg-zinc-900 aspect-[16/10] ring-1 ring-zinc-200 transition group-hover:ring-violet-400 group-hover:shadow-lg group-hover:shadow-violet-100">
                  <img
                    src={tool.imageUrl}
                    alt=""
                    width={640}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                </div>
                <p className="mt-3 font-sans text-[16px] font-semibold leading-snug text-zinc-900 transition group-hover:text-violet-700 lg:text-[17px]">
                  {tool.title}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
