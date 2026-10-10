import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { MarketingIconArrowRight } from "./MarketingIcons";
import "./dark-button.css";

type SharedProps = {
  children: ReactNode;
  className?: string;
  trailingIcon?: boolean;
  "data-marketing-dark-button"?: string;
};

type ButtonAsButton = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type ButtonAsLink = SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
  };

export type DarkButtonProps = ButtonAsButton | ButtonAsLink;

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Figma Button / Dark — compact marketing-header action (Start free). */
export function DarkButton(props: DarkButtonProps) {
  const {
    children,
    className,
    trailingIcon = true,
    "data-marketing-dark-button": dataDarkButton,
    ...rest
  } = props;
  const classes = cx("sr-dark-button", className);
  const content = (
    <>
      {children}
      {trailingIcon ? (
        <MarketingIconArrowRight className="sr-dark-button-icon" aria-hidden="true" />
      ) : null}
    </>
  );
  const dataAttr = dataDarkButton
    ? { "data-marketing-dark-button": dataDarkButton }
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
