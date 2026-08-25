import type { Config } from "tailwindcss";

// Bizzio.online brand: a corporate-appropriate spin on orange + bright pastels —
// the orange is used as an accent (CTAs, active states, highlights), not as a
// wall-to-wall background, so the product reads as professional B2B software
// rather than a consumer app. Neutral slate does the heavy lifting everywhere else.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316", // primary CTA orange
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12"
        },
        pastel: {
          mint:   "#d7f5ec",
          sky:    "#dbeefe",
          lilac:  "#ece3fb",
          peach:  "#ffe8d6",
          lemon:  "#fdf6d8"
        },
        ink: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a"
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"]
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem"
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.08)",
        "card-hover": "0 4px 12px 0 rgb(15 23 42 / 0.10)"
      }
    }
  },
  plugins: []
};
export default config;
