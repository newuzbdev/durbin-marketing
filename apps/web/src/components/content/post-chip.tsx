'use client';

import type { ContentPostDto, PostStatus, PostType } from '@durbin/shared';
import {
  CheckIcon,
  ClockIcon,
  CircleAlertIcon,
  CircleSlashIcon,
  FilmIcon,
  ImageIcon,
  LoaderIcon,
  SmartphoneIcon,
  VideoIcon,
} from 'lucide-react';
import { fmtTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';

// Rang talabi: kulrang — rejalashtirilgan, yashil — chiqdi, qizil — o'tib ketdi yoki xato.
// Rang yagona belgi bo'lmasligi uchun har bir holatda ikonka ham bor.
const GRAY =
  'bg-zinc-100 text-zinc-800 border-zinc-300 border-l-zinc-500 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700 dark:border-l-zinc-400';
const GREEN =
  'bg-emerald-100 text-emerald-900 border-emerald-300 border-l-emerald-600 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800 dark:border-l-emerald-400';
const RED =
  'bg-red-100 text-red-900 border-red-300 border-l-red-600 dark:bg-red-950 dark:text-red-100 dark:border-red-800 dark:border-l-red-400';

export const STATUS_STYLE: Record<PostStatus, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  SCHEDULED: { className: GRAY, icon: ClockIcon },
  PUBLISHING: { className: GRAY, icon: LoaderIcon },
  PUBLISHED: { className: GREEN, icon: CheckIcon },
  FAILED: { className: RED, icon: CircleAlertIcon },
  MISSED: { className: RED, icon: CircleSlashIcon },
};

/** Kalendar ostidagi ranglar izohi */
export function StatusLegend() {
  const items = [
    { className: GRAY, label: uz.content.legend.scheduled },
    { className: GREEN, label: uz.content.legend.published },
    { className: RED, label: uz.content.legend.failed },
  ];
  return (
    <ul className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" aria-label={uz.content.legend.title}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cn('h-3 w-4 rounded-sm border border-l-[3px]', i.className)} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export const TYPE_ICON: Record<PostType, React.ComponentType<{ className?: string }>> = {
  IMAGE: ImageIcon,
  VIDEO: VideoIcon,
  REEL: FilmIcon,
  STORY: SmartphoneIcon,
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const { className, icon: Icon } = STATUS_STYLE[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium', className)}>
      <Icon className={cn('size-3.5', status === 'PUBLISHING' && 'animate-spin')} aria-hidden />
      {uz.content.statuses[status]}
    </span>
  );
}

export function PostChip({ post, onOpen }: { post: ContentPostDto; onOpen: (post: ContentPostDto) => void }) {
  const { className, icon: StatusIcon } = STATUS_STYLE[post.status];
  const TypeIcon = TYPE_ICON[post.type];
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(post);
      }}
      title={`${fmtTime(post.scheduledAt)} · ${post.title} — ${uz.content.statuses[post.status]}`}
      className={cn(
        'focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-1 rounded-md border border-l-[3px] px-1.5 py-1 text-left text-xs outline-none hover:brightness-95 focus-visible:ring-3 dark:hover:brightness-110',
        className,
      )}
    >
      <StatusIcon className={cn('size-3 shrink-0', post.status === 'PUBLISHING' && 'animate-spin')} aria-hidden />
      <span className="shrink-0 tabular-nums">{fmtTime(post.scheduledAt)}</span>
      <TypeIcon className="size-3 shrink-0 opacity-70" aria-hidden />
      <span className="truncate font-medium">{post.title}</span>
      <span className="sr-only">— {uz.content.statuses[post.status]}</span>
    </button>
  );
}
