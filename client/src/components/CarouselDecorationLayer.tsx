import { useId, type CSSProperties } from "react";
import type { CarouselDecorationType } from "@shared/carouselTemplates";

export type CarouselDecorationLayerProps = {
  type: CarouselDecorationType | undefined;
  color: string;
};

/**
 * Absolutely-positioned decorative SVG pattern layer, sits behind slide
 * content (caller must render this first, before the text content, and
 * ensure the root has position: "relative"). Fixed per template, never
 * user-selectable - purely visual variety baked into each template's design.
 */
export function CarouselDecorationLayer({ type, color }: CarouselDecorationLayerProps) {
  const uid = useId().replace(/:/g, "");

  if (!type || type === "none") {
    return null;
  }

  const commonStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
  };

  if (type === "dots") {
    const patternId = `carousel-dots-${uid}`;
    return (
      <svg style={commonStyle} width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill={color} opacity="0.35" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="70" height="70" fill={`url(#${patternId})`} />
        <rect x="100%" y="100%" width="70" height="70" transform="translate(-70,-70)" fill={`url(#${patternId})`} />
      </svg>
    );
  }

  if (type === "hexagons") {
    const patternId = `carousel-hex-${uid}`;
    return (
      <svg style={commonStyle} width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <pattern id={patternId} width="24" height="21" patternUnits="userSpaceOnUse">
            <polygon
              points="6,0 18,0 24,10.5 18,21 6,21 0,10.5"
              fill="none"
              stroke={color}
              strokeWidth="1"
              opacity="0.25"
            />
          </pattern>
        </defs>
        <rect x="0" y="0" width="110" height="140" fill={`url(#${patternId})`} />
        <rect x="100%" y="0" width="110" height="140" transform="translate(-110,0)" fill={`url(#${patternId})`} />
      </svg>
    );
  }

  if (type === "lightning") {
    return (
      <svg style={commonStyle} width="100%" height="100%" viewBox="0 0 360 450" preserveAspectRatio="xMidYMid slice">
        <polygon points="40,20 10,120 35,120 15,220 90,90 55,90 75,20" fill={color} opacity="0.18" />
        <polygon points="330,260 300,360 325,360 305,440 380,310 345,310 365,260" fill={color} opacity="0.18" />
      </svg>
    );
  }

  if (type === "circles") {
    return (
      <svg style={commonStyle} width="100%" height="100%" viewBox="0 0 360 450" preserveAspectRatio="xMidYMid slice">
        <circle cx="330" cy="30" r="55" fill={color} opacity="0.15" />
        <circle cx="20" cy="420" r="70" fill={color} opacity="0.12" />
        <circle cx="180" cy="120" r="140" fill="none" stroke={color} strokeWidth="1" opacity="0.15" />
        <circle cx="180" cy="120" r="100" fill="none" stroke={color} strokeWidth="1" opacity="0.12" />
      </svg>
    );
  }

  if (type === "steps") {
    return (
      <svg style={commonStyle} width="100%" height="100%" viewBox="0 0 360 450" preserveAspectRatio="xMidYMid slice">
        <path
          d="M 300 40 L 340 40 L 340 80 L 320 80 L 320 100 L 300 100 Z"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          opacity="0.3"
        />
        <path
          d="M 20 350 L 60 350 L 60 390 L 40 390 L 40 410 L 20 410 Z"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          opacity="0.3"
        />
      </svg>
    );
  }

  if (type === "arrow") {
    // Bottom-right hand-drawn arrow (sketchy stroke + chevron head).
    return (
      <svg style={commonStyle} width="100%" height="100%" viewBox="0 0 360 450" preserveAspectRatio="xMidYMid slice">
        <path
          d="M 210 385 C 250 378, 290 382, 318 390"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M 302 378 L 320 392 L 300 404"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      </svg>
    );
  }

  return null;
}
