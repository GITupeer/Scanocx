import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { resumePendingCloudAi } from '@/src/ai/queue';
import { isApiConfigured } from '@/src/ai/config';
import * as api from '@/src/api/endpoints';
import { clearAuthToken, getAuthToken, setAuthToken } from '@/src/api/token';
import type { ApiUser } from '@/src/api/types';
import { tryResumeOcrQueue } from '@/src/ocr/queue';
import { applyOcrQuotaFromUser, clearOcrQuota, refreshOcrQuota } from '@/src/ocr/quota';
import { clearExportQuota, applyExportQuotaFromUser, refreshExportQuota } from '@/src/export/quota';

type AuthContextValue = {
  ready: boolean;
  user: ApiUser | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<ApiUser>;
  signUp: (name: string, email: string, password: string) => Promise<ApiUser>;
  signOut: () => Promise<void>;
  requireAuth: () => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<ApiUser | null>(null);

  const refresh = useCallback(async () => {
    if (!isApiConfigured()) {
      setUser(null);
      clearOcrQuota();
      await clearExportQuota();
      return;
    }
    const token = await getAuthToken();
    if (!token) {
      setUser(null);
      clearOcrQuota();
      await clearExportQuota();
      return;
    }
    try {
      const me = await api.fetchMe();
      setUser(me);
      applyOcrQuotaFromUser(me.ocr_quota);
      applyExportQuotaFromUser(me.export_quota, me.id);
    } catch {
      await clearAuthToken();
      setUser(null);
      clearOcrQuota();
      await clearExportQuota();
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  useEffect(() => {
    if (!ready || user == null) return;
    void resumePendingCloudAi().catch(() => undefined);
  }, [ready, user?.id]);

  useEffect(() => {
    if (!ready) return;
    if (user == null) {
      clearOcrQuota();
      void clearExportQuota();
      return;
    }
    applyOcrQuotaFromUser(user.ocr_quota);
    applyExportQuotaFromUser(user.export_quota, user.id);
    void refreshOcrQuota()
      .then(() => tryResumeOcrQueue())
      .catch(() => undefined);
    void refreshExportQuota(user.id).catch(() => undefined);
  }, [user?.id, user?.plan, user?.ocr_quota?.remaining, user?.export_quota?.period_key, ready]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password });
    await setAuthToken(result.token);
    setUser(result.user);
    applyOcrQuotaFromUser(result.user.ocr_quota);
    applyExportQuotaFromUser(result.user.export_quota, result.user.id);
    return result.user;
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const result = await api.register({
      name,
      email,
      password,
      password_confirmation: password,
    });
    await setAuthToken(result.token);
    setUser(result.user);
    applyOcrQuotaFromUser(result.user.ocr_quota);
    applyExportQuotaFromUser(result.user.export_quota, result.user.id);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore network errors on logout
    }
    await clearAuthToken();
    setUser(null);
    clearOcrQuota();
    await clearExportQuota();
  }, []);

  const requireAuth = useCallback(() => user != null, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      isLoggedIn: user != null,
      isAdmin: Boolean(user?.roles?.includes('admin')),
      refresh,
      signIn,
      signUp,
      signOut,
      requireAuth,
    }),
    [ready, user, refresh, signIn, signUp, signOut, requireAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth poza AuthProvider');
  }
  return ctx;
}
