/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // F1 Professional Racing Theme
        primary: '#dc2626',
        secondary: '#2563eb',
        dark: '#171717',
        // Pixel palette - F1 themed
        pixel: {
          black: '#171717',   // Carbon black
          dark: '#262626',    // Charcoal
          mid: '#404040',     // Slate
          light: '#737373',   // Inactive
          red: '#dc2626',     // Racing red
          orange: '#ea580c',  // McLaren orange
          yellow: '#fbbf24',  // Caution yellow
          green: '#0d9488',   // Aston Martin teal
          cyan: '#525252',    // Neutral
          blue: '#2563eb',    // Williams blue
          purple: '#525252',  // Neutral
          pink: '#dc2626',    // Same as red
          white: '#ffffff',   // Pure white
          gray: '#a3a3a3',    // Chrome silver
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        'pixel-body': ['"VT323"', 'monospace'],
      },
      boxShadow: {
        'pixel': '4px 4px 0 #171717',
        'pixel-sm': '2px 2px 0 #171717',
        'pixel-lg': '6px 6px 0 #171717',
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
