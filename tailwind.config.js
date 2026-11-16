/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        // Brand: Noto Sans (full Vietnamese coverage) for all UI text.
        sans: ['"Noto Sans"', 'Inter', 'system-ui', 'sans-serif'],
        // Editorial italic accent for Sóng landing headlines ("Escape the *ordinary*" style); Playfair Display has a Vietnamese subset.
        accent: ['"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
