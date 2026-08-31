import sharp from "sharp";

export type PngContentFillReport = {
  width: number;
  height: number;
  contentMinX: number;
  contentMaxX: number;
  leftEdgeFilled: boolean;
  rightEdgeFilled: boolean;
  rightTwoThirdsBlank: boolean;
  fillWidthRatio: number;
};

export async function analyzePngContentFill(
  png: Buffer,
  opts?: { edgeInset?: number; blankMax?: number }
): Promise<PngContentFillReport> {
  const edgeInset = opts?.edgeInset ?? 8;
  const blankMax = opts?.blankMax ?? 16;
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const isBlank = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    const a = data[i + 3] ?? 255;
    if (a < 12) return true;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    return r <= blankMax && g <= blankMax && b <= blankMax;
  };

  let contentMinX = width;
  let contentMaxX = -1;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 2) {
      if (!isBlank(x, y)) {
        if (x < contentMinX) contentMinX = x;
        if (x > contentMaxX) contentMaxX = x;
      }
    }
  }

  const leftEdgeFilled = contentMinX <= edgeInset;
  const rightEdgeFilled = contentMaxX >= width - 1 - edgeInset;
  const rightStart = Math.floor(width / 3);
  let rightNonBlank = 0;
  let rightSamples = 0;
  for (let y = 0; y < height; y += 8) {
    for (let x = rightStart; x < width; x += 4) {
      rightSamples += 1;
      if (!isBlank(x, y)) rightNonBlank += 1;
    }
  }
  const rightTwoThirdsBlank =
    rightSamples > 0 && rightNonBlank / rightSamples < 0.02;
  const fillWidthRatio =
    contentMaxX >= contentMinX ? (contentMaxX - contentMinX + 1) / width : 0;

  return {
    width,
    height,
    contentMinX: contentMinX === width ? -1 : contentMinX,
    contentMaxX,
    leftEdgeFilled,
    rightEdgeFilled,
    rightTwoThirdsBlank,
    fillWidthRatio,
  };
}
