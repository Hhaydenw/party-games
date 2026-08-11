import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a1a2e",
        panel: "#16213e",
        accent: "#e94560",
        gold: "#f2b705",
      },
      fontFamily: {
        display: ["'Baloo 2'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
