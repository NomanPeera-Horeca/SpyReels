import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { enrichSpaHtmlForPublicPath } from "../blogPageHtml";
import { getBlogPostBySlug } from "../db";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
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
      page = await enrichSpaHtmlForPublicPath(page, req.path, getBlogPostBySlug);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
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

  app.use(express.static(distPath));

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
      html = await enrichSpaHtmlForPublicPath(html, req.path, getBlogPostBySlug);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      console.error("[SPA] Failed to serve index.html:", err);
      res.sendFile(indexPath);
    }
  });
}
