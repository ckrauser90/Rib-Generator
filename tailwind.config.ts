import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        // Light mode — warm cream palette
        cream: {
          50: "#FFFDF9",
          100: "#FFF9F0",
          200: "#F5EBE0",
          300: "#E8D5C4",
        },
        sand: {
          400: "#C9B8A3",
          500: "#8B7B6B",
        },
        brown: {
          600: "#6F6157",
          700: "#5C4D40",
          800: "#2F241B",
        },
        terracotta: {
          100: "#F5E6DC",
          400: "#D7814C",
          500: "#A2512B",
          600: "#8B4722",
        },
        // Dark mode
        night: {
          700: "#332B23",
          800: "#252019",
          900: "#1A1512",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        serif: ["Georgia", "Times New Roman", "serif"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "1.4" }],
        sm: ["14px", { lineHeight: "1.5" }],
        base: ["16px", { lineHeight: "1.6" }],
        lg: ["18px", { lineHeight: "1.5", fontWeight: "500" }],
        xl: ["20px", { lineHeight: "1.4", fontWeight: "600" }],
        "2xl": ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        "3xl": ["30px", { lineHeight: "1.2", fontWeight: "600" }],
        "4xl": ["36px", { lineHeight: "1.1", fontWeight: "700" }],
      },
      spacing: {
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "24px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(47, 36, 27, 0.04)",
        md: "0 4px 12px rgba(47, 36, 27, 0.08)",
        lg: "0 16px 40px rgba(47, 36, 27, 0.12)",
        xl: "0 32px 64px rgba(47, 36, 27, 0.16)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;