/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0f0a1e', 2: '#160f2b' },
        surface: '#1a1030',
        coral: { DEFAULT: '#ff5c4d', deep: '#d63f31' },
        lime: '#c8ff3d',
        sun: '#ffd166',
        pink: '#ff7ab8',
        sky: '#3fb6ff',
        cream: '#fff7ef',
        muted: '#b7a9c9',
      },
      fontFamily: {
        display: ['"Chakra Petch"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        body: ['Inter', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['clamp(3rem, 9vw, 7rem)', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
        'display-l': ['clamp(2rem, 5vw, 3.5rem)', { lineHeight: '1', letterSpacing: '-0.01em' }],
        'display-m': ['clamp(1.4rem, 3vw, 2rem)', { lineHeight: '1.05' }],
        label: ['0.72rem', { lineHeight: '1', letterSpacing: '0.14em' }],
      },
      borderRadius: { lg: '14px', xl: '20px' },
      boxShadow: { glow: '0 0 0 1px rgba(255,247,239,0.08), 0 10px 40px rgba(0,0,0,0.35)' },
    },
  },
  plugins: [],
};
