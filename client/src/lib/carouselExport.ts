/**
 * Shared carousel PNG / zip export. Used by Carousel Library and Carousel Studio.
 * html-to-image hangs on remote CSS backgrounds; we proxy/inline to data URLs first.
 */
import { getFontEmbedCSS, toBlob } from "html-to-image";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const SLIDE_EXPORT_TIMEOUT_MS = 40_000;
const FONT_EMBED_TIMEOUT_MS = 12_000;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

const REMOTE_BG_URL_RE =
  /url\(\s*['"]?(https?:\/\/[^'")\s]+)['"]?\s*\)/gi;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function collectRemoteBackgroundUrls(root: HTMLElement): string[] {
  const urls = new Set<string>();
  const elements: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of elements) {
    const inline = el.style.backgroundImage || "";
    const computed =
      inline && inline !== "none"
        ? inline
        : window.getComputedStyle(el).backgroundImage || "";
    if (!computed || computed === "none" || !computed.includes("url(")) continue;
    REMOTE_BG_URL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = REMOTE_BG_URL_RE.exec(computed)) != null) {
      urls.add(match[1]);
    }
  }
  return Array.from(urls);
}

async function fetchImageAsDataUrlDirect(url: string): Promise<string> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const dataUrl = await blobToDataUrl(await res.blob());
  if (!dataUrl.startsWith("data:")) throw new Error("Invalid data URL");
  return dataUrl;
}

/** Same-origin proxy so export works when the CDN/R2 origin is not in CORS allowlist. */
async function fetchImageAsDataUrlProxied(url: string): Promise<string> {
  const proxyUrl = `/api/carousel/export-image?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Proxy HTTP ${res.status}`);
  }
  const dataUrl = await blobToDataUrl(await res.blob());
  if (!dataUrl.startsWith("data:")) throw new Error("Invalid proxy data URL");
  return dataUrl;
}

async function resolveRemoteImageDataUrl(
  url: string,
  cache: Map<string, string>
): Promise<string> {
  const cached = cache.get(url);
  if (cached) return cached;

  const dataUrl = await withTimeout(
    (async () => {
      try {
        return await fetchImageAsDataUrlDirect(url);
      } catch {
        return await fetchImageAsDataUrlProxied(url);
      }
    })(),
    IMAGE_FETCH_TIMEOUT_MS,
    "Image fetch timed out"
  );
  cache.set(url, dataUrl);
  return dataUrl;
}

/**
 * Prefetch every remote CSS background under root (direct CORS, then same-origin
 * proxy). Shared cache is reused across slides in a zip export.
 */
export async function prefetchRemoteBackgrounds(
  root: HTMLElement,
  cache: Map<string, string>
): Promise<{ ok: number; failed: string[] }> {
  const urls = collectRemoteBackgroundUrls(root);
  const failed: string[] = [];
  let ok = 0;
  await Promise.all(
    urls.map(async (url) => {
      try {
        await resolveRemoteImageDataUrl(url, cache);
        ok += 1;
      } catch {
        failed.push(url);
      }
    })
  );
  return { ok, failed };
}

/**
 * Replace remote CSS backgrounds with absolute <img> tags backed by data URLs.
 * html-to-image embeds <img> reliably; remote CSS backgrounds can hang createImage.
 */
async function replaceRemoteBackgroundsWithImgs(
  root: HTMLElement,
  cache: Map<string, string>
): Promise<() => void> {
  const restores: Array<() => void> = [];
  const elements: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];

  for (const el of elements) {
    const inline = el.style.backgroundImage || "";
    const computed =
      inline && inline !== "none"
        ? inline
        : window.getComputedStyle(el).backgroundImage || "";
    if (!computed || computed === "none" || !computed.includes("http")) continue;

    REMOTE_BG_URL_RE.lastIndex = 0;
    const match = REMOTE_BG_URL_RE.exec(computed);
    if (!match) continue;
    const url = match[1];

    let dataUrl = cache.get(url);
    if (!dataUrl) {
      try {
        dataUrl = await resolveRemoteImageDataUrl(url, cache);
      } catch {
        continue;
      }
    }

    const prevBg = el.style.backgroundImage;
    const prevPos = el.style.position;
    const computedPos = window.getComputedStyle(el).position;
    if (computedPos === "static") {
      el.style.position = "relative";
    }
    el.style.backgroundImage = "none";

    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "";
    img.setAttribute("data-carousel-export-img", "1");
    Object.assign(img.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center",
      pointerEvents: "none",
      zIndex: "0",
    });
    el.insertBefore(img, el.firstChild);

    restores.push(() => {
      img.remove();
      el.style.backgroundImage = prevBg;
      el.style.position = prevPos;
    });
  }

  return () => {
    for (let i = restores.length - 1; i >= 0; i--) restores[i]();
  };
}

