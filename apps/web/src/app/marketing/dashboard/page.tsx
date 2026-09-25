'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, CameraIcon } from 'lucide-react';
import { DASHBOARD_PERIODS, type DashboardDto, type DashboardPeriod, type GoalDto } from '@durbin/shared';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MetricChart } from '@/components/instagram/metric-chart';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtMoney, fmtNumber, fmtSigned, pctChange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';

const t = uz.dashboard;

export default function DashboardPage() {
  // useSearchParams statik prerender'da Suspense talab qiladi
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <DashboardView />
    </Suspense>
  );
}

function useDashboard(period: DashboardPeriod) {
  const { school } = useAuth();
  return useQuery({
    queryKey: ['dashboard', school?.id ?? 'none', period],
    queryFn: () => api<DashboardDto>(`/dashboard?period=${period}`),
    placeholderData: (prev) => prev,
  });
}

function change(current: number, previous: number, colored = true) {
  const p = pctChange(current, previous);
  if (p === null) return null;
  const trend = !colored || p === 0 ? ('flat' as const) : p > 0 ? ('up' as const) : ('down' as const);
  return { text: `${p > 0 ? '+' : ''}${p}%`, trend };
}

function DashboardView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const period: DashboardPeriod = DASHBOARD_PERIODS.includes(params.get('period') as DashboardPeriod)
    ? (params.get('period') as DashboardPeriod)
    : 'this_week';
  const { data, isLoading } = useDashboard(period);

  return (
    <>
      <PageHeader
        title={uz.nav.dashboard}
        description={t.description}
        actions={
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[period]}
            onValueChange={(v: unknown[]) => {
              const next = v[0] as DashboardPeriod | undefined;
              if (next) router.replace(next === 'this_week' ? pathname : `${pathname}?period=${next}`, { scroll: false });
            }}
          >
            {DASHBOARD_PERIODS.map((p) => (
              <ToggleGroupItem key={p} value={p}>
                {t.periods[p]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />

      <div className="grid gap-4">
        <Kpis data={data} loading={isLoading} />

        {/* Reach va followerlar masshtabi har xil — ikkita alohida grafik */}
        {isLoading || !data ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        ) : data.instagram ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <MetricChart title={t.charts.reach} data={data.instagram.series} dataKey="reach" />
            <MetricChart title={t.charts.followers} data={data.instagram.series} dataKey="followers" zeroBased={false} />
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <CameraIcon className="size-4 shrink-0" aria-hidden /> {t.noInstagram}
              </p>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/marketing/instagram" />}>
                {t.connectInstagram}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <GoalsCard goals={data?.goals} loading={isLoading} />
          <ContentWeekCard week={data?.contentWeek} loading={isLoading} />
        </div>
      </div>
    </>
  );
}

function Kpis({ data, loading }: { data: DashboardDto | undefined; loading: boolean }) {
  const ig = data?.instagram;
  const ads = data?.ads;
  const notConnected = { text: t.notConnected, trend: 'flat' as const };

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        label={t.kpi.reach}
        loading={loading}
        value={ig ? fmtNumber(ig.reach) : '—'}
        delta={ig ? change(ig.reach, ig.previousReach) : data && notConnected}
        deltaLabel={ig ? t.kpi.vsPrevious : undefined}
      />
      <StatTile
        label={t.kpi.followers}
        loading={loading}
        value={ig ? fmtNumber(ig.followers) : '—'}
        delta={
          ig
            ? { text: fmtSigned(ig.followersChange), trend: ig.followersChange > 0 ? 'up' : ig.followersChange < 0 ? 'down' : 'flat' }
            : data && notConnected
        }
        deltaLabel={ig ? t.kpi.inPeriod : undefined}
      />
      <StatTile
        label={t.kpi.campaigns}
        loading={loading}
        value={ads ? fmtNumber(ads.activeCampaigns) : '—'}
        delta={ads ? { text: t.kpi.spend(fmtMoney(ads.spend, ads.currency)), trend: 'flat' } : data && notConnected}
      />
      <StatTile
        label={t.kpi.leads}
        loading={loading}
        value={fmtNumber(data?.leads.total ?? 0)}
        delta={data && change(data.leads.total, data.leads.previous)}
        deltaLabel={t.kpi.vsPrevious}
      />
    </div>
  );
}

function GoalsCard({ goals, loading }: { goals: GoalDto[] | undefined; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.goals.title}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/marketing/goals" />}>
            {t.goals.all} <ArrowRightIcon aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading || !goals ? (
          <Skeleton className="h-40" />
        ) : goals.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-start gap-3 text-sm">
            {t.goals.empty}
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/marketing/goals" />}>
              {t.goals.create}
            </Button>
          </div>
        ) : (
          <ul className="grid gap-4">
            {goals.map((g) => (
              <li key={g.id} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium" title={g.name}>
                    {g.name}
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {fmtNumber(g.current)} / {fmtNumber(g.target)} · {g.percent}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={g.name}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={g.percent}
                  className="bg-muted h-2 overflow-hidden rounded-full"
                >
                  <div
                    className={cn('h-full rounded-full', g.status === 'upcoming' ? 'bg-muted-foreground/40' : 'bg-primary')}
                    style={{ width: `${g.percent}%` }}
                  />
                </div>
                <span className="text-muted-foreground text-xs">
                  {uz.goals.types[g.type]} ·{' '}
                  {g.status === 'upcoming' ? uz.goals.statuses.upcoming : uz.goals.daysLeft(g.daysLeft)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ContentWeekCard({ week, loading }: { week: DashboardDto['contentWeek'] | undefined; loading: boolean }) {
  const done = week && week.total ? Math.round((week.published / week.total) * 100) : 0;
  const cells = week && [
    { label: t.content.planned, value: week.total },
    { label: t.content.published, value: week.published },
    { label: t.content.pending, value: week.scheduled },
    { label: t.content.missed, value: week.missed + week.failed },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.content.title}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/marketing/content?view=week" />}>
            {t.content.open} <ArrowRightIcon aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading || !week || !cells ? (
          <Skeleton className="h-40" />
        ) : week.total === 0 ? (
          <p className="text-muted-foreground text-sm">{t.content.empty}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {cells.map((c) => (
                <div key={c.label} className="grid gap-0.5">
                  <dt className="text-muted-foreground text-xs">{c.label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{fmtNumber(c.value)}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-1.5">
              <div
                role="progressbar"
                aria-label={t.content.progress(week.published, week.total)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={done}
                className="bg-muted h-2 overflow-hidden rounded-full"
              >
                <div className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500" style={{ width: `${done}%` }} />
              </div>
              <span className="text-muted-foreground text-xs">{t.content.progress(week.published, week.total)}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
