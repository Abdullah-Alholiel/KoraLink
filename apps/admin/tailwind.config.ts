import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefbf4',
          100: '#d7f5e4',
          500: '#0f9d58',
          600: '#0b7d46',
          700: '#0a6338',
          900: '#0a3d24',
        },
      },
    },
  },
  plugins: [],
};

export default config;
