import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerResendWebhookRoutes } from "../resendWebhook";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { createExtensionRouter } from "../extensionApi";
import { handleTelegramUpdate, setupTelegramWebhook } from "../telegramBot";
import { startCollectedReelIngestSweeper } from "../collectedReelWorker";
import { startTranscriptionZombieSweeper } from "../transcriptionSweeper";
import { startScrapeJobZombieSweeper } from "../scrapeJobSweeper";
import { registerPublicScriptShareRoutes } from "../publicScriptShareRoute";
import { registerAiStudioRoutes } from "../aiStudio/restRoutes";
import { BLOG_SLUG_REDIRECTS } from "@shared/blogRedirects";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use((req, res, next) => {
    const rawHost = (
      req.headers["x-forwarded-host"] ||
      req.headers.host ||
      ""
    )
      .toString()
      .split(",")[0]
      ?.trim()
      .toLowerCase();
    const host = rawHost?.replace(/:\d+$/, "") ?? "";
    if (host === "www.spyreels.ai") {
      const pathAndQuery = req.originalUrl || "/";
      return res.redirect(301, `https://spyreels.ai${pathAndQuery}`);
    }
    next();
  });

  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const { constructWebhookEvent, handleWebhookEvent } = await import("../stripe/stripe-service");
      const sig = req.headers["stripe-signature"] as string;
      if (!sig) return res.status(400).json({ error: "Missing stripe-signature header" });

      const event = constructWebhookEvent(req.body, sig);

      if (event.id.startsWith("evt_test_")) {
        console.log("[Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      console.log(`[Stripe Webhook] Processing: ${event.type} (${event.id})`);
      await handleWebhookEvent(event);
      res.json({ received: true });
    } catch (err: any) {
      console.error(`[Stripe Webhook] Error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  });

  registerResendWebhookRoutes(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use("/api/extension", createExtensionRouter());
  app.use("/api/ext", createExtensionRouter());
  registerAiStudioRoutes(app);

  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      await handleTelegramUpdate(req.body);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[Telegram Webhook] Error:", err.message);
      res.json({ ok: true });
    }
  });
  app.get("/hooks", (_req, res) => {
    res.redirect(301, "/free-tools/viral-hooks");
  });
  app.get("/features/tiktok-viral-video-finder", (_req, res) => {
    res.redirect(301, "/free-tools/tiktok-viral-video-finder");
  });
  app.get("/features/youtube-shorts-viral-finder", (_req, res) => {
    res.redirect(301, "/free-tools/youtube-shorts-viral-finder");
  });

  for (const [fromSlug, toSlug] of Object.entries(BLOG_SLUG_REDIRECTS)) {
    app.get(`/blog/${fromSlug}`, (_req, res) => {
      res.redirect(301, `https://spyreels.ai/blog/${toSlug}`);
    });
  }

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      [
        "User-agent: GPTBot",
        "Allow: /",
        "",
        "User-agent: Bingbot",
        "Allow: /",
        "",
        "User-agent: ClaudeBot",
        "Allow: /",
        "",
        "User-agent: anthropic-ai",
        "Allow: /",
        "",
        "User-agent: PerplexityBot",
        "Allow: /",
        "",
        "User-agent: Google-Extended",
        "Allow: /",
        "",
        "User-agent: CCBot",
        "Allow: /",
        "",
        "User-agent: Bytespider",
        "Allow: /",
        "",
        "User-agent: FacebookBot",
        "Allow: /",
        "",
        "User-agent: *",
        "Allow: /",
        "Allow: /blog",
        "Allow: /blog/*",
        "Allow: /terms",
        "Allow: /privacy",
        "Allow: /pricing",
        "Allow: /affiliate",
        "Allow: /contact",
        "Allow: /about",
        "Allow: /free-tools",
        "Allow: /free-tools/*",
        "Allow: /features",
        "Allow: /features/*",
        "Allow: /llms.txt",
        "Disallow: /api/",
        "Disallow: /dashboard",
        "Disallow: /saved",
        "Disallow: /scripts",
        "Disallow: /search",
        "Disallow: /history",
        "Disallow: /settings",
        "Disallow: /billing",
        "Disallow: /studio",
        "Disallow: /ai-studio",
        "Disallow: /plan",
        "Disallow: /collected",
        "Disallow: /onboarding",
        "Disallow: /admin",
        "Disallow: /research",
        "Disallow: /scraping",
        "Disallow: /tiktok-scraping",
        "Disallow: /youtube-scraping",
        "Disallow: /discovery",
        "Disallow: /carousel-library",
        "Disallow: /broll-library",
        "Disallow: /my-virality-report",
        "Disallow: /workspace",
        "Disallow: /dev",
        "",
        "Sitemap: https://spyreels.ai/sitemap.xml",
      ].join("\n")
    );
  });

  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const { getPublishedIndexableBlogPosts } = await import("../db");
      const posts = await getPublishedIndexableBlogPosts();
      const baseUrl = "https://spyreels.ai";
      const now = new Date().toISOString().split("T")[0];

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "weekly" },
        { loc: "/extension", priority: "0.8", changefreq: "monthly" },
        { loc: "/free-tools", priority: "0.8", changefreq: "weekly" },
        { loc: "/free-tools/viral-hooks", priority: "0.9", changefreq: "weekly" },
        { loc: "/free-tools/broll-generator", priority: "0.9", changefreq: "weekly" },
        { loc: "/free-tools/tiktok-viral-video-finder", priority: "0.9", changefreq: "weekly" },
        { loc: "/free-tools/youtube-shorts-viral-finder", priority: "0.9", changefreq: "weekly" },
        { loc: "/features/viral-reel-finder", priority: "0.8", changefreq: "weekly" },
        { loc: "/features/30-day-content-plan", priority: "0.8", changefreq: "weekly" },
        { loc: "/features/ai-personal-brand-coach", priority: "0.8", changefreq: "weekly" },
        { loc: "/pricing", priority: "0.8", changefreq: "monthly" },
        { loc: "/blog", priority: "0.8", changefreq: "daily" },
        { loc: "/affiliate", priority: "0.6", changefreq: "monthly" },
        { loc: "/contact", priority: "0.5", changefreq: "monthly" },
        { loc: "/about", priority: "0.6", changefreq: "monthly" },
        { loc: "/terms", priority: "0.3", changefreq: "yearly" },
        { loc: "/privacy", priority: "0.3", changefreq: "yearly" },
      ];
      for (const page of staticPages) {
        xml += `  <url>\n    <loc>${baseUrl}${page.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>\n`;
      }
      for (const post of posts) {
        const lastmod = post.updatedAt ? new Date(post.updatedAt).toISOString().split("T")[0] : now;
        xml += `  <url>\n    <loc>${baseUrl}/blog/${post.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err) {
      console.error("[Sitemap] Error:", err);
      res.status(500).send("Error generating sitemap");
    }
  });

  registerPublicScriptShareRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    startTranscriptionZombieSweeper();
    startCollectedReelIngestSweeper();
    startScrapeJobZombieSweeper();

    if (process.env.NODE_ENV === "production") {
      setupTelegramWebhook("https://spyreels.ai").catch((err) => {
        console.error("[Telegram] Webhook setup failed:", err);
      });
    }
  });
}

startServer().catch(console.error);
