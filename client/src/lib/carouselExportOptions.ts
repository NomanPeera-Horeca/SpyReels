/**
 * html-to-image capture sizing for carousel PNG / ZIP export.
 *
 * Passing a larger width/height than the live slide enlarges the canvas
 * without scaling the cloned DOM. Keep natural CSS size and use pixelRatio
 * so 360x450 becomes 1080x1350 with content filling the frame.
 */

export const SLIDE_EXPORT_TARGET_WIDTH = 1080;

export type SlideAspectRatio = "4:5" | "1:1" | "9:16";

export type SlideCaptureSizeOptions = {
  /** Natural CSS width of the slide. Do not enlarge this. */
  width: number;
  /** Natural CSS height of the slide. Do not enlarge this. */
  height: number;
  /** targetExportWidth / naturalWidth. Scales canvas pixels only. */
  pixelRatio: number;
};

export type SlideCaptureOutputSize = {
  outputWidth: number;
  outputHeight: number;
};

export function buildSlideCaptureOptions(
  naturalWidth: number,
  naturalHeight: number,
  targetExportWidth: number = SLIDE_EXPORT_TARGET_WIDTH
): SlideCaptureSizeOptions {
  const width = Math.max(1, Math.round(naturalWidth) || 1);
  const height = Math.max(1, Math.round(naturalHeight) || 1);
  const pixelRatio = targetExportWidth / width;
  return { width, height, pixelRatio };
}

/** Same integer conversion html-to-image uses when assigning canvas.width/height. */
function toCanvasPx(value: number): number {
  return Math.max(1, Math.trunc(value));
}

export function slideCaptureOutputSize(
  options: SlideCaptureSizeOptions
): SlideCaptureOutputSize {
  return {
    outputWidth: toCanvasPx(options.width * options.pixelRatio),
    outputHeight: toCanvasPx(options.height * options.pixelRatio),
  };
}

export function naturalSlideSizeForAspect(
  aspect: SlideAspectRatio,
  naturalWidth = 360
): { width: number; height: number } {
  const height =
    aspect === "4:5"
      ? Math.round((naturalWidth * 5) / 4)
      : aspect === "9:16"
        ? Math.round((naturalWidth * 16) / 9)
        : naturalWidth;
  return { width: naturalWidth, height };
}

export function carouselSlidePngFilename(index: number): string {
  return `slide-${String(index + 1).padStart(2, "0")}.png`;
}

export function expectedCarouselZipFilenames(slideCount: number): string[] {
  return Array.from({ length: slideCount }, (_, i) => carouselSlidePngFilename(i));
}
