'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdAccountOptionDto,
  AdCampaignDto,
  AdsOverviewDto,
  CreateCampaignInput,
  GeoCityDto,
  Period,
} from '@durbin/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConnections } from './instagram';

function useSchoolKey() {
  return useAuth().school?.id ?? 'none';
}

export function useAdsConnection() {
  const q = useConnections();
  return { ...q, data: q.data?.find((c) => c.type === 'ADS') ?? null };
}

export function useAdsOverview(period: Period, enabled: boolean) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['ads', s, 'overview', period],
    queryFn: () => api<AdsOverviewDto>(`/ads/overview?period=${period}`),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export async function startAdsOAuth() {
  const { url } = await api<{ url: string }>('/meta/oauth/start?target=ADS');
  window.location.assign(url);
}

export function useSyncAds() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['ads', s, 'sync'],
    mutationFn: () => api('/ads/sync', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ads', s] });
      qc.invalidateQueries({ queryKey: ['meta', s] });
      // Lead Ads lidlari va reklama klik maqsadlari
      qc.invalidateQueries({ queryKey: ['goals', s] });
    },
  });
}

export function useDisconnectAds() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/meta/connections/ADS', { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['ads', s] });
      qc.invalidateQueries({ queryKey: ['meta', s] });
    },
  });
}

export function usePendingAdAccounts(selectionId: string | null) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['meta', s, 'pending-ads', selectionId],
    queryFn: () => api<AdAccountOptionDto[]>(`/meta/connections/ads/pending/${selectionId}`),
    enabled: !!selectionId,
    retry: false,
  });
}

export function useSelectAdAccount() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { selectionId: string; adAccountId: string }) =>
      api('/meta/connections/ads', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meta', s] }),
  });
}

export function useSetCampaignStatus() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' }) =>
      api<void>(`/ads/campaigns/${id}/status`, { method: 'PATCH', json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', s] }),
  });
}

export function useCreateCampaign() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) => api<AdCampaignDto>('/ads/campaigns', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads', s] }),
  });
}

export function useCitySearch(q: string) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['ads', s, 'cities', q],
    queryFn: () => api<GeoCityDto[]>(`/ads/cities?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: Infinity,
  });
}
