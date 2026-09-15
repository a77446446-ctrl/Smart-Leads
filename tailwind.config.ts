import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        secondary: "#ffffff",
        accent: "rgb(var(--accent-rgb, 228 255 0) / <alpha-value>)",
      },
      boxShadow: {
        "accent-glow": "0 0 20px rgb(var(--accent-rgb, 228 255 0) / 0.2)",
      },
    },
  },
  plugins: [],
};
export default config;
