'use client';
import { useQuery } from '@tanstack/react-query';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Logo } from '@/components/AppShell';

function Display() {
  const sp = useSearchParams().get('servicePoint') ?? '';
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const { data } = useQuery({ queryKey: ['display', sp], queryFn: () => api.get<Record<string, { waiting: any[]; called: any[]; serving: any[] }>>('/queue/board', { servicePoint: sp || undefined }), refetchInterval: 5000 });
  const points = Object.values(data ?? {});
  const called = points.flatMap((p) => p.called).sort((a, b) => String(b.calledAt).localeCompare(String(a.calledAt)));
  const waiting = points.flatMap((p) => p.waiting).slice(0, 12);
  const last = useRef<string | null>(null);
  useEffect(() => {
    const top = called[0];
    if (top && top.id + top.calledAt !== last.current) {
      last.current = top.id + top.calledAt;
      try { const u = new SpeechSynthesisUtterance(`Ticket ${top.token}, please proceed to ${String(top.servicePoint ?? 'the counter').toLowerCase()}`); speechSynthesis.speak(u); } catch {}
    }
  }, [called]);
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between"><Logo className="text-2xl" /><span className="text-3xl font-light tabular-nums">{now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div className="grid flex-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-2xl uppercase tracking-widest text-primary-300">Now serving</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {called.map((t, i) => <div key={t.id} className={`rounded-2xl p-6 ${i === 0 ? 'animate-pulse bg-primary-600' : 'bg-slate-800'}`}><p className="text-6xl font-bold">{t.token}</p><p className="mt-2 text-2xl">{t.servicePoint}</p></div>)}
            {!called.length && <p className="text-2xl text-slate-500">Please wait to be called</p>}
          </div>
        </div>
        <div><h2 className="mb-4 text-2xl uppercase tracking-widest text-slate-400">Next</h2>
          <ul className="space-y-2">{waiting.map((t) => <li key={t.id} className="rounded-xl bg-slate-900 px-5 py-3 text-3xl font-semibold">{t.token}</li>)}</ul></div>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Display /></Suspense>; }
