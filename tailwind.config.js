/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        "space-900": "#05070f",
        "space-800": "#0f1424",
        "space-700": "#17213d",
        "accent-blue": "#5a7bff",
        "accent-purple": "#d665ff"
      },
      fontFamily: {
        sans: ["'Segoe UI'", "Roboto", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 45px rgba(120, 158, 255, 0.45)",
        panel: "0 18px 48px rgba(3,6,16,0.4)"
      }
    }
  },
  plugins: []
};
