/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F4F6F9",
        surface: "#FFFFFF",
        "surface-alt": "#F1F4F8",
        "input-bg": "#F9FAFB",
        border: "#E2E6ED",
        "border-strong": "#D6DCE5",
        ink: "#16202E",
        slate: "#64748B",
        accent: "#1E5B8C",
        "accent-bg": "#E7F0FA",
        "accent-border": "#BFDCF0",
        danger: "#B23B3B",
        "danger-bg": "#FDECEC",
        "danger-border": "#F3B8B8",
        good: "#2F7A54",
        "good-bg": "#E6F4EC",
        "good-border": "#BFE3D0",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
