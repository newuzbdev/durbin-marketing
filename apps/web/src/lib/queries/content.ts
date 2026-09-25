'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContentPostDto,
  ContentStatsDto,
  CreatePostInput,
  UpdatePostInput,
  UploadRequestInput,
  UploadTicketDto,
} from '@durbin/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface DateRange {
  from: Date;
  to: Date;
}

function useSchoolKey() {
  return useAuth().school?.id ?? 'none';
}

const rangeQs = (r: DateRange) =>
  `from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(r.to.toISOString())}`;

/** Chiqarilayotgan yoki vaqti kelgan post bo'lsa — holat tez-tez yangilanadi */
function pollInterval(posts: ContentPostDto[] | undefined) {
  const soon = Date.now() + 60_000;
  const active = posts?.some(
    (p) => p.status === 'PUBLISHING' || (p.status === 'SCHEDULED' && p.autoPublish && new Date(p.scheduledAt).getTime() < soon),
  );
  return active ? 10_000 : 60_000;
}

export function usePosts(range: DateRange) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['content', s, 'posts', range.from.toISOString(), range.to.toISOString()],
    queryFn: () => api<ContentPostDto[]>(`/content/posts?${rangeQs(range)}`),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => pollInterval(q.state.data),
  });
}

export function useContentStats(range: DateRange) {
  const s = useSchoolKey();
  return useQuery({
    queryKey: ['content', s, 'stats', range.from.toISOString(), range.to.toISOString()],
    queryFn: () => api<ContentStatsDto>(`/content/stats?${rangeQs(range)}`),
    placeholderData: (prev) => prev,
  });
}

/** Har qanday o'zgarishdan keyin kalendar va statistika qayta so'raladi */
function useContentMutation<TVars>(fn: (vars: TVars) => Promise<ContentPostDto | void>) {
  const s = useSchoolKey();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content', s] }),
  });
}

export function useCreatePost() {
  return useContentMutation((input: CreatePostInput) =>
    api<ContentPostDto>('/content/posts', { method: 'POST', json: input }),
  );
}

export function useUpdatePost() {
  return useContentMutation(({ id, ...input }: UpdatePostInput & { id: string }) =>
    api<ContentPostDto>(`/content/posts/${id}`, { method: 'PATCH', json: input }),
  );
}

export function useDeletePost() {
  return useContentMutation((id: string) => api<void>(`/content/posts/${id}`, { method: 'DELETE' }));
}

export function usePublishNow() {
  return useContentMutation((id: string) => api<ContentPostDto>(`/content/posts/${id}/publish`, { method: 'POST' }));
}

export function useMarkPublished() {
  return useContentMutation((id: string) =>
    api<ContentPostDto>(`/content/posts/${id}/mark-published`, { method: 'POST' }),
  );
}

/** Presigned URL olinadi va fayl brauzerdan to'g'ridan-to'g'ri saqlashga yuklanadi */
export async function uploadMedia(file: File, onProgress: (pct: number) => void): Promise<UploadTicketDto['asset']> {
  const input: UploadRequestInput = {
    fileName: file.name,
    contentType: file.type as UploadRequestInput['contentType'],
    size: file.size,
  };
  const ticket = await api<UploadTicketDto>('/content/uploads', { method: 'POST', json: input });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(file);
  });
  return ticket.asset;
}
