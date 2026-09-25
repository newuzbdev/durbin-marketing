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
export const STATUS_STYLE: Record<PostStatus, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  SCHEDULED: { className: 'bg-muted text-foreground border-border', icon: ClockIcon },
  PUBLISHING: { className: 'bg-muted text-foreground border-border', icon: LoaderIcon },
  PUBLISHED: {
    className:
      'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-100 dark:border-emerald-900',
    icon: CheckIcon,
  },
  FAILED: {
    className: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/60 dark:text-red-100 dark:border-red-900',
    icon: CircleAlertIcon,
  },
  MISSED: {
    className: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/60 dark:text-red-100 dark:border-red-900',
    icon: CircleSlashIcon,
  },
};

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
        'focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-1 rounded-md border px-1.5 py-1 text-left text-xs outline-none hover:brightness-95 focus-visible:ring-3 dark:hover:brightness-110',
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
