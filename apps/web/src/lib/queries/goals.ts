'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateGoalInput,
  CreateLeadInput,
  GoalDto,
  IgConversationDto,
  LeadDto,
  LeadSourcesDto,
  Paginated,
  UpdateGoalInput,
} from '@durbin/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function useSchoolKey() {
  return useAuth().school?.id ?? 'none';
}

export function useGoals() {
  const s = useSchoolKey();
  return useQuery({ queryKey: ['goals', s, 'list'], queryFn: () => api<GoalDto[]>('/goals') });
}

export function useLeads(page: number) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['goals', s, 'leads', page],
    queryFn: () => api<Paginated<LeadDto>>(`/leads?page=${page}&pageSize=10`),
    placeholderData: (prev) => prev,
  });
}

/** Maqsad yoki lid o'zgarsa — ikkala ro'yxat ham qayta so'raladi (lid progressga ta'sir qiladi) */
function useGoalsMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['goals', s] }) });
}

export function useCreateGoal() {
  return useGoalsMutation((input: CreateGoalInput) => api<GoalDto>('/goals', { method: 'POST', json: input }));
}

export function useUpdateGoal() {
  return useGoalsMutation(({ id, ...input }: UpdateGoalInput & { id: string }) =>
    api<GoalDto>(`/goals/${id}`, { method: 'PATCH', json: input }),
  );
}

export function useDeleteGoal() {
  return useGoalsMutation((id: string) => api<void>(`/goals/${id}`, { method: 'DELETE' }));
}

export function useAddLead() {
  return useGoalsMutation((input: CreateLeadInput) => api<LeadDto>('/leads', { method: 'POST', json: input }));
}

export function useDeleteLead() {
  return useGoalsMutation((id: string) => api<void>(`/leads/${id}`, { method: 'DELETE' }));
}

// ─── Avtomatik lid manbalari ─────────────────────────────────────

export function useLeadSources() {
  const s = useSchoolKey();
  return useQuery({ queryKey: ['goals', s, 'sources'], queryFn: () => api<LeadSourcesDto>('/leads/sources') });
}

export function useSetInstagramAutoLeads() {
  return useGoalsMutation((enabled: boolean) =>
    api<LeadSourcesDto>('/leads/sources/instagram', { method: 'PUT', json: { enabled } }),
  );
}

export function useConnectTelegram() {
  return useGoalsMutation((token: string) =>
    api<LeadSourcesDto>('/leads/sources/telegram', { method: 'POST', json: { token } }),
  );
}

export function useDisconnectTelegram() {
  return useGoalsMutation(() => api<void>('/leads/sources/telegram', { method: 'DELETE' }));
}

/** Direct'da suhbatdoshni lid deb belgilash / bekor qilish */
export function useMarkInstagramLead(conversationId: string) {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (isLead: boolean) =>
      api<void>(`/leads/instagram/${conversationId}`, { method: isLead ? 'POST' : 'DELETE' }),
    onSuccess: (_, isLead) => {
      qc.setQueryData<IgConversationDto[]>(['instagram', s, 'conversations'], (list) =>
        list?.map((c) => (c.id === conversationId ? { ...c, isLead } : c)),
      );
      qc.invalidateQueries({ queryKey: ['goals', s] });
    },
  });
}
