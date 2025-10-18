import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "tank-empty.svg",
        "tank-full.svg",
        "tanks-empty.svg",
        "tanks-full.svg",
        "og-image.png",
        "og-image-square.png",
      ],
      manifest: {
        name: "Synth Scuba - Gas Blender & Tank Calculator",
        short_name: "Synth Scuba",
        description:
          "Free web-based gas blender and tank calculator for scuba diving. Calculate nitrox and trimix blending steps, tank specifications, and buoyancy.",
        theme_color: "#1a1a1a",
        background_color: "#242424",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        categories: ["sports", "utilities"],
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,txt,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  base: "",
});
