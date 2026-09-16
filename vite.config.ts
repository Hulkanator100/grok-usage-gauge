import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative locally; GitHub Pages sets BASE_PATH=/grok-usage-gauge/
  base: process.env.BASE_PATH || "./",
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Cursor port-forward hostnames and 127.0.0.1 vs localhost must not 403.
    allowedHosts: true,
    cors: true,
    // Avoid a blocking Vite overlay when Edge hits a forwarded / tunneled host.
    hmr: false,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  optimizeDeps: {
    exclude: ["tesseract.js", "tesseract.js-core"],
  },
});
