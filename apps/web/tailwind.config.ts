import type { Config } from 'tailwindcss';
// JMSURF palette: crimson brand (same as SMS, eSchool Nexus, GROW) and warm neutrals in place of Tailwind's slate,
// so every page that uses slate-* / primary-* utilities picks up the JMSURF look in light and dark mode.
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#fff6f7', 100: '#fcebed', 200: '#f8cdd2', 300: '#f0a3ad', 400: '#e5707f', 500: '#d43a4b', 600: '#bd2332', 700: '#9c1826', 800: '#7d1420', 900: '#5c0f18', 950: '#3a0910' },
        slate: { 50: '#faf6f7', 100: '#f3edef', 200: '#e6dbe0', 300: '#d3c1ca', 400: '#9b8c94', 500: '#6f6168', 600: '#574a51', 700: '#42363d', 800: '#2f2c30', 900: '#1c1a1d', 950: '#121012' },
        brand: { blue: '#df5264', ink: '#261e22' },
      },
      fontFamily: { sans: ['Inter', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'] },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '28px' },
    },
  },
  plugins: [],
} satisfies Config;
