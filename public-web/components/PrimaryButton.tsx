import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import "./primary-button.css";

export type PrimaryButtonSize = "medium" | "large";

type SharedProps = {
  children: ReactNode;
  className?: string;
  /** Figma Button / Primary size. Defaults to medium (44px). */
  size?: PrimaryButtonSize;
  /** Decorative Marketing purple glow — not part of core Primary */
  glow?: boolean;
};

type ButtonAsButton = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type ButtonAsLink = SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
  };

export type PrimaryButtonProps = ButtonAsButton | ButtonAsLink;

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PrimaryButton(props: PrimaryButtonProps) {
  const { children, className, size = "medium", glow = false, ...rest } = props;
  const classes = cx(
    "sr-primary-button",
    size === "large" ? "sr-primary-button-large" : "sr-primary-button-medium",
    glow && "sr-primary-button-glow",
    className
  );

  if ("href" in rest && typeof rest.href === "string") {
    const { href, ...linkRest } = rest;
    return (
      <a className={classes} href={href} {...linkRest}>
        {children}
      </a>
    );
  }

  const buttonRest = rest as ButtonAsButton;
  return (
    <button className={classes} type={buttonRest.type ?? "button"} {...buttonRest}>
      {children}
    </button>
  );
}
