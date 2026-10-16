/**
 * Figma Page 05 icon components (exported from the locked Figma components,
 * paths unchanged). Colors are bound to tokens instead of raw hex so they
 * follow the theme. Decorative by default (aria-hidden).
 */
import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
};

function base({ size = 20, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    "aria-hidden": true,
    focusable: false,
    ...rest,
  } as const;
}

/** Spinner (44:21). Indeterminate; rotates via CSS in the consumer. */
export function IconSpinner(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="var(--sr-color-text-secondary)"
        strokeWidth="2"
        strokeDasharray="18 8"
      />
    </svg>
  );
}

/** Icon / Check (47:16). */
export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M5 10.5L8.2 13.5L15 6.5"
        stroke="var(--sr-color-brand-primary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Check Inverse (320:626). */
export function IconCheckInverse(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M5 10.5L8.2 13.5L15 6.5"
        stroke="var(--sr-color-text-on-brand)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Play (285:239). */
export function IconPlay(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M6.20001 4.2002L15.2 10.0002L6.20001 15.8002V4.2002Z"
        fill="var(--sr-color-text-primary)"
      />
    </svg>
  );
}

/** Icon / Tool Finder (143:327). */
export function IconToolFinder(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M3 4H17V16H3V4ZM8 7L13 10L8 13V7Z"
        stroke="var(--sr-color-text-secondary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Tool Script (143:329). */
export function IconToolScript(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M17 6L13 2H5V18H17V6ZM13 2V6H17M8 10H14M8 13H14"
        stroke="var(--sr-color-text-secondary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Tool Creators (143:331). */
export function IconToolCreators(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M3 18C3 14.8 6 13 10 13C14 13 17 14.8 17 18M6 8C6 5.8 7.8 4 10 4C12.2 4 14 5.8 14 8C14 10.2 12.2 12 10 12C7.8 12 6 10.2 6 8Z"
        stroke="var(--sr-color-text-secondary)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / AI Sparkle (480:1224). */
export function IconAiSparkle(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M8.2615 0.910156C8.9325 4.38716 10.8845 6.33916 14.3615 7.01016C10.8845 7.68116 8.9325 9.63316 8.2615 13.1102C7.5905 9.63316 5.6385 7.68116 2.1615 7.01016C5.6385 6.33916 7.5905 4.38716 8.2615 0.910156Z"
        fill="var(--sr-color-text-primary)"
      />
      <path
        d="M14.7275 12.8672C15.0691 14.6362 16.0695 15.6366 17.8385 15.9782C16.0695 16.3198 15.0691 17.3202 14.7275 19.0892C14.3859 17.3202 13.3855 16.3198 11.6165 15.9782C13.3855 15.6366 14.3859 14.6362 14.7275 12.8672Z"
        fill="var(--sr-color-text-primary)"
      />
    </svg>
  );
}

/** Icon / Arrow Left (385:1214). Used by the Back ghost button. */
export function IconArrowLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M12.5 5L7.5 10L12.5 15"
        stroke="var(--sr-color-text-secondary)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Icon / Error (44:20). `tone="warning"` is the Partial status tint used by
 * Status / Analysis Line (status/warning/foreground).
 */
export function IconError({
  tone = "error",
  ...props
}: IconProps & { tone?: "error" | "warning" }) {
  const color =
    tone === "warning"
      ? "var(--sr-color-status-warning-foreground)"
      : "var(--sr-color-status-error-foreground)";
  return (
    <svg {...base(props)}>
      <path
        d="M10 17C13.866 17 17 13.866 17 10C17 6.13401 13.866 3 10 3C6.13401 3 3 6.13401 3 10C3 13.866 6.13401 17 10 17Z"
        stroke={color}
        strokeWidth="1.6"
      />
      <path d="M10 6.5V10.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M10 14.5C10.5523 14.5 11 14.0523 11 13.5C11 12.9477 10.5523 12.5 10 12.5C9.44772 12.5 9 12.9477 9 13.5C9 14.0523 9.44772 14.5 10 14.5Z"
        fill={color}
      />
    </svg>
  );
}

/** Minus indicator from Status / Analysis Stage, State=Skipped (1259:481). */
export function IconMinus(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M4.5 10H15.5"
        stroke="var(--sr-color-text-tertiary)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
