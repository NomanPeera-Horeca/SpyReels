/**
 * Editor Instagram / LinkedIn format contract.
 *
 * Source of truth: docs/mockups/spyreels_carousel_studio_minimal_homepage_final.html
 * (Instagram canvas default 4:5, LinkedIn canvas 1:1) plus the existing
 * 1080-wide export pipeline in carouselExportOptions.
 *
 * Do not invent other aspect ratios for this toggle.
 */

import type { CarouselDesignTokens } from "@shared/carouselTemplates";
import {
  SLIDE_EXPORT_TARGET_WIDTH,
  naturalSlideSizeForAspect,
  slideCaptureOutputSize,
  buildSlideCaptureOptions,
} from "@/lib/carouselExportOptions";
import type { Platform } from "./mockData";

export type CarouselPlatformPreset = {
  platform: Platform;
  aspectRatio: CarouselDesignTokens["aspectRatio"];
  exportWidth: number;
  exportHeight: number;
  label: string;
};

function exportSizeForAspect(
  aspect: CarouselDesignTokens["aspectRatio"]
): { exportWidth: number; exportHeight: number } {
  const natural = naturalSlideSizeForAspect(aspect);
  const capture = buildSlideCaptureOptions(
    natural.width,
    natural.height,
    SLIDE_EXPORT_TARGET_WIDTH
  );
  const output = slideCaptureOutputSize(capture);
  return {
    exportWidth: output.outputWidth,
    exportHeight: output.outputHeight,
  };
}

const instagramExport = exportSizeForAspect("4:5");
const linkedinExport = exportSizeForAspect("1:1");

export const CAROUSEL_PLATFORM_PRESETS: Record<Platform, CarouselPlatformPreset> = {
  instagram: {
    platform: "instagram",
    aspectRatio: "4:5",
    exportWidth: instagramExport.exportWidth,
    exportHeight: instagramExport.exportHeight,
    label: "Instagram",
  },
  linkedin: {
    platform: "linkedin",
    aspectRatio: "1:1",
    exportWidth: linkedinExport.exportWidth,
    exportHeight: linkedinExport.exportHeight,
    label: "LinkedIn",
  },
};

export function aspectFromPlatform(
  platform: Platform
): CarouselDesignTokens["aspectRatio"] {
  return CAROUSEL_PLATFORM_PRESETS[platform].aspectRatio;
}

export function platformFromAspect(
  aspect: string | null | undefined
): Platform {
  if (aspect === "1:1") return "linkedin";
  return "instagram";
}

export function platformPreset(platform: Platform): CarouselPlatformPreset {
  return CAROUSEL_PLATFORM_PRESETS[platform];
}
