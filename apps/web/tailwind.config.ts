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
      // Hebrew-first font stack
      fontFamily: {
        sans: ["var(--font-heebo)", "Heebo", "Assistant", "system-ui", "sans-serif"],
        hebrew: ["var(--font-heebo)", "Heebo", "Assistant", "sans-serif"],
      },
      colors: {
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
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
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
