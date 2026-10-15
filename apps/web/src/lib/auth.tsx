'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, facilityStore, tokenStore } from './api';

export interface AuthUser {
  id: string; email: string; firstName: string; lastName: string; roles: string[];
  facilityIds: string[]; tenantId: string | null; isSuperAdmin?: boolean;
  tenant?: { id: string; name: string } | null;
}
interface AuthCtx {
  user: AuthUser | null; loading: boolean; facilityId: string | null;
  login: (email: string, password: string) => Promise<void>;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void; setFacility: (id: string) => void; hasRole: (...r: string[]) => boolean;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [facilityId, setFacilityId] = useState<string | null>(null);

  useEffect(() => {
    setFacilityId(facilityStore.get());
    if (!tokenStore.get()) { setLoading(false); return; }
    api.get<AuthUser>('/auth/me').then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);

  const setSession = useCallback((token: string, u: AuthUser) => {
    tokenStore.set(token); setUser(u);
    if (!facilityStore.get() && u.facilityIds?.[0]) { facilityStore.set(u.facilityIds[0]); setFacilityId(u.facilityIds[0]); }
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ accessToken: string; user: AuthUser }>('/auth/login', { email, password });
    setSession(r.accessToken, r.user);
  }, [setSession]);
  const logout = useCallback(() => { tokenStore.clear(); setUser(null); window.location.href = '/login'; }, []);
  const setFacility = useCallback((id: string) => { facilityStore.set(id); setFacilityId(id); }, []);
  const hasRole = useCallback((...r: string[]) => !!user && (user.roles.includes('ADMIN') || !!user.isSuperAdmin || r.some((x) => user.roles.includes(x))), [user]);

  return <Ctx.Provider value={{ user, loading, facilityId, login, setSession, logout, setFacility, hasRole }}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
