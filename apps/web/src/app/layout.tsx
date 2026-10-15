import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';
import { themeInitScript } from '@/lib/theme';
export const metadata: Metadata = { title: 'JMSURF HMIS', description: 'Certified-ready. Paid faster. Works offline. Hospital management for Kenya & Africa.', manifest: '/manifest.webmanifest', icons: { icon: '/icon.svg', apple: '/icon.svg' }, appleWebApp: { capable: true, title: 'JMSURF HMIS', statusBarStyle: 'default' } };
export const viewport: Viewport = { themeColor: '#0d7c80', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
