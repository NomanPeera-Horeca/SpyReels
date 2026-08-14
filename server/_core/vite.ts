import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import { enrichSpaHtmlForPublicPath } from "../blogPageHtml";
import { getBlogPostBySlug } from "../db";

/** PostHog replay loads CSS/JS from our origin inside an iframe on these hosts. */
const POSTHOG_REPLAY_ORIGINS = new Set([
  "https://us.posthog.com",
  "https://eu.posthog.com",
]);

function applyPostHogReplayCors(req: Request, res: Response): void {
  const origin = req.headers.origin;
  if (!origin || !POSTHOG_REPLAY_ORIGINS.has(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
}

function postHogReplayAssetCorsMiddleware(
  req: Request,
  res: Response,
  next: () => void
): void {
  if (!req.path.startsWith("/assets/")) {
    next();
    return;
  }
  applyPostHogReplayCors(req, res);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.status(204).end();
    return;
  }
  next();
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    configFile: path.resolve(import.meta.dirname, "../../vite.config.ts"),
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      let page = await vite.transformIndexHtml(url, template);
      const enriched = await enrichSpaHtmlForPublicPath(
        page,
        req.originalUrl,
        getBlogPostBySlug
      );
      res
        .status(enriched.status)
        .set({ "Content-Type": "text/html" })
        .end(enriched.html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  const htmlNoCacheHeaders = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  // SPA shell routes: always revalidate so browsers pick up the latest chunk manifest
  app.use((req, res, next) => {
    if (req.path === "/" || !req.path.includes(".")) {
      res.setHeader("Cache-Control", htmlNoCacheHeaders["Cache-Control"]);
      res.setHeader("Pragma", htmlNoCacheHeaders.Pragma);
      res.setHeader("Expires", htmlNoCacheHeaders.Expires);
    }
    next();
  });

  app.use(postHogReplayAssetCorsMiddleware);

  // index: false so "/" falls through to the SPA handler and gets SEO meta injection
  app.use(
    express.static(distPath, {
      index: false,
      maxAge: "1y",
      setHeaders(res, filePath) {
        if (filePath.endsWith(`${path.sep}index.html`)) {
          res.setHeader("Cache-Control", htmlNoCacheHeaders["Cache-Control"]);
          res.setHeader("Pragma", htmlNoCacheHeaders.Pragma);
          res.setHeader("Expires", htmlNoCacheHeaders.Expires);
          return;
        }
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );

  const indexPath = path.resolve(distPath, "index.html");
  let cachedIndexHtml: string | null = null;

  async function readIndexHtml(): Promise<string> {
    if (!cachedIndexHtml) {
      cachedIndexHtml = await fs.promises.readFile(indexPath, "utf-8");
    }
    return cachedIndexHtml;
  }

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req: Request, res: Response) => {
    try {
      let html = await readIndexHtml();
      const enriched = await enrichSpaHtmlForPublicPath(
        html,
        req.originalUrl,
        getBlogPostBySlug
      );
      res
        .status(enriched.status)
        .set({ "Content-Type": "text/html", ...htmlNoCacheHeaders })
        .end(enriched.html);
    } catch (err) {
      console.error("[SPA] Failed to serve index.html:", err);
      res.set(htmlNoCacheHeaders);
      res.sendFile(indexPath);
    }
  });
}
