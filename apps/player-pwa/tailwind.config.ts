import type { Config } from 'tailwindcss';
import logicalPlugin from 'tailwindcss-logical';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-green': '#1B4332',
        'brand-green-light': '#2D6A4F',
        'brand-red': '#E63946',
        'brand-black': '#111827',
        'brand-bg': '#F9FAFB',
        'brand-gray': '#6B7280',
        'brand-border': '#E5E7EB',
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-tajawal)', 'Noto Kufi Arabic', 'sans-serif'],
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom, 0px)',
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-start': 'env(safe-area-inset-left, 0px)',
        'safe-end': 'env(safe-area-inset-right, 0px)',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
        'card-hover':
          '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        nav: '0 -1px 3px 0 rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [
    logicalPlugin,
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.pb-safe': {
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        },
        '.pt-safe': {
          paddingTop: 'env(safe-area-inset-top, 0px)',
        },
        '.ps-safe': {
          paddingInlineStart: 'env(safe-area-inset-left, 0px)',
        },
        '.pe-safe': {
          paddingInlineEnd: 'env(safe-area-inset-right, 0px)',
        },
        '.mb-safe': {
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        },
        '.h-screen-safe': {
          height: [
            'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
            'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          ] as unknown as string,
        },
      });
    }),
  ],
};

export default config;
