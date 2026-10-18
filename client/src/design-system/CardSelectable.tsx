import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./CardSelectable.module.css";

type CardSelectableProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children" | "role"
> & {
  selected: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * Card / Selectable (Figma 52:44). Default, Hover, Focused, Selected.
 * Selection = brand border + selected surface, never elevation.
 * Rendered as a radio inside a parent role="radiogroup".
 */
export function CardSelectable({
  selected,
  children,
  className,
  type = "button",
  ...rest
}: CardSelectableProps) {
  return (
    <button
      type={type}
      role="radio"
      aria-checked={selected}
      className={[styles.root, selected && styles.selected, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
