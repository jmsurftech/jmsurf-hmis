import type { Config } from 'tailwindcss';
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50:'#effcfb',100:'#c8f4f1',200:'#93e8e3',300:'#5ad4d0',400:'#2bb8b7',500:'#139b9d',600:'#0d7c80',700:'#0f6367',800:'#114f53',900:'#134246' },
        brand: { blue: '#1e5fa8' },
      },
    },
  },
  plugins: [],
} satisfies Config;
