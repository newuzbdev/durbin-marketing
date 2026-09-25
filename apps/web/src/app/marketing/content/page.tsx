'use client';

import { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addMonths, addWeeks, format, isValid, parseISO } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import type { ContentPostDto } from '@durbin/shared';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Calendar, rangeLabel, statsRange, visibleRange, type CalendarView } from '@/components/content/calendar';
import { PostDetailsDialog } from '@/components/content/post-details-dialog';
import { PostFormDialog } from '@/components/content/post-form-dialog';
import { useAuth } from '@/lib/auth';
import { fmtNumber } from '@/lib/format';
import { useContentStats, usePosts } from '@/lib/queries/content';
import { uz } from '@/messages/uz';

const t = uz.content;

export default function ContentPage() {
  // useSearchParams statik prerender'da Suspense talab qiladi
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ContentView />
    </Suspense>
  );
}

function ContentView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { school } = useAuth();
  const canManage = school?.role !== 'VIEWER';

  // Ko'rinish va sana URL'da — sahifa yangilansa yoki havola ulashilsa saqlanadi
  const view: CalendarView = params.get('view') === 'week' ? 'week' : 'month';
  const dateParam = params.get('date');
  const parsed = dateParam ? parseISO(dateParam) : null;
  const cursor = useMemo(() => (parsed && isValid(parsed) ? parsed : new Date()), [dateParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function navigate(next: { view?: CalendarView; date?: Date | null }) {
    const qs = new URLSearchParams(params);
    const v = next.view ?? view;
    if (v === 'month') qs.delete('view');
    else qs.set('view', v);
    const d = next.date === undefined ? cursor : next.date;
    if (d) qs.set('date', format(d, 'yyyy-MM-dd'));
    else qs.delete('date');
    const s = qs.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  const range = visibleRange(view, cursor);
  const posts = usePosts(range);
  const stats = useContentStats(statsRange(view, cursor));

  const [form, setForm] = useState<{ open: boolean; post?: ContentPostDto | null; day?: Date | null }>({ open: false });
  const [opened, setOpened] = useState<ContentPostDto | null>(null);
  // Ochiq kartochka ro'yxat yangilanganda (masalan, holat o'zgarsa) eng so'nggi ma'lumotni ko'rsatadi
  const openedPost = opened ? (posts.data?.find((p) => p.id === opened.id) ?? opened) : null;

  const step = (dir: 1 | -1) => navigate({ date: view === 'month' ? addMonths(cursor, dir) : addWeeks(cursor, dir) });
  const s = stats.data;
  const done = s && s.total ? Math.round((s.published / s.total) * 100) : null;

  return (
    <>
      <PageHeader
        title={uz.nav.content}
        description={t.description}
        actions={
          canManage && (
            <Button onClick={() => setForm({ open: true, day: null })}>
              <PlusIcon aria-hidden /> {t.newPost}
            </Button>
          )
        }
      />

      <section aria-label={t.stats.title(rangeLabel(view, cursor))} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t.stats.total} value={fmtNumber(s?.total ?? 0)} loading={stats.isLoading} />
        <StatTile
          label={t.stats.published}
          value={fmtNumber(s?.published ?? 0)}
          loading={stats.isLoading}
          delta={done !== null ? { text: t.stats.rate(done), trend: 'flat' } : null}
        />
        <StatTile label={t.stats.missed} value={fmtNumber(s?.missed ?? 0)} loading={stats.isLoading} />
        <StatTile label={t.stats.failed} value={fmtNumber(s?.failed ?? 0)} loading={stats.isLoading} />
      </section>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label={t.prev}>
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label={t.next}>
            <ChevronRightIcon aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ date: null })}>
            {t.today}
          </Button>
          <h2 className="ml-1 text-lg font-medium first-letter:uppercase">{rangeLabel(view, cursor)}</h2>
        </div>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[view]}
          onValueChange={(v: unknown[]) => v[0] && navigate({ view: v[0] as CalendarView })}
        >
          <ToggleGroupItem value="month">{t.views.month}</ToggleGroupItem>
          <ToggleGroupItem value="week">{t.views.week}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {posts.isLoading ? (
        <Skeleton className="h-[32rem]" />
      ) : (
        <Calendar
          view={view}
          cursor={cursor}
          posts={posts.data ?? []}
          canCreate={canManage}
          onCreate={(day) => setForm({ open: true, day })}
          onOpen={setOpened}
          onShowWeek={(day) => navigate({ view: 'week', date: day })}
        />
      )}

      <PostDetailsDialog
        post={openedPost}
        canManage={canManage}
        onClose={() => setOpened(null)}
        onEdit={(post) => {
          setOpened(null);
          setForm({ open: true, post });
        }}
      />
      <PostFormDialog
        open={form.open}
        post={form.post}
        day={form.day}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
      />
    </>
  );
}
