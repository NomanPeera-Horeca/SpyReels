import type { CSSProperties } from "react";
import type { CarouselBackgroundPattern } from "@shared/carouselTemplates";

/** Light graph-paper grid over a solid background color. */
export function notebookGridStyle(
  backgroundColor: string,
  pattern: CarouselBackgroundPattern | undefined
): CSSProperties {
  if (pattern !== "grid") {
    return { backgroundColor };
  }
  return {
    backgroundColor,
    backgroundImage:
      "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
    backgroundSize: "18px 18px",
  };
}
