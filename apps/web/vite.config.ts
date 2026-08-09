import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
    strictPort: true
  }
});
