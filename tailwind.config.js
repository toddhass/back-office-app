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
      // References keyframes already defined globally in index.css (used
      // by every existing inline-style modal/banner) - not redefined here,
      // so both styling approaches share literally the same motion, not
      // just visually similar timings.
      animation: {
        "backdrop-fade": "backdropFadeIn 0.15s ease-out",
        "modal-pop": "modalPopIn 0.25s ease-out",
        "banner-slide": "bannerSlideIn 0.25s ease-out",
        spin: "spin 1s linear infinite",
      },
    },
  },
  plugins: [],
  // These utility names never appear as actual classNames anywhere in the
  // app - they get generated anyway because Tailwind's scanner is regex-
  // based, not a real parser, and matches these words wherever they appear
  // in the file at all: "table" in Supabase query configs
  // ({ table: "invoices" }), "filter"/"resize" as Array methods and inline
  // style values, "underline" in an inline textDecoration value, "block" in
  // code comments, etc. Confirmed via a real audit (grepped every one
  // individually against actual className usage) before blocking them -
  // this isn't a guess, every entry here was verified to have zero real
  // usage. Small savings (a few hundred bytes), but free and exact.
  blocklist: ["table", "resize", "underline", "visible", "hidden", "inline", "block", "filter", "transform"],
};
