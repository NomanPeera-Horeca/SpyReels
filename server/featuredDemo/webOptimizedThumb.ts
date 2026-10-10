import sharp from "sharp";
import { r2ObjectPublicUrl, storageHead, storagePut } from "../storage";

const TARGET_WIDTH = 480;

export type WebOptimizedThumbDeps = {
  fetchBuffer: (url: string) => Promise<Buffer | null>;
  headExists: (key: string) => Promise<boolean>;
  putObject: (
    key: string,
    body: Buffer,
    contentType: string
  ) => Promise<{ url: string }>;
  publicUrl: (key: string) => string;
};

function safeId(externalId: string): string {
  return externalId.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function featuredDemoThumbR2Key(
  platform: string,
  externalId: string,
  ext: "webp" | "jpg" = "webp"
): string {
  const platformSafe = platform.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const id = safeId(externalId);
  return `featured-demo-thumbs/${platformSafe}/${id}.${ext}`;
}

export async function optimizeThumbBuffer(
  buf: Buffer
): Promise<{ buffer: Buffer; contentType: string; ext: "webp" | "jpg" }> {
  const base = sharp(buf).rotate().resize({
    width: TARGET_WIDTH,
    withoutEnlargement: true,
  });

  try {
    const webp = await base.webp({ quality: 80 }).toBuffer();
    return { buffer: webp, contentType: "image/webp", ext: "webp" };
  } catch {
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { buffer: jpeg, contentType: "image/jpeg", ext: "jpg" };
  }
}

/**
 * Download a source cover, resize to ~480px wide, store as webp (jpeg fallback)
 * under featured-demo-thumbs/. Idempotent when the canonical key already exists.
 */
export async function mirrorFeaturedDemoThumb(
  platform: string,
  externalId: string,
  sourceUrl: string | null | undefined,
  deps?: Partial<WebOptimizedThumbDeps>
): Promise<string> {
  const src = (sourceUrl ?? "").trim();
  if (!src) return "";

  const id = safeId(externalId);
  if (!id) return src;

  const fetchBuffer =
    deps?.fetchBuffer ??
    (async (url: string) => {
      const { gotScraping: gs } = await import("got-scraping");
      const res = await gs({
        url,
        responseType: "buffer",
        timeout: { request: 10_000 },
        retry: { limit: 0 },
      });
      if (res.statusCode !== 200 || !res.rawBody) return null;
      const raw = res.rawBody;
      return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    });

  const headExists = deps?.headExists ?? ((key: string) => storageHead(key));
  const putObject =
    deps?.putObject ??
    ((key, body, contentType) => storagePut(key, body, contentType));
  const publicUrl = deps?.publicUrl ?? r2ObjectPublicUrl;

  const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(
    /\/+$/,
    ""
  );

  // Prefer existing webp; also accept prior jpg at the same stem.
  for (const ext of ["webp", "jpg"] as const) {
    const key = featuredDemoThumbR2Key(platform, id, ext);
    const canonical = publicBase ? `${publicBase}/${key}` : publicUrl(key);
    if (src === canonical || src.endsWith(`/${key}`)) return src;
    if (await headExists(key)) return canonical;
  }

  try {
    const buf = await fetchBuffer(src);
    if (!buf) return src;
    const optimized = await optimizeThumbBuffer(buf);
    const key = featuredDemoThumbR2Key(platform, id, optimized.ext);
    const { url } = await putObject(key, optimized.buffer, optimized.contentType);
    return url;
  } catch {
    return src;
  }
}
