import type { Express, Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { localObjectStorageDir, resolveLocalObjectPath } from "../storage";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

const STATIC_ALLOWED_HOST_SUFFIXES = [
  ".r2.dev",
  ".blob.core.windows.net",
  "images.pexels.com",
  "images.pixabay.com",
  "cdn.pixabay.com",
  "i.imgur.com",
] as const;

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  // Block obvious IPv4 private / link-local ranges.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (isPrivateHostname(host)) return false;

  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL?.trim();
  if (publicBase) {
    try {
      const baseHost = new URL(publicBase).hostname.toLowerCase();
      if (host === baseHost) return true;
    } catch {
      // ignore malformed env
    }
  }

  for (const suffix of STATIC_ALLOWED_HOST_SUFFIXES) {
    if (suffix.startsWith(".")) {
      if (host === suffix.slice(1) || host.endsWith(suffix)) return true;
    } else if (host === suffix) {
      return true;
    }
  }
  return false;
}

/**
 * Same-origin image proxy for carousel PNG/ZIP export.
 * Bypasses CDN/R2 CORS gaps that make html-to-image hang on CSS backgrounds.
 */
export function registerCarouselExportImageProxy(app: Express): void {
  app.get(
    "/api/carousel/export-image",
    async (req: Request, res: Response): Promise<void> => {
      try {
        await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      const raw = typeof req.query.url === "string" ? req.query.url.trim() : "";
      if (!raw || raw.length > 2048) {
        res.status(400).json({ error: "invalid_url" });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        res.status(400).json({ error: "invalid_url" });
        return;
      }

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        res.status(400).json({ error: "invalid_protocol" });
        return;
      }

      const localDir = localObjectStorageDir();
      if (localDir && parsed.pathname.startsWith("/local-uploads/")) {
        const key = decodeURIComponent(
          parsed.pathname.slice("/local-uploads/".length)
        );
        try {
          const abs = resolveLocalObjectPath(key);
          const bytes = await readFile(abs);
          const ext = path.extname(abs).toLowerCase();
          const contentType =
            ext === ".png"
              ? "image/png"
              : ext === ".webp"
                ? "image/webp"
                : ext === ".gif"
                  ? "image/gif"
                  : "image/jpeg";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "private, max-age=300");
          res.send(bytes);
        } catch {
          res.status(404).json({ error: "local_object_missing" });
        }
        return;
      }

      if (!isAllowedImageHost(parsed.hostname)) {
        res.status(403).json({ error: "host_not_allowed" });
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const upstream = await fetch(parsed.toString(), {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            Accept: "image/*,*/*;q=0.8",
            "User-Agent": "SpyReelsCarouselExport/1.0",
          },
        });
        if (!upstream.ok) {
          res.status(502).json({ error: "upstream_failed", status: upstream.status });
          return;
        }

        const contentType = (
          upstream.headers.get("content-type") || "application/octet-stream"
        ).split(";")[0].trim();
        if (!contentType.startsWith("image/")) {
          res.status(502).json({ error: "not_an_image" });
          return;
        }

        const lengthHeader = upstream.headers.get("content-length");
        if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
          res.status(413).json({ error: "too_large" });
          return;
        }

        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (bytes.length === 0) {
          res.status(502).json({ error: "empty" });
          return;
        }
        if (bytes.length > MAX_BYTES) {
          res.status(413).json({ error: "too_large" });
          return;
        }

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
        res.send(bytes);
      } catch (err) {
        const aborted =
          err instanceof Error &&
          (err.name === "AbortError" || /aborted/i.test(err.message));
        console.warn(
          "[carousel/export-image]",
          aborted ? "timeout" : err instanceof Error ? err.message : err
        );
        res.status(aborted ? 504 : 502).json({
          error: aborted ? "timeout" : "fetch_failed",
        });
      } finally {
        clearTimeout(timer);
      }
    }
  );
}
