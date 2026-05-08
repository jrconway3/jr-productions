// tailwind.config.js
import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import aspectRatio from "@tailwindcss/aspect-ratio";

const config = {
  plugins: [forms, typography, aspectRatio],
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        site: {
          bg: "#071a0f",
          surface: "#0d2b1a",
          text: "#86efac",
          muted: "#4a7a60",
        },
        lpc: {
          accent: "#4ade80",
          accentLight: "#86efac",
          accentDark: "#166534",
          highlight: "#22c55e",
        },
        fe: {
          accent: "#fbbf24",
          accentLight: "#fde68a",
          accentDark: "#92400e",
          highlight: "#f59e0b",
        },
      },
      fontFamily: {
        pixel: ['"Commodore 64"', 'monospace'],
        body: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
};

export default config;
