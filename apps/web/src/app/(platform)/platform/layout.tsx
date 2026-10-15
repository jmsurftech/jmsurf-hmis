'use client';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { PLATFORM_BOTTOM, PLATFORM_NAV } from '@/lib/platform';

function Gate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.isSuperAdmin) return <EmptyState icon={ShieldAlert} title="Platform console is restricted" message="Only JMSURF super admins can open this area." action={<Link href="/dashboard" className="btn primary">Go to your dashboard</Link>} />;
  return <>{children}</>;
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell nav={PLATFORM_NAV} home="/platform" bottomNav={PLATFORM_BOTTOM} sub="Platform console"><Gate>{children}</Gate></AppShell>;
}
