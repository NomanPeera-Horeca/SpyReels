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
import { registerPublicScriptShareRoutes } from "../publicScriptShareRoute";

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

  // Stripe webhook MUST be registered BEFORE express.json() for signature verification
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const { constructWebhookEvent, handleWebhookEvent } = await import("../stripe/stripe-service");
      const sig = req.headers["stripe-signature"] as string;
      if (!sig) return res.status(400).json({ error: "Missing stripe-signature header" });

      const event = constructWebhookEvent(req.body, sig);

      // Handle test events
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

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Extension REST API (for Chrome extension)
  app.use("/api/extension", createExtensionRouter());
  app.use("/api/ext", createExtensionRouter());

  // Telegram Bot webhook
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      await handleTelegramUpdate(req.body);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[Telegram Webhook] Error:", err.message);
      res.json({ ok: true }); // Always return 200 to Telegram
    }
  });
  app.get("/hooks", (_req, res) => {
    res.redirect(301, "/free-tools/viral-hooks");
  });

  // SEO: robots.txt
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      `User-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: anthropic-ai\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: CCBot\nAllow: /\n\nUser-agent: Bytespider\nAllow: /\n\nUser-agent: FacebookBot\nAllow: /\n\nUser-agent: *\nAllow: /\nAllow: /blog\nAllow: /blog/*\nAllow: /terms\nAllow: /privacy\nAllow: /pricing\nAllow: /affiliate\nAllow: /contact\nAllow: /about\nAllow: /free-tools\nAllow: /free-tools/*\nAllow: /features\nAllow: /features/*\nAllow: /llms.txt\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /saved\nDisallow: /scripts\nDisallow: /search\nDisallow: /history\nDisallow: /settings\nDisallow: /billing\n\nSitemap: https://spyreels.ai/sitemap.xml`
    );
  });

  // SEO: sitemap.xml
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const { getPublishedBlogPosts } = await import("../db");
      const posts = await getPublishedBlogPosts();
      const baseUrl = "https://spyreels.ai";
      const now = new Date().toISOString().split("T")[0];

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      // Static pages
      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "weekly" },
        { loc: "/free-tools", priority: "0.8", changefreq: "weekly" },
        { loc: "/free-tools/viral-hooks", priority: "0.9", changefreq: "weekly" },
        { loc: "/features/viral-reel-finder", priority: "0.8", changefreq: "weekly" },
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
      // Blog posts
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

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
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

    // Set up Telegram webhook after server starts (non-blocking)
    if (process.env.NODE_ENV === "production") {
      setupTelegramWebhook("https://spyreels.ai").catch((err) => {
        console.error("[Telegram] Webhook setup failed:", err);
      });
    }
  });
}

startServer().catch(console.error);
