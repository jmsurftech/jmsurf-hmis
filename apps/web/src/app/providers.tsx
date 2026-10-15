'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
export default function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: (n, e: any) => e?.status !== 401 && e?.status !== 404 && n < 1, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={qc}><ToastProvider><AuthProvider>{children}</AuthProvider></ToastProvider></QueryClientProvider>;
}
