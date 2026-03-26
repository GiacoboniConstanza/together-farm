import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        pastel: {
          cream: "#F3F5FA",
          peach: "#CFDEF6",
          pink: "#ACA0DC",
          mint: "#91D9AE",
          sky: "#7EBAE8",
          yellow: "#F2F8D0",
          lavender: "#D2C2F4",
        },
        ui: {
          border: "#4a3737",
          ink: "rgb(90 81 76)",
        },
      },
      fontFamily: {
        display: ["Fredoka", "Nunito", "system-ui", "sans-serif"],
        sans: ["Nunito", "system-ui", "sans-serif"],
      },
      boxShadow: {
        sticker: "4px 4px 0 0 #4a3737",
        "sticker-sm": "2px 2px 0 0 #4a3737",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [forms],
};
