import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "rgb(var(--ink-rgb) / <alpha-value>)",
          soft: "rgb(var(--ink-soft-rgb) / <alpha-value>)",
          panel: "rgb(var(--ink-panel-rgb) / <alpha-value>)",
          elev: "rgb(var(--ink-elev-rgb) / <alpha-value>)"
        },
        sand: {
          DEFAULT: "rgb(var(--sand-rgb) / <alpha-value>)",
          muted: "rgb(var(--sand-muted-rgb) / <alpha-value>)",
          faint: "rgb(var(--sand-faint-rgb) / <alpha-value>)"
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
        panel: "var(--shadow-panel)",
        soft: "var(--shadow-soft)"
      },
      backgroundImage: {
        "hero-grid": "var(--hero-grid)",
        "panel-shine": "var(--panel-shine)"
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
      },
      transitionTimingFunction: {
        theme: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
} satisfies Config;
