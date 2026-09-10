import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 1px 2px rgba(15, 23, 42, .04), 0 8px 24px rgba(15, 23, 42, .05)',
      },
      colors: {
        ink: '#122033',
        navy: '#173A5E',
        teal: '#007C78',
        mist: '#F4F7FA',
      },
    },
  },
  plugins: [],
} satisfies Config
