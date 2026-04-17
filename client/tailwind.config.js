/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design token surface palette
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          raised: 'hsl(var(--surface-raised))',
          overlay: 'hsl(var(--surface-overlay))',
        },
        border: 'hsl(var(--border))',
        // Status semantic colours
        status: {
          healthy: '#22c55e',
          degraded: '#f59e0b',
          down: '#ef4444',
        },
        severity: {
          critical: '#ef4444',
          warning: '#f59e0b',
          info: '#3b82f6',
        },
      },
      keyframes: {
        'slide-in-top': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'highlight-new': {
          '0%': { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
          '100%': { backgroundColor: 'transparent' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'slide-in-top': 'slide-in-top 0.2s ease-out',
        'highlight-new': 'highlight-new 2s ease-out forwards',
        pulse: 'pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
