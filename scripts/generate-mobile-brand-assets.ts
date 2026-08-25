/**
 * Generates PWA icons, Capacitor source assets, and native iOS/Android icons/splashes.
 * Run: pnpm mobile:assets
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const FAVICON_PATH = path.join(ROOT, "client/public/favicon-192.png");
const LOGO_PATH = path.join(ROOT, "client/public/brand/spyreels-logo.png");
const BRAND_BG = { r: 18, g: 18, b: 24, alpha: 1 };

const ANDROID_LAUNCHER_SIZES: Record<string, number> = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const ANDROID_FOREGROUND_SIZES: Record<string, number> = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

const ANDROID_SPLASH_PORT: Record<string, [number, number]> = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
};

async function writeSquareIcon(
  source: Buffer,
  size: number,
  outPath: string
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp(source)
    .resize(size, size, { fit: "contain", background: BRAND_BG })
    .png()
    .toFile(outPath);
}

async function writeForegroundIcon(
  source: Buffer,
  size: number,
  outPath: string
): Promise<void> {
  const iconSize = Math.round(size * 0.62);
  const iconPng = await sharp(source)
    .resize(iconSize, iconSize, { fit: "contain", background: BRAND_BG })
    .png()
    .toBuffer();

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: iconPng, gravity: "center" }])
    .png()
    .toFile(outPath);
}

async function writeSplash(
  logo: Buffer,
  outPath: string,
  width: number,
  height: number
): Promise<void> {
  const logoSize = Math.round(Math.min(width, height) * 0.22);
  const logoPng = await sharp(logo)
    .resize(logoSize, logoSize, { fit: "contain" })
    .png()
    .toBuffer();

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: logoPng, gravity: "center" }])
    .png()
    .toFile(outPath);
}

async function main(): Promise<void> {
  const [iconSource, logoSource] = await Promise.all([
    fs.readFile(FAVICON_PATH),
    fs.readFile(LOGO_PATH),
  ]);

  const pwaDir = path.join(ROOT, "client/public/pwa");
  const resourcesDir = path.join(ROOT, "resources");

  await writeSquareIcon(iconSource, 192, path.join(pwaDir, "icon-192.png"));
  await writeSquareIcon(iconSource, 512, path.join(pwaDir, "icon-512.png"));
  await writeSquareIcon(iconSource, 1024, path.join(resourcesDir, "icon.png"));
  await writeSplash(logoSource, path.join(resourcesDir, "splash.png"), 2732, 2732);

  const iosIconPath = path.join(
    ROOT,
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
  );
  await writeSquareIcon(iconSource, 1024, iosIconPath);

  const iosSplashDir = path.join(
    ROOT,
    "ios/App/App/Assets.xcassets/Splash.imageset"
  );
  for (const filename of [
    "splash-2732x2732.png",
    "splash-2732x2732-1.png",
    "splash-2732x2732-2.png",
  ]) {
    await writeSplash(logoSource, path.join(iosSplashDir, filename), 2732, 2732);
  }

  for (const [density, size] of Object.entries(ANDROID_LAUNCHER_SIZES)) {
    const dir = path.join(ROOT, `android/app/src/main/res/mipmap-${density}`);
    await writeSquareIcon(iconSource, size, path.join(dir, "ic_launcher.png"));
    await writeSquareIcon(
      iconSource,
      size,
      path.join(dir, "ic_launcher_round.png")
    );
  }

  for (const [density, size] of Object.entries(ANDROID_FOREGROUND_SIZES)) {
    const dir = path.join(ROOT, `android/app/src/main/res/mipmap-${density}`);
    await writeForegroundIcon(
      iconSource,
      size,
      path.join(dir, "ic_launcher_foreground.png")
    );
  }

  for (const [density, [width, height]] of Object.entries(ANDROID_SPLASH_PORT)) {
    await writeSplash(
      logoSource,
      path.join(
        ROOT,
        `android/app/src/main/res/drawable-port-${density}/splash.png`
      ),
      width,
      height
    );
    await writeSplash(
      logoSource,
      path.join(
        ROOT,
        `android/app/src/main/res/drawable-land-${density}/splash.png`
      ),
      height,
      width
    );
  }

  await writeSplash(
    logoSource,
    path.join(ROOT, "android/app/src/main/res/drawable/splash.png"),
    1080,
    1920
  );

  console.log(
    "Generated PWA icons, resources/, and native iOS/Android brand assets."
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
