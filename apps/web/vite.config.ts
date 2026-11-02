import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const pwaBase = process.env.GITHUB_PAGES === "true" ? "/AppTreino/" : "/";

const apiProxy: ProxyOptions = {
  target: "http://127.0.0.1:3333",
  changeOrigin: true,
  timeout: 0,
  configure(proxy) {
    proxy.on("proxyReq", (proxyReq, req) => {
      // Keep CORS stable when Expo/WebView uses a shifting LAN IP.
      proxyReq.setHeader("origin", "http://localhost:5174");
      const range = req.headers.range;
      if (range) proxyReq.setHeader("range", range);
    });
  }
};

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/AppTreino/" : "/",
  envDir: "../..",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["assets/atlly-mark.png", "pwa/apple-touch-icon.png"],
      manifest: {
        id: pwaBase,
        name: "ATLLY — Human Performance System",
        short_name: "ATLLY",
        description: "Treino, corrida, performance e comunidade de atletas.",
        lang: "pt-BR",
        dir: "ltr",
        start_url: `${pwaBase}?source=pwa`,
        scope: pwaBase,
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait-primary",
        theme_color: "#09090b",
        background_color: "#09090b",
        categories: ["health", "fitness", "sports"],
        icons: [
          {
            src: `${pwaBase}pwa/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: `${pwaBase}pwa/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: `${pwaBase}pwa/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: `${pwaBase}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: {
              cacheName: "atlly-static-assets",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react-vendor";
        }
      }
    }
  },
  server: {
    port: 5174,
    strictPort: true,
    host: true,
    proxy: {
      "/uploads": apiProxy,
      "/auth": apiProxy,
      "/user": apiProxy,
      "/admin": apiProxy,
      "/student": apiProxy,
      "/checkout": apiProxy,
      "/media": apiProxy,
      "/me": apiProxy,
      "/health": apiProxy,
      "/plans": apiProxy,
      "/public": apiProxy,
      "/org": apiProxy,
      // Não proxyar GET /coach — é rota do React; só subpaths da API.
      "/coach/affiliate": apiProxy,
      "/coach/managed-athletes": apiProxy,
      "/socket.io": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
        ws: true
      }
    }
  }
});
