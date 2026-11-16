/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FAF7F2",
        surface: "#FFFFFF",
        ink: "#151412",
        ink2: "#3D3A35",
        muted: "#8A8175",
        line: "#E9E2D8",
        "line-strong": "#DBD2C4",
        accent: "#C2441D",
        "accent-soft": "#FBEDE4",
        success: "#2F6B4F",
        "success-soft": "#EAF3EE",
        warn: "#B54708",
        "warn-soft": "#FDF3E2",
        danger: "#A32119",
        "danger-soft": "#FBEDEB",
        night: "#12110F",
        "night-line": "#2A2824",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "Urdu Nastaliq",
          "Jameel Noori Nastaliq",
          "Arabic Typesetting",
          "Microsoft Arabic",
          "Simsun",
          "sans-serif",
        ],
        display: [
          "var(--font-display)",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
      },
      boxShadow: {
        lift: "0 18px 40px -24px rgba(21, 20, 18, 0.45)",
        sheet: "0 -24px 60px -28px rgba(21, 20, 18, 0.4)",
        pill: "0 12px 28px -14px rgba(21, 20, 18, 0.55)",
      },
      keyframes: {
        "sheet-up": {
          from: { transform: "translateY(24px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "sheet-up": "sheet-up 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 180ms ease-out",
      },
    },
  },
  plugins: [],
};
