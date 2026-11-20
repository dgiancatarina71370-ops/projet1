/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { hub: { bg: '#0a1120', panel: '#101a2e', line: '#223250', fg: '#dde7f6', muted: '#8c9dba', accent: '#68a8ff', ok: '#4cc38a', bad: '#ef6f78' } },
    },
  },
  plugins: [],
};
