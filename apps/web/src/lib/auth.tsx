'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput, RegisterInput, Role } from '@durbin/shared';
import { api, session } from './api';

export interface Me {
  id: string;
  email: string;
  name: string;
  schools: { id: string; name: string; role: Role }[];
}

interface AuthState {
  me: Me | undefined;
  isLoading: boolean;
  school: Me['schools'][number] | undefined;
  selectSchool: (id: string) => void;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// localStorage o'zgarishini React'ga bildirish uchun
const schoolListeners = new Set<() => void>();
const subscribeSession = (cb: () => void) => {
  schoolListeners.add(cb);
  return () => schoolListeners.delete(cb);
};
const setSchool = (id: string | null) => {
  session.setSchoolId(id);
  schoolListeners.forEach((cb) => cb());
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const hasTokens = useSyncExternalStore(subscribeSession, session.hasTokens, () => false);
  const schoolId = useSyncExternalStore(subscribeSession, () => session.schoolId, () => null);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
    enabled: hasTokens,
    retry: false,
  });
  const me = hasTokens ? meQuery.data : undefined;

  const school = me?.schools.find((s) => s.id === schoolId) ?? me?.schools[0];

  const afterAuth = useCallback(
    async (tokens: { accessToken: string; refreshToken: string }) => {
      session.setTokens(tokens);
      const fresh = await qc.fetchQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });
      setSchool(fresh.schools[0]?.id ?? null);
    },
    [qc],
  );

  const value = useMemo<AuthState>(
    () => ({
      me,
      isLoading: hasTokens && meQuery.isLoading,
      school,
      selectSchool: (id) => {
        setSchool(id);
        qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      },
      login: async (input) => afterAuth(await api('/auth/login', { method: 'POST', json: input })),
      register: async (input) => afterAuth(await api('/auth/register', { method: 'POST', json: input })),
      logout: async () => {
        const refreshToken = session.refreshToken();
        if (refreshToken) await api('/auth/logout', { method: 'POST', json: { refreshToken } }).catch(() => {});
        session.setTokens(null);
        setSchool(null);
        qc.clear();
      },
    }),
    [me, hasTokens, meQuery.isLoading, school, qc, afterAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
}
