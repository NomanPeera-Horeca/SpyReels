/**
 * Brand / Platform marks, Full Color (Figma Page 05: 300:318, 300:324, 275:170).
 * Exported from the locked Figma components without changes. These are
 * third-party brand marks, so their official colors stay literal on purpose.
 */
import { useId } from "react";
import type { SocialPlatform } from "@shared/personalization/model";

type MarkProps = { size?: number; className?: string };

export function InstagramFullColorMark({ size = 20, className }: MarkProps) {
  const gid = `sr-ig-${useId().replace(/:/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path
        d="M13.5 1.5H6.5C3.73858 1.5 1.5 3.73858 1.5 6.5V13.5C1.5 16.2614 3.73858 18.5 6.5 18.5H13.5C16.2614 18.5 18.5 16.2614 18.5 13.5V6.5C18.5 3.73858 16.2614 1.5 13.5 1.5Z"
        fill={`url(#${gid})`}
      />
      <path
        d="M10 13.8002C12.0987 13.8002 13.8 12.0989 13.8 10.0002C13.8 7.90151 12.0987 6.2002 10 6.2002C7.90133 6.2002 6.20001 7.90151 6.20001 10.0002C6.20001 12.0989 7.90133 13.8002 10 13.8002Z"
        stroke="white"
        strokeWidth="1.6"
      />
      <path
        d="M14.6 6.5C15.1523 6.5 15.6 6.05228 15.6 5.5C15.6 4.94772 15.1523 4.5 14.6 4.5C14.0477 4.5 13.6 4.94772 13.6 5.5C13.6 6.05228 14.0477 6.5 14.6 6.5Z"
        fill="white"
      />
      <defs>
        <linearGradient
          id={gid}
          x1="2"
          y1="18"
          x2="18"
          y2="2"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFD600" />
          <stop offset="0.45" stopColor="#FF0169" />
          <stop offset="1" stopColor="#D300C5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TikTokFullColorMark({ size = 20, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path
        d="M11.7 2.7002C12.15 4.8502 13.4 6.1502 15.6 6.5002V9.3002C14.3 9.3502 13.05 9.0002 11.8 8.2002V13.2502C11.8 16.4502 9.44998 18.5502 6.64998 18.5502C3.69998 18.5502 1.34998 16.2502 1.34998 13.3002C1.34998 10.1002 4.14998 7.7002 7.39998 8.2002V11.1502C5.79998 10.6502 4.24998 11.7002 4.24998 13.3002C4.24998 14.6002 5.29998 15.6502 6.59998 15.6502C8.09998 15.6502 8.99998 14.5502 8.99998 12.8502V2.7002H11.7Z"
        fill="#111116"
      />
      <path
        d="M11.7 2.7002C12.15 4.8502 13.4 6.1502 15.6 6.5002"
        stroke="#25F4EE"
        strokeWidth="1.4"
      />
      <path
        d="M9.50002 2.7002V13.2002C9.50002 15.1002 8.40002 16.4002 6.65002 16.4002"
        stroke="#FE2C55"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function YouTubeFullColorMark({ size = 20, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path
        d="M18.4 6.10039C18.2929 5.67269 18.0746 5.28092 17.7673 4.9648C17.4599 4.64868 17.0745 4.41946 16.65 4.30039C15.1 3.90039 9.99995 3.90039 9.99995 3.90039C9.99995 3.90039 4.89995 3.90039 3.34995 4.30039C2.92544 4.41946 2.53997 4.64868 2.23263 4.9648C1.92529 5.28092 1.70702 5.67269 1.59995 6.10039C1.19995 7.65039 1.19995 10.0004 1.19995 10.0004C1.19995 10.0004 1.19995 12.3504 1.59995 13.9004C1.70702 14.3281 1.92529 14.7199 2.23263 15.036C2.53997 15.3521 2.92544 15.5813 3.34995 15.7004C4.89995 16.1004 9.99995 16.1004 9.99995 16.1004C9.99995 16.1004 15.1 16.1004 16.65 15.7004C17.0745 15.5813 17.4599 15.3521 17.7673 15.036C18.0746 14.7199 18.2929 14.3281 18.4 13.9004C18.7999 12.3504 18.7999 10.0004 18.7999 10.0004C18.7999 10.0004 18.7999 7.65039 18.4 6.10039Z"
        fill="#FF0000"
      />
      <path d="M8 13.1998L13.2 9.9998L8 6.7998V13.1998Z" fill="white" />
    </svg>
  );
}

export function PlatformFullColorMark({
  platform,
  ...rest
}: MarkProps & { platform: SocialPlatform }) {
  if (platform === "instagram") return <InstagramFullColorMark {...rest} />;
  if (platform === "tiktok") return <TikTokFullColorMark {...rest} />;
  return <YouTubeFullColorMark {...rest} />;
}
