import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

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
  plugins: [react()],
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
      "/public": apiProxy
    }
  }
});
