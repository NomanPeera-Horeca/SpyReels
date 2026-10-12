import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Blog article TOC disclosure chevron. Not used on marketing pages. */
export function BlogArticleIconChevronDown(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
