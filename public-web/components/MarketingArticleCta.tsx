import { PrimaryButton } from "./PrimaryButton";
import styles from "./MarketingArticleCta.module.css";

/** Locked Figma Article CTA defaults (node 1015:2907). */
export const ARTICLE_CTA_DEFAULT = {
  title: "Find your next Reel idea without endless scrolling.",
  body: "Search a creator. Remake their best Reel in your voice.",
  href: "/features/viral-reel-finder",
  buttonLabel: "Find viral Reels",
} as const;

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function MarketingArticleCta({
  title = ARTICLE_CTA_DEFAULT.title,
  body = ARTICLE_CTA_DEFAULT.body,
  href = ARTICLE_CTA_DEFAULT.href,
  buttonLabel = ARTICLE_CTA_DEFAULT.buttonLabel,
  className,
}: {
  title?: string;
  body?: string;
  href?: string;
  buttonLabel?: string;
  className?: string;
}) {
  return (
    <aside className={cx(styles.root, className)} data-marketing-article-cta="">
      <p className={cx("sr-text-marketing-title-medium", styles.title)}>{title}</p>
      <p className={cx("sr-text-marketing-body-medium", styles.body)}>{body}</p>
      <PrimaryButton href={href} size="medium">
        {buttonLabel}
      </PrimaryButton>
    </aside>
  );
}
