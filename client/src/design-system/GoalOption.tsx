import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconCheckInverse } from "./icons";
import styles from "./GoalOption.module.css";

type GoalOptionProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children" | "role" | "title"
> & {
  title: string;
  description?: string;
  /** Leading icon tile ("Show icon"). Hidden on mobile per the Figma spec. */
  icon?: ReactNode;
  selected: boolean;
  className?: string;
};

/**
 * Card / Goal Option (Figma 1258:482). Default, Hover, Selected, Disabled,
 * Focus-visible. The indicator is visual only; the parent radiogroup owns
 * the single selected value. Selection is shown by surface, border AND the
 * check mark, so it is never color-only.
 */
export function GoalOption({
  title,
  description,
  icon,
  selected,
  className,
  type = "button",
  ...rest
}: GoalOptionProps) {
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
      {icon ? (
        <span className={styles.iconTile} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className={styles.text}>
        <span className={["sr-text-product-card-title", styles.title].join(" ")}>
          {title}
        </span>
        {description ? (
          <span
            className={["sr-text-product-body-small", styles.description].join(" ")}
          >
            {description}
          </span>
        ) : null}
      </span>
      <span className={styles.indicator} aria-hidden>
        {selected ? <IconCheckInverse size={14} /> : null}
      </span>
    </button>
  );
}
