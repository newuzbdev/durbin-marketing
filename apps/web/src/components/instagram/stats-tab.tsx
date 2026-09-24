'use client';

import type { Period } from '@durbin/shared';
import { StatTile } from '@/components/stat-tile';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtNumber, fmtSigned, pctChange } from '@/lib/format';
import { useInstagramOverview } from '@/lib/queries/instagram';
import { uz } from '@/messages/uz';
import { MetricChart } from './metric-chart';

const t = uz.instagram;

function pctDelta(current: number, previous: number) {
  const p = pctChange(current, previous);
  if (p === null) return null;
  return { text: `${p > 0 ? '+' : ''}${p}%`, trend: p > 0 ? ('up' as const) : p < 0 ? ('down' as const) : ('flat' as const) };
}

export function StatsTab({ period }: { period: Period }) {
  const { data, isLoading } = useInstagramOverview(period, true);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={t.kpi.reach}
          loading={isLoading}
          value={fmtNumber(data?.totals.reach ?? 0)}
          delta={data && pctDelta(data.totals.reach, data.previousTotals.reach)}
          deltaLabel={t.kpi.vsPrevious}
        />
        <StatTile
          label={t.kpi.views}
          loading={isLoading}
          value={fmtNumber(data?.totals.views ?? 0)}
          delta={data && pctDelta(data.totals.views, data.previousTotals.views)}
          deltaLabel={t.kpi.vsPrevious}
        />
        <StatTile
          label={t.kpi.profileViews}
          loading={isLoading}
          value={fmtNumber(data?.totals.profileViews ?? 0)}
          delta={data && pctDelta(data.totals.profileViews, data.previousTotals.profileViews)}
          deltaLabel={t.kpi.vsPrevious}
        />
        <StatTile
          label={t.kpi.followers}
          loading={isLoading}
          value={fmtNumber(data?.followers.current ?? 0)}
          delta={
            data && {
              text: fmtSigned(data.followers.change),
              trend: data.followers.change > 0 ? 'up' : data.followers.change < 0 ? 'down' : 'flat',
            }
          }
          deltaLabel={t.kpi.followersChange}
        />
      </div>

      {/* Reach va followerlar masshtabi har xil — ikkita alohida grafik (bitta o'q qoidasi) */}
      <div className="grid gap-4 xl:grid-cols-2">
        {data ? (
          <>
            <MetricChart title={t.charts.reach} data={data.series} dataKey="reach" />
            <MetricChart title={t.charts.followers} data={data.series} dataKey="followers" zeroBased={false} />
          </>
        ) : (
          <>
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </>
        )}
      </div>
    </div>
  );
}
