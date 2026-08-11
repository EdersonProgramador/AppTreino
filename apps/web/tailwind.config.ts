import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#07080a",
          soft: "#10131a",
          panel: "#151a22",
          elev: "#1c2330"
        },
        sand: {
          DEFAULT: "#f4ebe0",
          muted: "#c9bbaa",
          faint: "#8f8376"
        },
        brand: {
          gold: "#f0b45a",
          amber: "#e89a3a",
          coral: "#e06a3c",
          ember: "#c73d2e",
          mint: "#4fd6a0",
          teal: "#128f72"
        }
      },
      fontFamily: {
        display: ["\"Space Grotesk\"", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["\"Manrope\"", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 24px 80px rgba(224, 106, 60, 0.22)",
        panel: "0 28px 80px rgba(0, 0, 0, 0.42)",
        soft: "0 12px 40px rgba(0, 0, 0, 0.28)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at 20% 20%, rgba(240,180,90,0.18), transparent 38%), radial-gradient(circle at 80% 0%, rgba(224,106,60,0.16), transparent 42%), linear-gradient(160deg, #07080a 0%, #10131a 48%, #0b0f14 100%)",
        "panel-shine":
          "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 40%), linear-gradient(135deg, rgba(240,180,90,0.08), transparent 55%)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.45s ease-out both",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite"
      }
    }
  },
  plugins: []
} satisfies Config;
