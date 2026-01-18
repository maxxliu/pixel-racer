/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Legacy colors
        primary: '#ffa300',
        secondary: '#29adff',
        dark: '#0a0a0f',
        // Pixel palette
        pixel: {
          black: '#0f0f23',
          dark: '#1a1a2e',
          mid: '#2d2d44',
          light: '#4a4a6a',
          red: '#ff004d',
          orange: '#ffa300',
          yellow: '#ffec27',
          green: '#00e436',
          cyan: '#29adff',
          blue: '#1d2b53',
          purple: '#7e2553',
          pink: '#ff77a8',
          white: '#fff1e8',
          gray: '#5f574f',
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        'pixel-body': ['"VT323"', 'monospace'],
      },
      boxShadow: {
        'pixel': '4px 4px 0 #0f0f23',
        'pixel-sm': '2px 2px 0 #0f0f23',
        'pixel-lg': '6px 6px 0 #0f0f23',
        'neon-cyan': '0 0 10px #29adff, 0 0 20px #29adff',
        'neon-red': '0 0 10px #ff004d, 0 0 20px #ff004d',
        'neon-green': '0 0 10px #00e436, 0 0 20px #00e436',
      },
      animation: {
        'blink': 'blink 1s infinite',
        'flicker': 'flicker 0.1s infinite',
        'pixel-pulse': 'pixel-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
          '75%': { opacity: '0.9' },
        },
        'pixel-pulse': {
          '0%, 100%': { textShadow: '0 0 10px currentColor, 0 0 20px currentColor' },
          '50%': { textShadow: '0 0 20px currentColor, 0 0 40px currentColor' },
        },
      },
    },
  },
  plugins: [],
};
