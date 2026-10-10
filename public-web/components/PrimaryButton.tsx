import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { MarketingIconArrowRight } from "./MarketingIcons";
import "./primary-button.css";

export type PrimaryButtonSize = "medium" | "large";

type SharedProps = {
  children: ReactNode;
  className?: string;
  /** Figma Button / Primary size. Defaults to medium (44px). */
  size?: PrimaryButtonSize;
  /**
   * Trailing Arrow Right (20px). Defaults on for Large (marketing CTAs).
   * Pass false to hide (e.g. rare product medium uses).
   */
  trailingIcon?: boolean;
  /** Optional data attribute for visual close-ups. */
  "data-marketing-primary-button"?: string;
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
  const {
    children,
    className,
    size = "medium",
    trailingIcon,
    "data-marketing-primary-button": dataPrimaryButton,
    ...rest
  } = props;
  const showTrailing = trailingIcon ?? size === "large";
  const classes = cx(
    "sr-primary-button",
    size === "large" ? "sr-primary-button-large" : "sr-primary-button-medium",
    className
  );
  const content = (
    <>
      {children}
      {showTrailing ? (
        <MarketingIconArrowRight className="sr-primary-button-icon" aria-hidden="true" />
      ) : null}
    </>
  );
  const dataAttr = dataPrimaryButton
    ? { "data-marketing-primary-button": dataPrimaryButton }
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
