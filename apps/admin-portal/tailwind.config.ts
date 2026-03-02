import type { Config } from 'tailwindcss';
import logicalPlugin from 'tailwindcss-logical';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-sidebar': '#111827',
        'brand-bg': '#F9FAFB',
        'brand-green': '#1B4332',
        'brand-red': '#E63946',
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'sans-serif'],
        arabic: ['var(--font-marzouk)', 'sans-serif'],
      },
    },
  },
  plugins: [logicalPlugin],
};

export default config;
