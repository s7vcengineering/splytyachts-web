import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#e6f4ff",
          100: "#cce8ff",
          200: "#99d1ff",
          300: "#66baff",
          400: "#33a3ff",
          500: "#2196F3",
          600: "#0D47A1",
          700: "#0F1923",
          800: "#0C1420",
          900: "#0A1628",
          950: "#060E1A",
        },
      },
    },
  },
  plugins: [forms],
};

export default config;
