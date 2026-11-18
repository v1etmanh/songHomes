/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // The scroll-driven room stage (photo beside the room list) needs ~600px of height once compacted for short windows; smaller screens get the swipe carousel.
        stage: { raw: '(min-width: 1024px) and (min-height: 600px)' },
      },
      fontFamily: {
        // Only the non-Sóng deployments (Consensus/showcase pages) still use Fraunces.
        display: ['Fraunces', 'Georgia', 'serif'],
        // Brand: Noto Sans (full Vietnamese coverage) for all UI text.
        sans: ['"Noto Sans"', 'system-ui', 'sans-serif'],
        // Secondary font for a few Sóng headlines, always italic ("serenity." style); Playfair Display has a Vietnamese subset.
        accent: ['"Playfair Display"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
