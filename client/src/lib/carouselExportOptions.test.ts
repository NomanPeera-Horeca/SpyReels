import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { analyzePngContentFill } from "../../../scripts/pngContentFill";
import {
  SLIDE_EXPORT_TARGET_WIDTH,
  buildSlideCaptureOptions,
  carouselSlidePngFilename,
  expectedCarouselZipFilenames,
  naturalSlideSizeForAspect,
  slideCaptureOutputSize,
} from "./carouselExportOptions";

describe("buildSlideCaptureOptions", () => {
  it("keeps a 4:5 360x450 slide natural and scales to 1080x1350 via pixelRatio", () => {
    const capture = buildSlideCaptureOptions(360, 450);
    const output = slideCaptureOutputSize(capture);
    expect(capture).toEqual({
      width: 360,
      height: 450,
      pixelRatio: 3,
    });
    expect(output).toEqual({ outputWidth: 1080, outputHeight: 1350 });
    expect(capture.width).not.toBe(SLIDE_EXPORT_TARGET_WIDTH);
  });

  it("keeps a 1:1 360x360 slide natural and scales to 1080x1080", () => {
    const size = naturalSlideSizeForAspect("1:1");
    const capture = buildSlideCaptureOptions(size.width, size.height);
    expect(slideCaptureOutputSize(capture)).toEqual({
      outputWidth: 1080,
      outputHeight: 1080,
    });
    expect(capture.pixelRatio).toBe(1080 / 360);
    expect(capture.width).toBe(360);
    expect(capture.height).toBe(360);
  });

  it("keeps a 9:16 360x640 slide natural and scales to 1080x1920", () => {
    const size = naturalSlideSizeForAspect("9:16");
    expect(size).toEqual({ width: 360, height: 640 });
    const capture = buildSlideCaptureOptions(size.width, size.height);
    expect(slideCaptureOutputSize(capture)).toEqual({
      outputWidth: 1080,
      outputHeight: 1920,
    });
    expect(capture.pixelRatio).toBe(1080 / 360);
  });

  it("does not stretch aspect ratio when natural size is slightly off 360", () => {
    const capture = buildSlideCaptureOptions(359, 449);
    const output = slideCaptureOutputSize(capture);
    expect(capture.width).toBe(359);
    expect(capture.height).toBe(449);
    expect(capture.pixelRatio).toBe(1080 / 359);
    expect(output.outputWidth).toBe(1080);
    expect(
      Math.abs(output.outputHeight - Math.round((449 / 359) * 1080))
    ).toBeLessThanOrEqual(1);
  });

  it("uses pixelRatio = targetExportWidth / naturalWidth", () => {
    const capture = buildSlideCaptureOptions(270, 338, 1080);
    expect(capture.pixelRatio).toBe(1080 / 270);
    expect(slideCaptureOutputSize(capture).outputWidth).toBe(1080);
  });
});

describe("carousel zip slide filenames", () => {
  it("lists every slide-NN.png the ZIP helper writes", () => {
    expect(expectedCarouselZipFilenames(3)).toEqual([
      "slide-01.png",
      "slide-02.png",
      "slide-03.png",
    ]);
    expect(carouselSlidePngFilename(9)).toBe("slide-10.png");
  });
});

describe("PNG content fill (bug vs fixed fixture)", () => {
  it("flags the old 360px-on-1080 canvas as right-two-thirds blank", async () => {
    const png = await sharp({
      create: {
        width: 1080,
        height: 1350,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 360,
              height: 1350,
              channels: 3,
              background: { r: 80, g: 40, b: 200 },
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    const report = await analyzePngContentFill(png);
    expect(report.width).toBe(1080);
    expect(report.height).toBe(1350);
    expect(report.leftEdgeFilled).toBe(true);
    expect(report.rightEdgeFilled).toBe(false);
    expect(report.rightTwoThirdsBlank).toBe(true);
    expect(report.fillWidthRatio).toBeLessThan(0.4);
  });

  it("accepts a full-bleed 1080x1350 slide as filling both edges", async () => {
    const png = await sharp({
      create: {
        width: 1080,
        height: 1350,
        channels: 3,
        background: { r: 40, g: 180, b: 90 },
      },
    })
      .png()
      .toBuffer();

    const report = await analyzePngContentFill(png);
    expect(report.width).toBe(1080);
    expect(report.height).toBe(1350);
    expect(report.leftEdgeFilled).toBe(true);
    expect(report.rightEdgeFilled).toBe(true);
    expect(report.rightTwoThirdsBlank).toBe(false);
    expect(report.fillWidthRatio).toBeGreaterThan(0.98);
  });
});
