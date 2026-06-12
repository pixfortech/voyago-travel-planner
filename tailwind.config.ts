import type { Config } from 'tailwindcss'

const config: Config = {
  // Prepared for Phase 1 dark mode. No `.dark` class is applied anywhere yet,
  // so enabling this has no visual effect in Phase 0.
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Teal scale — primary brand colour.
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Warm stone palette — Claude Design accent.
        warm: {
          50:  '#F8F5EF',
          100: '#F0EBE1',
          200: '#E2D9CC',
          300: '#CFC3B2',
          400: '#B5A693',
          500: '#9A8878',
          600: '#7A6B5D',
          700: '#5E5148',
          800: '#453B34',
          900: '#2E2720',
        },
        // Semantic design tokens — backed by CSS variables for layout switching.
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        border: 'var(--border)',
        accent: 'var(--accent)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'card': '0.875rem',
      },
    },
  },
  plugins: [],
}

export default config
