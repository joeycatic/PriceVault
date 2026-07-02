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
          950: '#F1F1F1',
          900: '#FFFFFF',
          800: '#F7F7F7',
          700: '#D4D4D4',
          500: '#707070',
          300: '#5C5C5C',
          100: '#303030',
          lime: '#303030',
        },
        merchant: {
          canvas: '#F1F1F1',
          surface: '#FFFFFF',
          subtle: '#F7F7F7',
          border: '#D4D4D4',
          muted: '#707070',
          ink: '#303030',
          success: '#20845A',
          warning: '#8A6116',
          danger: '#B42318',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(26, 26, 26, 0.06)',
        lime: '0 1px 2px rgba(26, 26, 26, 0.08)',
      },
      backgroundImage: {
        hatch: 'none',
      },
    },
  },
  plugins: [],
}

export default config
