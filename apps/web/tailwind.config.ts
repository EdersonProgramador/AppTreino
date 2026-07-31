import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#08090b",
        surface: "#121614",
        panel: "#171c19",
        brand: {
          gold: "#f2b461",
          coral: "#df663c",
          red: "#be3027",
          green: "#0f8f6d",
          mint: "#69e1ac"
        }
      },
      boxShadow: {
        glow: "0 22px 70px rgba(223, 102, 60, 0.24)",
        panel: "0 24px 70px rgba(0, 0, 0, 0.34)"
      }
    }
  },
  plugins: []
} satisfies Config;
