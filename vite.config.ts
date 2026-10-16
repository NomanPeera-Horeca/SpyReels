import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import posthogRollup from "@posthog/rollup-plugin";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { parseDiscoveryV1Enabled } from "./shared/discoveryFeatureFlag";
import {
  SPA_NAVIGATE_FALLBACK,
  SPA_NAVIGATE_FALLBACK_DENYLIST,
} from "./shared/spaNavigateFallback";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

const SPYREELS_PWA_ICON_192 = "/pwa/icon-192.png";
const SPYREELS_PWA_ICON_512 = "/pwa/icon-512.png";

const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  vitePluginManusRuntime(),
  vitePluginManusDebugCollector(),
  VitePWA({
    registerType: "autoUpdate",
    includeAssets: [],
    manifest: {
      name: "SpyReels",
      short_name: "SpyReels",
      description:
        "Plan 30 days of Reels, write scripts with AI Personal Brand Coach, and film with the teleprompter on the go.",
      theme_color: "#7c3aed",
      background_color: "#121218",
      display: "standalone",
      orientation: "portrait-primary",
      scope: "/",
      start_url: "/plan",
      categories: ["productivity", "social"],
      icons: [
        {
          src: SPYREELS_PWA_ICON_192,
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: SPYREELS_PWA_ICON_512,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: SPYREELS_PWA_ICON_512,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      navigateFallback: SPA_NAVIGATE_FALLBACK,
      navigateFallbackDenylist: SPA_NAVIGATE_FALLBACK_DENYLIST,
      globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-cache",
            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "gstatic-fonts-cache",
            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
          },
        },
      ],
    },
    devOptions: {
      enabled: false,
    },
  }),
];

const discoveryV1EnabledForClient = parseDiscoveryV1Enabled(
  process.env.DISCOVERY_V1_ENABLED ?? process.env.VITE_DISCOVERY_V1_ENABLED,
  process.env.NODE_ENV
);

/**
 * PostHog sourcemap upload must not fail the production build.
 * Render deploys were blocked when PostHog CLI returned API server_error.
 */
function withNonFatalPosthogUpload(plugin: Plugin): Plugin {
  const writeBundle = plugin.writeBundle;
  if (!writeBundle) return plugin;

  const wrap = (fn: (...args: unknown[]) => unknown) =>
    async (...args: unknown[]) => {
      try {
        await fn(...args);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[posthog-rollup-plugin] Sourcemap upload failed (continuing build): ${message}`
        );
      }
    };

  if (typeof writeBundle === "function") {
    return { ...plugin, writeBundle: wrap(writeBundle as (...args: unknown[]) => unknown) };
  }

  const handler = writeBundle.handler;
  if (typeof handler !== "function") return plugin;

  return {
    ...plugin,
    writeBundle: {
      ...writeBundle,
      handler: wrap(handler as (...args: unknown[]) => unknown),
    },
  };
}

export default defineConfig(({ mode }) => {
  const buildPlugins = [...plugins];
  if (
    mode === "production" &&
    process.env.POSTHOG_API_KEY &&
    process.env.POSTHOG_PROJECT_ID
  ) {
    buildPlugins.push(
      withNonFatalPosthogUpload(
        posthogRollup({
          personalApiKey: process.env.POSTHOG_API_KEY,
          projectId: process.env.POSTHOG_PROJECT_ID,
          host:
            process.env.POSTHOG_HOST ??
            process.env.VITE_PUBLIC_POSTHOG_HOST ??
            "https://us.i.posthog.com",
          sourcemaps: {
            enabled: true,
            releaseName: "spyreels",
            deleteAfterUpload: true,
          },
        }) as Plugin
      )
    );
  }

  return {
  plugins: buildPlugins,
  define: {
    __DISCOVERY_V1_ENABLED__: discoveryV1EnabledForClient,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**']
  },
};
});
