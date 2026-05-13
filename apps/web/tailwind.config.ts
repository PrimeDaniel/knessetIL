import type { Config } from "tailwindcss";
import rtl from "tailwindcss-rtl";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:   ["var(--font-heebo)", "Heebo",            "Assistant",      "system-ui", "sans-serif"],
        serif:  ["var(--font-serif)", "Noto Serif Hebrew", "Georgia",        "serif"],
        mono:   ["var(--font-mono)",  "IBM Plex Mono",    "JetBrains Mono", "Menlo",     "monospace"],
        hebrew: ["var(--font-heebo)", "Heebo",            "Assistant",      "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand palette: civic blue + warm neutral
        brand: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        // Vote decision colors (semantic)
        vote: {
          for:     "#16a34a",  // green-600
          against: "#dc2626",  // red-600
          abstain: "#d97706",  // amber-600
          absent:  "#9ca3af",  // gray-400
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "fade-in":    "fadeIn 0.3s ease-in-out",
        "slide-up":   "slideUp 0.3s ease-out",
        "fade-up":    "fadeUp 600ms cubic-bezier(.2,.7,.2,1) both",
        "seat-pop":   "seatPop 600ms cubic-bezier(.2,1.4,.4,1) both",
        "bar-grow":   "barGrow 700ms cubic-bezier(.2,.7,.2,1) 250ms both",
        shimmer:      "shimmer 1.8s ease-in-out infinite",
        "modal-in":   "modalIn 0.35s cubic-bezier(0.2,0.8,0.2,1) both",
        "backdrop-in":"backdropIn 0.25s ease-out both",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        modalIn: {
          "0%":   { opacity: "0", transform: "translateY(24px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        backdropIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)",   opacity: "1" },
        },
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        seatPop: {
          "0%":   { opacity: "0", transform: "scale(0)" },
          "60%":  { opacity: "1", transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        barGrow: {
          "0%":   { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        shimmer: {
          "0%":   { transform: "translateX(100%)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
    },
  },
  plugins: [
    rtl,
    require("@tailwindcss/typography"),
  ],
};

export default config;
