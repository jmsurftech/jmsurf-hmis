import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';
import { themeInitScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: { default: 'JMSURF HMIS', template: '%s · JMSURF HMIS' },
  description: 'Hospital management for Kenya and Africa: SHA claims, billing, EMR, lab, pharmacy, inpatient care and MOH reporting. Powered by JMSURF TECHNOLOGIES.',
  applicationName: 'JMSURF HMIS',
};
export const viewport: Viewport = { themeColor: '#bd2332', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
