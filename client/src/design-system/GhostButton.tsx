import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./GhostButton.module.css";

type GhostButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children"
> & {
  children: ReactNode;
  size?: "medium" | "large";
  leadingIcon?: ReactNode;
  className?: string;
};

/**
 * Button / Ghost (Figma 32:71). Default, Hover, Pressed, Focused, Disabled.
 * Medium 44px (16/12 padding), Large 52px (20/16 padding), radius/8.
 */
export function GhostButton({
  children,
  size = "medium",
  leadingIcon,
  className,
  type = "button",
  ...rest
}: GhostButtonProps) {
  return (
    <button
      type={type}
      className={[
        "sr-text-product-button",
        styles.root,
        size === "large" ? styles.large : styles.medium,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {leadingIcon}
      {children}
    </button>
  );
}
