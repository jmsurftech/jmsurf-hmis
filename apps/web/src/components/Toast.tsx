'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '@/lib/cn';
type T = { id: number; msg: string; kind: 'success' | 'error' | 'info' };
const Ctx = createContext<{ push: (m: string, k?: T['kind']) => void }>({ push: () => {} });
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((msg: string, kind: T['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((i) => [...i, { id, msg, kind }]);
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cn('rounded-lg px-4 py-2 text-sm text-white shadow-lg', t.kind === 'success' ? 'bg-emerald-600' : t.kind === 'error' ? 'bg-red-600' : 'bg-slate-800')}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
