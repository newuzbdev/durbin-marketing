'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiChatReplyDto,
  AiInsightKind,
  AiInsightsDto,
  AiMessageDto,
  AiScriptDto,
  AiThreadDto,
  ScriptRequestInput,
} from '@durbin/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function useSchoolKey() {
  return useAuth().school?.id ?? 'none';
}

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai', 'status'],
    queryFn: () => api<{ configured: boolean; model: string }>('/ai/status'),
    staleTime: Infinity,
  });
}

export function useInsights(kind: AiInsightKind) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['ai', s, 'insights', kind],
    queryFn: () => api<AiInsightsDto | null>(`/ai/insights/${kind}`),
  });
}

export function useGenerateInsights(kind: AiInsightKind) {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<AiInsightsDto>(`/ai/insights/${kind}`, { method: 'POST' }),
    onSuccess: (data) => qc.setQueryData(['ai', s, 'insights', kind], data),
  });
}

export function useWriteScript() {
  return useMutation({
    mutationFn: (input: ScriptRequestInput) => api<AiScriptDto>('/ai/script', { method: 'POST', json: input }),
  });
}

export function useThreads() {
  const s = useSchoolKey();
  return useQuery({ queryKey: ['ai', s, 'threads'], queryFn: () => api<AiThreadDto[]>('/ai/threads') });
}

export function useThreadMessages(threadId: string | null) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['ai', s, 'messages', threadId],
    queryFn: () => api<AiMessageDto[]>(`/ai/threads/${threadId}/messages`),
    enabled: !!threadId,
  });
}

export function useSendChat() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { threadId?: string; message: string }) =>
      api<AiChatReplyDto>('/ai/chat', { method: 'POST', json: input }),
    onSuccess: (res) => {
      qc.setQueryData<AiMessageDto[]>(['ai', s, 'messages', res.threadId], (list) => [
        ...(list ?? []),
        res.userMessage,
        res.reply,
      ]);
      qc.invalidateQueries({ queryKey: ['ai', s, 'threads'] });
    },
  });
}

export function useDeleteThread() {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/ai/threads/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai', s, 'threads'] }),
  });
}
