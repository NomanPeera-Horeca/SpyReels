import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import styles from "./marketingNoBreak.module.css";

/** Hyphenated compounds stay on one line (Figma text rule). */
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

/** Wrap hyphenated compounds in nowrap spans. Safe on strings and element trees. */
export function wrapHyphenatedCompounds(node: ReactNode): ReactNode {
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
