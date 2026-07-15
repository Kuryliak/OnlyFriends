import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#07090e",
          raised: "#0e1219",
          overlay: "#161c28",
          elevated: "#1c2433",
        },
        border: {
          DEFAULT: "#232b3a",
          subtle: "#1a2130",
          glow: "rgba(255,255,255,0.06)",
        },
        accent: {
          DEFAULT: "#f06b5a",
          muted: "#d45547",
          soft: "rgba(240, 107, 90, 0.12)",
          glow: "rgba(240, 107, 90, 0.18)",
        },
        text: {
          primary: "#f3f5f9",
          secondary: "#9aa3b5",
          muted: "#5f6b80",
        },
        status: {
          active: "#34d399",
          pending: "#fbbf24",
          error: "#f87171",
          idle: "#64748b",
          success: "#34d399",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.375rem",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 40px rgba(0,0,0,0.45)",
        "card-hover":
          "0 1px 0 rgba(255,255,255,0.06) inset, 0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(240,107,90,0.08)",
        glow: "0 0 48px rgba(240, 107, 90, 0.16)",
        sidebar: "4px 0 24px rgba(0,0,0,0.35)",
        modal: "0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)",
        "btn-primary":
          "0 1px 0 rgba(255,255,255,0.14) inset, 0 6px 20px rgba(240, 107, 90, 0.32)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "accent-shine":
          "linear-gradient(135deg, rgba(240,107,90,0.15) 0%, transparent 50%, rgba(52,211,153,0.06) 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.35s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        shimmer: "shimmer 2.5s ease-in-out infinite",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.65" },
        },
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;