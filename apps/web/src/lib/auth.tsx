'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, facilityStore, tokenStore } from './api';

export interface AuthUser {
  id: string; email: string; firstName: string; lastName: string; roles: string[];
  facilityIds: string[]; tenantId: string | null; isSuperAdmin?: boolean;
  tenant?: { id: string; name: string; subscriptionStatus?: string; plan?: string } | null;
  mfaEnabled?: boolean; impersonatedBy?: string | null;
}
export interface LoginResult { accessToken?: string; refreshToken?: string; user?: AuthUser; mfaRequired?: boolean; mfaEnrollRequired?: boolean; mfaToken?: string }
interface AuthCtx {
  user: AuthUser | null; loading: boolean; facilityId: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  setSession: (token: string, user: AuthUser, refreshToken?: string | null) => void;
  reload: () => Promise<void>;
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

  const setSession = useCallback((token: string, u: AuthUser, refreshToken?: string | null) => {
    tokenStore.set(token); tokenStore.setRefresh(refreshToken); setUser(u);
    if (!facilityStore.get() && u.facilityIds?.[0]) { facilityStore.set(u.facilityIds[0]); setFacilityId(u.facilityIds[0]); }
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<LoginResult>('/auth/login', { email, password });
    if (r.accessToken && r.user) setSession(r.accessToken, r.user, r.refreshToken);
    return r;
  }, [setSession]);
  const reload = useCallback(async () => { setUser(await api.get<AuthUser>('/auth/me')); }, []);
  const logout = useCallback(() => {
    const refreshToken = tokenStore.getRefresh();
    api.post('/auth/logout', { refreshToken: refreshToken ?? undefined }).catch(() => undefined).finally(() => {
      tokenStore.clear(); setUser(null); window.location.href = '/login';
    });
  }, []);
  const setFacility = useCallback((id: string) => { facilityStore.set(id); setFacilityId(id); }, []);
  const hasRole = useCallback((...r: string[]) => !!user && (user.roles.includes('ADMIN') || !!user.isSuperAdmin || r.some((x) => user.roles.includes(x))), [user]);

  return <Ctx.Provider value={{ user, loading, facilityId, login, setSession, reload, logout, setFacility, hasRole }}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
