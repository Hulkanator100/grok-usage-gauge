import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so `vite preview` / a local static host work from any folder.
  base: "./",
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
});
