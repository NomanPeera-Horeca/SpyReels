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
