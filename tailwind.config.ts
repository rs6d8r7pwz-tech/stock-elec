import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        electreau: {
          blue: '#1e50a0',
          dark: '#163a7a',
          light: '#e8f0fb',
          mid: '#c8d8f5',
          bg: '#f5f7fc',
        },
      },
    },
  },
  plugins: [],
}
export default config
