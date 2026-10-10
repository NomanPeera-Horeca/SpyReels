import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const strokeProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MarketingIconScript(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M5 3h10l4 4v14H5V3Z" />
      <path d="M15 3v5h4M8 12h8M8 16h6" />
    </svg>
  );
}

export function MarketingIconHooks(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M18.4 5.6l-2.8 2.8m-7.2 7.2-2.8 2.8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function MarketingIconBroll(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m10 9 5 3-5 3V9ZM3 9h3M3 15h3M18 9h3M18 15h3" />
    </svg>
  );
}

export function MarketingIconCreators(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19v-1a6 6 0 0 1 12 0v1H3Z" />
      <path d="M17 6a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4" />
    </svg>
  );
}

export function MarketingIconCarousel(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M3 7v10m18-10v10M9 9h6m-6 4h6" />
    </svg>
  );
}

export function MarketingIconFinder(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m10 8 6 4-6 4V8Z" />
    </svg>
  );
}

export function MarketingIconTelegram(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
      <path d="M21.4 3.1 2.8 10.3c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.8 5.7c.2.7.1 1 1 .9.7-.1 1-.3 1.4-.7l2.4-2.3 5 3.7c.9.5 1.6.2 1.8-.9L23 4.4c.3-1.3-.5-1.8-1.6-1.3ZM8.1 12.9l10.9-6.8c.5-.3 1-.1.6.3l-9 8.1-.4 4.1-2.1-5.7Z" />
    </svg>
  );
}

/** Sparkle — Figma Tool Grid v1.1 (Beyond / AI integration). */
export function MarketingIconSparkle(props: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M8.2615 0.911133C8.9325 4.38813 10.8845 6.34013 14.3615 7.01113C10.8845 7.68213 8.9325 9.63413 8.2615 13.1111C7.5905 9.63413 5.6385 7.68213 2.1615 7.01113C5.6385 6.34013 7.5905 4.38813 8.2615 0.911133Z"
        fill="currentColor"
      />
      <path
        d="M14.7275 12.8672C15.0691 14.6362 16.0695 15.6366 17.8385 15.9782C16.0695 16.3198 15.0691 17.3202 14.7275 19.0892C14.3859 17.3202 13.3855 16.3198 11.6165 15.9782C13.3855 15.6366 14.3859 14.6362 14.7275 12.8672Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** QA Arrow Right — 20×20 viewBox for Tool Grid. */
export function MarketingIconArrowRight(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M4 10H15M11 14L15 10L11 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Process Research — Figma Page 05 (20×20, currentColor). */
export function MarketingIconProcessResearch(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M13.75 8.75C13.75 11.5114 11.5114 13.75 8.75 13.75C5.98858 13.75 3.75 11.5114 3.75 8.75C3.75 5.98858 5.98858 3.75 8.75 3.75C11.5114 3.75 13.75 5.98858 13.75 8.75Z"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path d="M12.5 12.5L16.875 16.875" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M8.75 10C9.44036 10 10 9.44036 10 8.75C10 8.05964 9.44036 7.5 8.75 7.5C8.05964 7.5 7.5 8.05964 7.5 8.75C7.5 9.44036 8.05964 10 8.75 10Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Icon / Process Remake — Figma Page 05 (20×20, currentColor). */
export function MarketingIconProcessRemake(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M6.25 10C6.25 11.0355 5.41053 11.875 4.375 11.875C3.33947 11.875 2.5 11.0355 2.5 10C2.5 8.96447 3.33947 8.125 4.375 8.125C5.41053 8.125 6.25 8.96447 6.25 10Z"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M16.875 4.375C16.875 5.41053 16.0355 6.25 15 6.25C13.9645 6.25 13.125 5.41053 13.125 4.375C13.125 3.33947 13.9645 2.5 15 2.5C16.0355 2.5 16.875 3.33947 16.875 4.375Z"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M15 17.5C16.0355 17.5 16.875 16.6605 16.875 15.625C16.875 14.5895 16.0355 13.75 15 13.75C13.9645 13.75 13.125 14.5895 13.125 15.625C13.125 16.6605 13.9645 17.5 15 17.5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path d="M6.25 9.375L13.125 5M6.25 10.625L13.125 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Icon / Process Film — Figma Page 05 (20×20, currentColor). */
export function MarketingIconProcessFilm(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M3.75 5H11.875C12.9105 5 13.75 5.83947 13.75 6.875V13.125C13.75 14.1605 12.9105 15 11.875 15H3.75C2.71447 15 1.875 14.1605 1.875 13.125V6.875C1.875 5.83947 2.71447 5 3.75 5Z"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M13.75 8.125L18.125 5.625V14.375L13.75 11.875"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M6.875 7.5L10.625 10L6.875 12.5V7.5Z" fill="currentColor" />
    </svg>
  );
}

/** Marketing / FAQ Plus — Figma Page 09. */
export function MarketingIconPlus(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path d="M10 4.5V15.5M4.5 10H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Marketing / FAQ Minus — Figma Page 09. */
export function MarketingIconMinus(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path d="M4.5 10H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Icon / Check — Figma Page 05 (20×20, currentColor). */
export function MarketingIconCheck(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M5 10.5L8.2 13.5L15 6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Tool Finder — Figma Page 05 (20×20, currentColor). */
export function MarketingIconToolFinder(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M3 4H17V16H3V4ZM8 7L13 10L8 13V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Star — Figma Page 05 (16×16, currentColor fill). */
export function MarketingIconStar(props: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" {...props}>
      <path
        d="M8 0L10.4704 5.26156L16 6.10934L11.9936 10.2136L12.9408 16L8 13.2548L3.0592 16L4.0064 10.2136L0 6.10934L5.5296 5.26156L8 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Icon / Menu — Figma Page 05 (20×20, currentColor). */
export function MarketingIconMenu(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M0 4C0 3.44772 0.447715 3 1 3H19C19.5523 3 20 3.44772 20 4C20 4.55228 19.5523 5 19 5H1C0.447715 5 0 4.55228 0 4Z"
        fill="currentColor"
      />
      <path
        d="M0 10C0 9.44772 0.447715 9 1 9H19C19.5523 9 20 9.44772 20 10C20 10.5523 19.5523 11 19 11H1C0.447715 11 0 10.5523 0 10Z"
        fill="currentColor"
      />
      <path
        d="M0 16C0 15.4477 0.447715 15 1 15H19C19.5523 15 20 15.4477 20 16C20 16.5523 19.5523 17 19 17H1C0.447715 17 0 16.5523 0 16Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Icon / Close — Figma Page 05 (20×20, currentColor). */
export function MarketingIconClose(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" {...props}>
      <path
        d="M5 5L15 15M15 5L5 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type MarketingToolIconId =
  | "script"
  | "hooks"
  | "broll"
  | "creators"
  | "carousel"
  | "finder";

const TOOL_ICONS: Record<MarketingToolIconId, (props: IconProps) => ReactNode> = {
  script: MarketingIconScript,
  hooks: MarketingIconHooks,
  broll: MarketingIconBroll,
  creators: MarketingIconCreators,
  carousel: MarketingIconCarousel,
  finder: MarketingIconFinder,
};

export function MarketingToolIcon({
  name,
  ...props
}: IconProps & { name: MarketingToolIconId }) {
  const Icon = TOOL_ICONS[name];
  return <Icon {...props} />;
}
