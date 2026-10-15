'use client';
import { useEffect, useState } from 'react';

/** Light by default; the choice is kept per browser. Sets both html.dark (Tailwind) and data-theme (design tokens). */
export function applyTheme(dark: boolean) {
  const el = document.documentElement;
  el.classList.toggle('dark', dark);
  el.setAttribute('data-theme', dark ? 'dark' : 'light');
}
export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains('dark')); }, []);
  const toggle = () => {
    const next = !dark; setDark(next); applyTheme(next);
    try { localStorage.setItem('jmsurf.theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
  };
  return { dark, toggle };
}
export const themeInitScript = `try{var t=localStorage.getItem('jmsurf.theme');var d=t==='dark';var e=document.documentElement;e.classList.toggle('dark',d);e.setAttribute('data-theme',d?'dark':'light')}catch(e){}`;
