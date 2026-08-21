import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "pwa-192x192.png", "pwa-512x512.png"],
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Lía - Hub para PAS",
        short_name: "Lía",
        description:
          "Lía atiende. Vos producís. Hub para productores de seguros.",
        theme_color: "#1a2744",
        background_color: "#f7f3ec",
        display: "standalone",
        start_url: "/",
        lang: "es-AR",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts")) return "charts";
          if (id.includes("pdf-lib")) return "pdf";
          if (id.includes("heic2any")) return "heic";
          if (id.includes("date-fns")) return "date-fns";
          // React + react-router must stay in the same graph as UI libs — splitting
          // them into separate chunks causes "forwardRef of undefined" at runtime.
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@lia/nlu": fileURLToPath(new URL("../../packages/nlu/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    open: true,
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
    proxy: {
      "/api/bot": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/bot/, ""),
      },
    },
  },
});
