import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { MarketingIconArrowRight } from "./MarketingIcons";
import "./secondary-button.css";

export type SecondaryButtonSize = "medium" | "large";

type SharedProps = {
  children: ReactNode;
  className?: string;
  /** Figma Button / Secondary size. Defaults to medium (44px). */
  size?: SecondaryButtonSize;
  /**
   * Trailing Arrow Right (20px). Defaults off (secondary actions rarely trail).
   */
  trailingIcon?: boolean;
  "data-marketing-secondary-button"?: string;
};

type ButtonAsButton = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type ButtonAsLink = SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
  };

export type SecondaryButtonProps = ButtonAsButton | ButtonAsLink;

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Figma Button / Secondary (node 32:70). */
export function SecondaryButton(props: SecondaryButtonProps) {
  const {
    children,
    className,
    size = "medium",
    trailingIcon = false,
    "data-marketing-secondary-button": dataSecondaryButton,
    ...rest
  } = props;
  const classes = cx(
    "sr-secondary-button",
    size === "large" ? "sr-secondary-button-large" : "sr-secondary-button-medium",
    className
  );
  const content = (
    <>
      {children}
      {trailingIcon ? (
        <MarketingIconArrowRight className="sr-secondary-button-icon" aria-hidden="true" />
      ) : null}
    </>
  );
  const dataAttr = dataSecondaryButton
    ? { "data-marketing-secondary-button": dataSecondaryButton }
    : {};

  if ("href" in rest && typeof rest.href === "string") {
    const { href, ...linkRest } = rest;
    return (
      <a className={classes} href={href} {...dataAttr} {...linkRest}>
        {content}
      </a>
    );
  }

  const buttonRest = rest as ButtonAsButton;
  return (
    <button
      className={classes}
      type={buttonRest.type ?? "button"}
      {...dataAttr}
      {...buttonRest}
    >
      {content}
    </button>
  );
}