export function exportErrorMessage(err: unknown, slideIndex?: number): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const slideLabel =
    slideIndex != null && slideIndex >= 0 ? `slide ${slideIndex + 1}` : "slides";
  if (/timed out/i.test(raw)) {
    return `Timed out exporting ${slideLabel}. Try again.`;
  }
  if (/proxy|cors|failed to fetch|network|HTTP/i.test(raw)) {
    return `Couldn't load background for ${slideLabel}. Try again.`;
  }
  if (/Failed to capture|null/i.test(raw)) {
    return `Couldn't capture ${slideLabel}. Try again.`;
  }
  return `Couldn't export ${slideLabel}. Try again.`;
}

export function slugifyCarouselName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function captureSlideAsPngBlob(
  node: HTMLElement,
  options?: {
    fontEmbedCSS?: string;
    imageCache?: Map<string, string>;
    slideIndex?: number;
  }
): Promise<Blob> {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.isContentEditable) {
    active.blur();
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  await document.fonts.ready;
  const target = (node.firstElementChild as HTMLElement | null) ?? node;
  void target.offsetWidth;
  void target.offsetHeight;

  const imageCache = options?.imageCache ?? new Map<string, string>();
  const restoreBackgrounds = await replaceRemoteBackgroundsWithImgs(
    target,
    imageCache
  );
  try {
    const naturalW = Math.max(1, target.offsetWidth || 360);
    const naturalH = Math.max(1, target.offsetHeight || 450);
    const exportWidth = 1080;
    const exportHeight = Math.round((naturalH / naturalW) * exportWidth);

    const blob = await withTimeout(
      toBlob(target, {
        width: exportWidth,
        height: exportHeight,
        pixelRatio: 1,
        cacheBust: false,
        fontEmbedCSS: options?.fontEmbedCSS ?? "",
        skipFonts: !options?.fontEmbedCSS,
        filter: (domNode) => {
          if (!(domNode instanceof HTMLElement)) return true;
          return domNode.getAttribute("aria-label") !== "Download this slide as PNG";
        },
      }),
      SLIDE_EXPORT_TIMEOUT_MS,
      options?.slideIndex != null
        ? `Timed out exporting slide ${options.slideIndex + 1}`
        : "Slide export timed out"
    );
    if (!blob) {
      throw new Error("Failed to capture slide as image");
    }
    return blob;
  } finally {
    restoreBackgrounds();
  }
}

export async function embedCarouselExportFonts(node: HTMLElement): Promise<string> {
  try {
    return await withTimeout(
      getFontEmbedCSS(node, { cacheBust: false }),
      FONT_EMBED_TIMEOUT_MS,
      "Font embed timed out"
    );
  } catch (fontErr) {
    console.warn("Carousel font embed skipped", fontErr);
    return "";
  }
}

export async function exportCarouselSlidesZip(args: {
  container: HTMLElement;
  zipName: string;
  isCancelled?: () => boolean;
}): Promise<{ fileCount: number; failedSlides: number[] }> {
  const nodes = Array.from(
    args.container.querySelectorAll<HTMLElement>("[data-carousel-slide-id]")
  );
  if (nodes.length === 0) {
    throw new Error("No slides to export");
  }

  const imageCache = new Map<string, string>();
  const prefetch = await prefetchRemoteBackgrounds(args.container, imageCache);
  if (prefetch.failed.length > 0) {
    console.warn(
      "Carousel export: some backgrounds failed to prefetch",
      prefetch.failed.length
    );
  }

  const firstTarget =
    (nodes[0].firstElementChild as HTMLElement | null) ?? nodes[0];
  const fontEmbedCSS = await embedCarouselExportFonts(firstTarget);

  const zip = new JSZip();
  const failedSlides: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (args.isCancelled?.()) {
      return { fileCount: Object.keys(zip.files).length, failedSlides };
    }
    try {
      const blob = await captureSlideAsPngBlob(nodes[i]!, {
        fontEmbedCSS,
        imageCache,
        slideIndex: i,
      });
      zip.file(`slide-${String(i + 1).padStart(2, "0")}.png`, blob);
    } catch (slideErr) {
      console.error(`Carousel export failed for slide ${i + 1}`, slideErr);
      failedSlides.push(i + 1);
    }
  }

  const fileCount = Object.keys(zip.files).length;
  if (fileCount === 0) {
    throw new Error(
      failedSlides.length > 0
        ? `Timed out exporting slide ${failedSlides[0]}`
        : "Failed to capture slide as image"
    );
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  if (args.isCancelled?.()) {
    return { fileCount, failedSlides };
  }
  saveAs(zipBlob, args.zipName.endsWith(".zip") ? args.zipName : `${args.zipName}.zip`);
  return { fileCount, failedSlides };
}
