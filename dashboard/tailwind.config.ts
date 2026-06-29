import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vault: {
          950: '#0C0E0B',
          900: '#121510',
          800: '#1B1F19',
          700: '#2A3027',
          500: '#7E8878',
          300: '#BDC6B7',
          100: '#EDF1E9',
          lime: '#B4F000',
        },
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0, 0, 0, 0.28)',
        lime: '0 0 28px rgba(180, 240, 0, 0.16)',
      },
      backgroundImage: {
        hatch: 'repeating-linear-gradient(135deg, rgba(255,255,255,.022) 0, rgba(255,255,255,.022) 1px, transparent 1px, transparent 8px)',
      },
    },
  },
  plugins: [],
}

export default config

