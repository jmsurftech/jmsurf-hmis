import type { Metadata } from 'next';
import { PortalShell } from './shell';
export const metadata: Metadata = { title: 'Patient portal · JMSURF', description: 'Book appointments, see results, pay bills and join video consultations.' };
export default function PortalLayout({ children }: { children: React.ReactNode }) { return <PortalShell>{children}</PortalShell>; }
