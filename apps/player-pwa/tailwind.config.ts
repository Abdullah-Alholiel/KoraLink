import type { Config } from 'tailwindcss';
import logicalPlugin from 'tailwindcss-logical';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-green': '#00C853',
        'brand-red': '#D50000',
        'brand-black': '#0A0A0A',
        'brand-bg': '#F5F5F5',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'Noto Kufi Arabic', 'sans-serif'],
      },
    },
  },
  plugins: [logicalPlugin],
};

export default config;
