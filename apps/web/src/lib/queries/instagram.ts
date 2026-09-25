'use client';

import { useEffect, useRef } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  IgConversationDto,
  IgMediaDto,
  IgMessageDto,
  IgOverviewDto,
  MetaConnectionDto,
  Paginated,
  Period,
} from '@durbin/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Kalitlar maktab bo'yicha ajratiladi — maktab almashsa kesh aralashmaydi
function useSchoolKey() {
  return useAuth().school?.id ?? 'none';
}

export function useMetaMode() {
  return useQuery({
    queryKey: ['meta', 'mode'],
    queryFn: () => api<{ mode: 'mock' | 'live' }>('/meta/mode'),
    staleTime: Infinity,
  });
}

export function useConnections() {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['meta', s, 'connections'],
    queryFn: () => api<MetaConnectionDto[]>('/meta/connections'),
    // Yangi ulanishning birinchi sync'i fon cron'da ketadi — tugashini kutib turamiz
    refetchInterval: (q) => (q.state.data?.some((c) => !c.lastSyncedAt) ? 3000 : false),
  });
}

/**
 * Meta'dan ma'lumot olinmoqdami: "Yangilash" bosilgan yoki ulangandan keyingi birinchi sync hali tugamagan.
 * Birinchi sync fon'da tugaganda sahifa ma'lumotlari qayta so'raladi.
 */
export function useSyncState(type: 'INSTAGRAM' | 'ADS') {
  const s = useSchoolKey();
  const qc = useQueryClient();
  const root = type === 'ADS' ? 'ads' : 'instagram';
  const conn = useConnections().data?.find((c) => c.type === type) ?? null;
  const running = useIsMutating({ mutationKey: [root, s, 'sync'] }) > 0;
  const firstSync = !!conn && !conn.lastSyncedAt;

  const wasFirst = useRef(firstSync);
  useEffect(() => {
    if (wasFirst.current && !firstSync) qc.invalidateQueries({ queryKey: [root, s] });
    wasFirst.current = firstSync;
  }, [firstSync, qc, root, s]);

  return { syncing: running || firstSync, firstSync };
}

export function useInstagramConnection() {
  const q = useConnections();
  return { ...q, data: q.data?.find((c) => c.type === 'INSTAGRAM') ?? null };
}

export function useInstagramOverview(period: Period, enabled: boolean) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['instagram', s, 'overview', period],
    queryFn: () => api<IgOverviewDto>(`/instagram/overview?period=${period}`),
    enabled,
  });
}

export function useInstagramMedia(page: number, enabled: boolean) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['instagram', s, 'media', page],
    queryFn: () => api<Paginated<IgMediaDto>>(`/instagram/media?page=${page}&pageSize=20`),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useTopMedia(period: Period, enabled: boolean) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['instagram', s, 'top', period],
    queryFn: () => api<IgMediaDto[]>(`/instagram/media/top?period=${period}`),
    enabled,
  });
}

export function useConversations(enabled: boolean) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['instagram', s, 'conversations'],
    queryFn: () => api<IgConversationDto[]>('/instagram/conversations'),
    enabled,
    refetchInterval: 15_000,
  });
}

export function useMessages(conversationId: string | null) {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['instagram', s, 'messages', conversationId],
    queryFn: async () => {
      const msgs = await api<IgMessageDto[]>(`/instagram/conversations/${conversationId}/messages`);
      // Server o'qilgan deb belgiladi — ro'yxatdagi qizil belgini yangilash
      qc.setQueryData<IgConversationDto[]>(['instagram', s, 'conversations'], (list) =>
        list?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      );
      return msgs;
    },
    enabled: !!conversationId,
    refetchInterval: 15_000,
  });
}

export function useSendMessage(conversationId: string) {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api<IgMessageDto>(`/instagram/conversations/${conversationId}/messages`, { method: 'POST', json: { text } }),
    onSuccess: (msg) => {
      qc.setQueryData<IgMessageDto[]>(['instagram', s, 'messages', conversationId], (list) => [...(list ?? []), msg]);
      qc.invalidateQueries({ queryKey: ['instagram', s, 'conversations'] });
    },
  });
}

export function useSyncInstagram() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['instagram', s, 'sync'],
    mutationFn: () => api('/instagram/sync', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instagram', s] });
      qc.invalidateQueries({ queryKey: ['meta', s] });
    },
  });
}

export function useDisconnectInstagram() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/meta/connections/INSTAGRAM', { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['instagram', s] });
      qc.invalidateQueries({ queryKey: ['meta', s] });
    },
  });
}

export async function startInstagramOAuth() {
  const { url } = await api<{ url: string }>('/meta/oauth/start');
  window.location.assign(url);
}

export function usePendingAccounts(selectionId: string | null) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['meta', s, 'pending', selectionId],
    queryFn: () =>
      api<{ igUserId: string; username: string; avatarUrl: string | null; pageName: string }[]>(
        `/meta/connections/instagram/pending/${selectionId}`,
      ),
    enabled: !!selectionId,
    retry: false,
  });
}

export function useSelectAccount() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { selectionId: string; igUserId: string }) =>
      api('/meta/connections/instagram', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meta', s] }),
  });
}
