'use client';
import { Search, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useList } from '@/lib/hooks';
import { age, fullName } from '@/lib/format';
import { useDebounced } from './DataTable';
import { Spinner } from './ui';

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [q, setQ] = useState(''); const dq = useDebounced(q, 250); const router = useRouter();
  const { data, isFetching } = useList<any>('/patients', { q: dq, pageSize: 8 }, open && dq.length >= 2);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!open); } if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, setOpen]);
  useEffect(() => { if (!open) setQ(''); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
          <Search className="h-4 w-4 text-slate-400" />
          <input autoFocus className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Search patients by name, MRN, phone or ID number…" value={q} onChange={(e) => setQ(e.target.value)} />
          {isFetching && <Spinner />}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {(data?.data ?? []).map((p: any) => (
            <li key={p.id}>
              <button className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setOpen(false); router.push(`/patients/${p.id}`); }}>
                <User className="h-4 w-4 text-slate-400" />
                <span className="flex-1"><span className="font-medium">{fullName(p)}</span><span className="ml-2 text-xs text-slate-500">{p.mrn} · {p.sex} · {age(p.dateOfBirth)} · {p.phone}</span></span>
              </button>
            </li>
          ))}
          {dq.length >= 2 && !isFetching && !data?.data?.length && <li className="px-4 py-6 text-center text-sm text-slate-500">No patients found</li>}
          {dq.length < 2 && <li className="px-4 py-6 text-center text-xs text-slate-500">Type at least 2 characters · Ctrl+K to toggle</li>}
        </ul>
      </div>
    </div>
  );
}
