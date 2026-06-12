import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Teal anchor — Voyago Design System values.
        primary: {
          50: '#E6FAF7',
          100: '#C2F2EB',
          200: '#8FE6DB',
          300: '#54D6C7',
          400: '#20C0B0',
          500: '#0EA5A0',
          600: '#0B847F',
          700: '#0A6562',
          800: '#084845',
          900: '#06302E',
        },
        // Destination-sticker spectrum.
        coral: {
          50: '#FFF0EE', 100: '#FFDAD4', 200: '#FFB7AC', 300: '#FF9486',
          400: '#FF7A69', 500: '#FF6B5C', 600: '#ED4F3F', 700: '#C73A2C',
        },
        sun: {
          50: '#FFF8E1', 100: '#FFEFB8', 200: '#FFE082', 300: '#FFD24D',
          400: '#FFC83D', 500: '#F5B71E', 600: '#D69A00',
        },
        violet: {
          50: '#F1EEFF', 100: '#E0D9FF', 200: '#C4B7FF', 300: '#A492FF',
          400: '#8B72FF', 500: '#7B61FF', 600: '#6244E6', 700: '#4C32BF',
        },
        sky: {
          50: '#E8F7FE', 100: '#C7ECFD', 200: '#93DBFB', 300: '#5FC8F8',
          400: '#38BDF8', 500: '#169FE0', 600: '#0C7FB8',
        },
        orange: {
          400: '#FF9A4D', 500: '#FF8C42', 600: '#ED6F1F',
        },
        green: {
          100: '#D6F5E3', 400: '#4FD68A', 500: '#34C77B', 600: '#1FA862',
        },
        ink: {
          50: '#F4F6FA', 100: '#ECEFF4', 200: '#DCE1E9', 300: '#B4BCC8',
          400: '#909AA8', 500: '#6B7280', 600: '#525C6B', 700: '#3A4250',
          800: '#20262F', 900: '#14181F',
        },
        paper: '#F6F7FB',
        // Semantic tokens — drive layout switching via CSS variables.
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
        sans: ['var(--font-lexend)', 'system-ui', 'sans-serif'],
        display: ['var(--font-bricolage)', 'var(--font-lexend)', 'sans-serif'],
        mono: ['var(--font-space-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'xs': '6px',
        'card': '20px',
        'xl2': '28px',
      },
      boxShadow: {
        'vy-xs': '0 1px 2px rgba(20,24,31,0.06)',
        'vy-sm': '0 2px 6px rgba(20,24,31,0.07), 0 1px 2px rgba(20,24,31,0.05)',
        'vy-md': '0 8px 20px rgba(20,24,31,0.08), 0 2px 6px rgba(20,24,31,0.05)',
        'vy-lg': '0 18px 40px rgba(20,24,31,0.12), 0 6px 14px rgba(20,24,31,0.06)',
        'vy-xl': '0 30px 70px rgba(20,24,31,0.18), 0 10px 24px rgba(20,24,31,0.08)',
        'vy-hover': '0 22px 48px rgba(20,24,31,0.16), 0 8px 18px rgba(20,24,31,0.08)',
        'glow-teal': '0 10px 26px rgba(14,165,160,0.40)',
        'glow-coral': '0 10px 26px rgba(255,107,92,0.42)',
        'glow-violet': '0 10px 26px rgba(123,97,255,0.40)',
      },
      backgroundImage: {
        'grad-brand': 'linear-gradient(135deg, #0EA5A0 0%, #38BDF8 100%)',
        'grad-sunset': 'linear-gradient(135deg, #FF6B5C 0%, #FF8C42 48%, #FFC83D 100%)',
        'grad-aurora': 'linear-gradient(135deg, #7B61FF 0%, #38BDF8 55%, #20C0B0 100%)',
        'grad-candy': 'linear-gradient(135deg, #FF6B5C 0%, #7B61FF 100%)',
        'grad-mint': 'linear-gradient(135deg, #20C0B0 0%, #34C77B 100%)',
      },
    },
  },
  plugins: [],
}

export default config
