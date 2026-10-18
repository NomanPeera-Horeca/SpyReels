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

/** Icon / Tool Carousel (143:337). */
export function IconToolCarousel(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M2 6V14M18 6V14M6 3H14V17H6V3Z"
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

const SECONDARY = "var(--sr-color-text-secondary)";

/** Icon / Tool Hook (143:333). */
export function IconToolHook(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M10 2V6M10 14V18M2 10H6M14 10H18M4 4L7 7M13 13L16 16M16 4L13 7M7 13L4 16"
        stroke={SECONDARY}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Lucide / Link (1364:61). */
export function IconLink(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M8.33334 10.8332C8.69122 11.3117 9.14781 11.7075 9.67214 11.994C10.1965 12.2805 10.7763 12.4508 11.3722 12.4935C11.9682 12.5362 12.5663 12.4502 13.1261 12.2414C13.6859 12.0326 14.1943 11.7058 14.6167 11.2832L17.1167 8.78322C17.8757 7.99738 18.2956 6.94487 18.2862 5.85238C18.2767 4.7599 17.8385 3.71485 17.0659 2.94231C16.2934 2.16978 15.2483 1.73157 14.1558 1.72208C13.0634 1.71259 12.0109 2.13256 11.225 2.89156L9.79168 4.31656"
        stroke={SECONDARY}
        strokeWidth="1.66667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.6667 9.16653C11.3088 8.68809 10.8522 8.29221 10.3279 8.00575C9.80356 7.71928 9.22376 7.54893 8.62781 7.50625C8.03185 7.46357 7.43369 7.54956 6.87389 7.75838C6.31409 7.9672 5.80575 8.29397 5.38335 8.71653L2.88335 11.2165C2.12436 12.0024 1.70438 13.0549 1.71387 14.1474C1.72337 15.2399 2.16157 16.2849 2.9341 17.0574C3.70664 17.83 4.75169 18.2682 5.84418 18.2777C6.93666 18.2872 7.98917 17.8672 8.77501 17.1082L10.2 15.6832"
        stroke={SECONDARY}
        strokeWidth="1.66667"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Star (275:163). `filled` = saved. */
export function IconStar({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(props)}>
      <path
        d="M10 2.1001L12.35 6.8601L17.6 7.6201L13.8 11.3201L14.7 16.5501L10 14.0801L5.30002 16.5501L6.20002 11.3201L2.40002 7.6201L7.65002 6.8601L10 2.1001Z"
        stroke={filled ? "var(--sr-color-brand-primary)" : SECONDARY}
        fill={filled ? "var(--sr-color-brand-primary)" : "none"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / More (275:166). */
export function IconMore(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="4" cy="10" r="1.5" fill={SECONDARY} />
      <circle cx="10" cy="10" r="1.5" fill={SECONDARY} />
      <circle cx="16" cy="10" r="1.5" fill={SECONDARY} />
    </svg>
  );
}

/** Icon / Expand (375:1051). */
export function IconExpand(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M7 3H3V7M13 3H17V7M17 13V17H13M7 17H3V13"
        stroke={SECONDARY}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Close (X). Same stroke as the step 4 remove control. */
export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5L15 15M15 5L5 15" stroke="var(--sr-color-text-primary)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Pencil / Approved action (1437:4519). 16 grid; drawn at 16 by default. */
export function IconPencil({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })} viewBox="0 0 16 16">
      <path
        d="M10.667 2.66667L13.3337 5.33334M13.3337 5.33334L6.00033 12.7333L2.66699 13.3333L3.33366 10L10.667 2.66667C11.0402 2.48843 11.4595 2.43027 11.8671 2.50021C12.2748 2.57015 12.6507 2.76474 12.9431 3.05719C13.2356 3.34964 13.4302 3.72557 13.5001 4.1332C13.5701 4.54084 13.5119 4.96013 13.3337 5.33334Z"
        stroke="var(--sr-color-text-secondary)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Trash / Approved action (1437:4522). Destructive red from the locked tokens. */
export function IconTrash(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M2.5 5.00001H17.5M6.66667 5.00001V3.33334H13.3333V5.00001M5 5.00001L5.83333 16.6667H14.1667L15 5.00001M8.33333 8.33334V14.1667M11.6667 8.33334V14.1667"
        stroke="var(--sr-color-action-destructive-default)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon / Pillar (1402:4927). 24 grid. */
export function IconPillar({ size = 24, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })} viewBox="0 0 24 24">
      <path
        d="M2 6V14M18 6V14M6 3H14V17H6V3Z"
        stroke="var(--sr-color-text-brand)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Neutral up-right arrow for the performance signal (1562:24203, Icon / Navigation rotated). 14px. */
export function IconArrowUpRight({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base({ size, ...props })} viewBox="8 6.5 14 14">
      <path
        d="M10.4789 18.0211L19.5211 8.97894M19.5211 15.555V8.97894H12.945"
        stroke="currentColor"
        strokeWidth="2.0925"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
