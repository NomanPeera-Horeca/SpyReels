/**
 * Test-only page for browser tests of single onboarding components.
 * Not part of the app build (the app's Vite root is client/).
 */
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";

const repo = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.join(repo, "client", "src"),
      "@shared": path.join(repo, "shared"),
      "@assets": path.join(repo, "attached_assets"),
    },
  },
  server: { port: 5199, strictPort: true, fs: { allow: [repo] } },
});
