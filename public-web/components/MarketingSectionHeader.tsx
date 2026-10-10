import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import styles from "./MarketingSectionHeader.module.css";

export type MarketingSectionHeaderProps = {
  /** Optional; omitted for Large / centered Process Steps headers. */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Semantic heading level for the section title */
  headingLevel?: "h2" | "h3" | "h4";
  titleId?: string;
  className?: string;
  /** Default = Heading 3 + Body Small. Large = Heading 1 + Body Large. */
  size?: "default" | "large";
  align?: "start" | "center";
};

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Hyphenated compounds stay on one line (Figma Section Header). */
const HYPHENATED_COMPOUND = /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g;

function wrapHyphenatedInString(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const re = new RegExp(HYPHENATED_COMPOUND.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={`nb-${match.index}-${match[0]}`} className={styles.noBreak}>
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex === 0) return text;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function wrapHyphenatedCompounds(node: ReactNode): ReactNode {
  if (typeof node === "string") return wrapHyphenatedInString(node);
  if (typeof node === "number" || node == null || typeof node === "boolean") {
    return node;
  }
  if (Array.isArray(node)) {
    return Children.map(node, (child) => wrapHyphenatedCompounds(child));
  }
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    if (element.props.children == null) return element;
    return cloneElement(element, {
      children: wrapHyphenatedCompounds(element.props.children),
    });
  }
  return node;
}

/**
 * Marketing / Section Header — Figma Page 09.
 * Default: eyebrow, Heading 3, optional Body Small.
 * Large + center: Heading 1 (highlight spans use marketing accent), Body Large.
 */
export function MarketingSectionHeader({
  eyebrow,
  title,
  subtitle,
  headingLevel = "h2",
  titleId,
  className,
  size = "default",
  align = "start",
}: MarketingSectionHeaderProps) {
  const HeadingTag = headingLevel;

  return (
    <header
      className={cx(
        styles.root,
        size === "large" && styles.rootLarge,
        align === "center" && styles.rootCenter,
        className
      )}
    >
      {eyebrow != null && eyebrow !== "" ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      <HeadingTag
        {...(titleId ? { id: titleId } : {})}
        className={styles.heading}
      >
        {wrapHyphenatedCompounds(title)}
      </HeadingTag>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}
