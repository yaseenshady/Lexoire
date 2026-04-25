/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon-cyan': {
          DEFAULT: '#00ffff',
          '5': 'rgba(0, 255, 255, 0.05)',
          '8': 'rgba(0, 255, 255, 0.08)',
          '10': 'rgba(0, 255, 255, 0.1)',
          '15': 'rgba(0, 255, 255, 0.15)',
          '30': 'rgba(0, 255, 255, 0.3)',
          '40': 'rgba(0, 255, 255, 0.4)',
          '60': 'rgba(0, 255, 255, 0.6)',
          '70': 'rgba(0, 255, 255, 0.7)',
          '90': 'rgba(0, 255, 255, 0.9)',
        },
        'neon-purple': '#bf00ff',
        'neon-pink': '#ff00ff',
        'neon-blue': '#0080ff',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 255, 255, 0.5), 0 0 10px rgba(0, 255, 255, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 255, 255, 0.8), 0 0 30px rgba(0, 255, 255, 0.5)' },
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
