'use client';

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { uz as uzLocale } from 'date-fns/locale';
import { PlusIcon } from 'lucide-react';
import type { ContentPostDto } from '@durbin/shared';
import type { DateRange } from '@/lib/queries/content';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';
import { PostChip, STATUS_STYLE } from './post-chip';

const t = uz.content;
const WEEK = { weekStartsOn: 1 } as const;
const MONTH_CELL_LIMIT = 3;

export type CalendarView = 'month' | 'week';

/** Kalendarda ko'rinadigan kunlar oralig'i, [from, to) — API so'rovi uchun */
export function visibleRange(view: CalendarView, cursor: Date): DateRange {
  if (view === 'week') {
    const from = startOfWeek(cursor, WEEK);
    return { from, to: addDays(from, 7) };
  }
  const from = startOfWeek(startOfMonth(cursor), WEEK);
  return { from, to: addDays(endOfWeek(endOfMonth(cursor), WEEK), 1) };
}

/** Statistika davri: oy ko'rinishida — faqat shu oy, hafta ko'rinishida — shu hafta */
export function statsRange(view: CalendarView, cursor: Date): DateRange {
  if (view === 'week') return visibleRange('week', cursor);
  const from = startOfMonth(cursor);
  return { from, to: addDays(endOfMonth(cursor), 1) };
}

export function rangeLabel(view: CalendarView, cursor: Date): string {
  if (view === 'month') return format(cursor, 'LLLL yyyy', { locale: uzLocale });
  const { from } = visibleRange('week', cursor);
  const to = addDays(from, 6);
  return isSameMonth(from, to)
    ? `${format(from, 'd')}–${format(to, 'd MMMM yyyy', { locale: uzLocale })}`
    : `${format(from, 'd MMM', { locale: uzLocale })} – ${format(to, 'd MMM yyyy', { locale: uzLocale })}`;
}

interface CalendarProps {
  view: CalendarView;
  cursor: Date;
  posts: ContentPostDto[];
  canCreate: boolean;
  onCreate: (day: Date) => void;
  onOpen: (post: ContentPostDto) => void;
  /** Oy ko'rinishida "yana N ta" bosilganda — shu kunning haftasiga o'tish */
  onShowWeek: (day: Date) => void;
}

export function Calendar(props: CalendarProps) {
  const { view, cursor, posts } = props;
  const { from, to } = visibleRange(view, cursor);
  const days = eachDayOfInterval({ start: from, end: addDays(to, -1) });
  const byDay = (day: Date) => posts.filter((p) => isSameDay(new Date(p.scheduledAt), day));

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="bg-muted/50 hidden grid-cols-7 border-b sm:grid">
        {t.weekdays.map((d) => (
          <div key={d} className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className={cn('grid grid-cols-7', view === 'week' && 'max-sm:grid-cols-1')}>
        {days.map((day) =>
          view === 'month' ? (
            <MonthCell key={day.toISOString()} {...props} day={day} posts={byDay(day)} />
          ) : (
            <WeekColumn key={day.toISOString()} {...props} day={day} posts={byDay(day)} />
          ),
        )}
      </div>
    </div>
  );
}

type CellProps = CalendarProps & { day: Date; posts: ContentPostDto[] };

function isPastDay(day: Date) {
  return isBefore(day, startOfDay(new Date()));
}

function DayNumber({ day, className }: { day: Date; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
        isToday(day) && 'bg-primary text-primary-foreground font-semibold',
        className,
      )}
    >
      {format(day, 'd')}
    </span>
  );
}

function AddButton({ day, onCreate, className }: { day: Date; onCreate: (d: Date) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCreate(day);
      }}
      aria-label={t.addOnDay(format(day, 'd MMMM', { locale: uzLocale }))}
      className={cn(
        'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex size-6 items-center justify-center rounded-md outline-none focus-visible:ring-3',
        className,
      )}
    >
      <PlusIcon className="size-3.5" aria-hidden />
    </button>
  );
}

/** Bo'sh joyga bosish — shu kun uchun yangi post. Klaviatura uchun + tugmasi bor. */
function dayClick(creatable: boolean, day: Date, onCreate: (d: Date) => void) {
  return creatable ? { onClick: () => onCreate(day) } : {};
}

const stop = (fn: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation();
  fn();
};

function MonthCell({ day, posts, cursor, canCreate, onCreate, onOpen, onShowWeek }: CellProps) {
  const outside = !isSameMonth(day, cursor);
  const creatable = canCreate && !isPastDay(day);
  const shown = posts.slice(0, MONTH_CELL_LIMIT);
  const hidden = posts.length - shown.length;

  return (
    <div
      {...dayClick(creatable, day, onCreate)}
      className={cn(
        'group/cell flex min-h-16 min-w-0 flex-col gap-1 border-r border-b p-1 sm:min-h-28 [&:nth-child(7n)]:border-r-0',
        outside && 'bg-muted/30',
        creatable && 'hover:bg-muted/40 cursor-pointer',
      )}
    >
      <div className="flex items-center justify-between">
        <DayNumber day={day} className={cn(outside && 'text-muted-foreground')} />
        {creatable && (
          <AddButton
            day={day}
            onCreate={onCreate}
            className="opacity-100 sm:opacity-0 sm:group-hover/cell:opacity-100 sm:focus-visible:opacity-100"
          />
        )}
      </div>
      {/* Telefonda katakcha tor — kartochka o'rniga rangli nuqtalar, bosilsa hafta ko'rinishi ochiladi */}
      {posts.length > 0 && (
        <button
          type="button"
          onClick={stop(() => onShowWeek(day))}
          className="flex flex-wrap gap-0.5 sm:hidden"
          aria-label={`${format(day, 'd MMMM', { locale: uzLocale })}: ${posts.length}`}
        >
          {posts.map((p) => (
            <span key={p.id} className={cn('size-2 rounded-full border', STATUS_STYLE[p.status].className)} />
          ))}
        </button>
      )}
      <div className="hidden min-w-0 flex-col gap-1 sm:flex">
        {shown.map((p) => (
          <PostChip key={p.id} post={p} onOpen={onOpen} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={stop(() => onShowWeek(day))}
            className="text-muted-foreground hover:text-foreground px-1 text-left text-xs"
          >
            {t.more(hidden)}
          </button>
        )}
      </div>
    </div>
  );
}

function WeekColumn({ day, posts, canCreate, onCreate, onOpen }: CellProps) {
  const creatable = canCreate && !isPastDay(day);
  return (
    <div
      {...dayClick(creatable, day, onCreate)}
      className={cn(
        'group/cell flex min-w-0 flex-col gap-1.5 border-b p-2 sm:min-h-96 sm:border-r sm:border-b-0 [&:nth-child(7n)]:border-r-0',
        creatable && 'hover:bg-muted/40 cursor-pointer',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <DayNumber day={day} />
          <span className="text-muted-foreground text-xs sm:hidden">{format(day, 'EEEE', { locale: uzLocale })}</span>
        </div>
        {creatable && <AddButton day={day} onCreate={onCreate} />}
      </div>
      {posts.map((p) => (
        <PostChip key={p.id} post={p} onOpen={onOpen} />
      ))}
      {posts.length === 0 && <span className="text-muted-foreground hidden px-1 text-xs sm:block">{t.emptyDay}</span>}
    </div>
  );
}
