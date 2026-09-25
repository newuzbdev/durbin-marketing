'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { fromMinor, type AdTotals, type Period } from '@durbin/shared';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AdsAccountBar, ConnectAdsCard, SelectAdAccountDialog } from '@/components/ads/connection';
import { CampaignFormDialog } from '@/components/ads/campaign-form-dialog';
import { CampaignsTable } from '@/components/ads/campaigns-table';
import { MockNotice } from '@/components/instagram/connection';
import { MetricChart } from '@/components/instagram/metric-chart';
import { useAuth } from '@/lib/auth';
import { fmtMoney, fmtNumber, pctChange } from '@/lib/format';
import { SyncBanner } from '@/components/sync-banner';
import { useAdsConnection, useAdsOverview, useSyncAds } from '@/lib/queries/ads';
import { useSyncState } from '@/lib/queries/instagram';
import { uz } from '@/messages/uz';

const t = uz.ads;
const PERIOD_OPTIONS: Period[] = ['this_month', 'last_7d', 'last_30d', 'last_month'];

export default function AdsPage() {
  // useSearchParams statik prerender'da Suspense talab qiladi
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AdsView />
    </Suspense>
  );
}

/** Sarf ko'payishi "yaxshi" yoki "yomon" emas — faqat o'zgarish ko'rsatiladi, rangsiz */
function change(current: number, previous: number, colored = true) {
  const p = pctChange(current, previous);
  if (p === null) return null;
  const trend = !colored || p === 0 ? ('flat' as const) : p > 0 ? ('up' as const) : ('down' as const);
  return { text: `${p > 0 ? '+' : ''}${p}%`, trend };
}

function ctrChange(cur: AdTotals, prev: AdTotals) {
  if (!prev.impressions) return null;
  const diff = Math.round((cur.ctr - prev.ctr) * 100) / 100;
  return { text: `${diff > 0 ? '+' : ''}${diff.toFixed(2)} p.p.`, trend: diff > 0 ? ('up' as const) : diff < 0 ? ('down' as const) : ('flat' as const) };
}

function AdsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { school } = useAuth();
  const canManage = school?.role !== 'VIEWER';
  const connection = useAdsConnection();
  const sync = useSyncAds();
  const syncState = useSyncState('ADS');
  const [formOpen, setFormOpen] = useState(false);

  const period: Period = PERIOD_OPTIONS.includes(params.get('period') as Period)
    ? (params.get('period') as Period)
    : 'this_month';
  const selectionId = params.get('select');
  const conn = connection.data;
  const overview = useAdsOverview(period, !!conn && !syncState.firstSync);
  const data = overview.data;

  function setParams(update: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(update)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // OAuth natijasi (?connected=1 / ?error=...) — bir marta
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    const error = params.get('error');
    if (params.get('connected')) {
      handled.current = true;
      toast.success(t.connected);
      sync.mutate();
      setParams({ connected: null });
    } else if (error) {
      handled.current = true;
      toast.error(t.errors[error] ?? uz.instagram.errors[error] ?? uz.common.error);
      setParams({ error: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const currency = data?.currency ?? conn?.currency ?? 'USD';

  return (
    <>
      <PageHeader
        title={uz.nav.ads}
        description={t.description}
        actions={
          conn && (
            <>
              <AdsAccountBar connection={conn} />
              {canManage && (
                <Button onClick={() => setFormOpen(true)}>
                  <PlusIcon aria-hidden /> {t.form.newCampaign}
                </Button>
              )}
            </>
          )
        }
      />
      <MockNotice />
      {conn && syncState.syncing && (
        <SyncBanner text={syncState.firstSync ? uz.common.firstSync : uz.common.syncing} />
      )}

      {connection.isLoading ? (
        <Skeleton className="h-64" />
      ) : !conn ? (
        <ConnectAdsCard />
      ) : (
        <div className="grid gap-4">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[period]}
            onValueChange={(v: unknown[]) => {
              const next = v[0] as Period | undefined;
              if (next) setParams({ period: next === 'this_month' ? null : next });
            }}
            className="justify-self-end"
          >
            {PERIOD_OPTIONS.map((p) => (
              <ToggleGroupItem key={p} value={p}>
                {uz.periods[p]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label={t.kpi.spend}
              loading={!data}
              value={data ? fmtMoney(data.totals.spend, currency) : ''}
              delta={data && change(data.totals.spend, data.previousTotals.spend, false)}
              deltaLabel={t.kpi.vsPrevious}
            />
            <StatTile
              label={t.kpi.clicks}
              loading={!data}
              value={fmtNumber(data?.totals.clicks ?? 0)}
              delta={data && change(data.totals.clicks, data.previousTotals.clicks)}
              deltaLabel={t.kpi.vsPrevious}
            />
            <StatTile
              label={t.kpi.reach}
              loading={!data}
              value={data?.totals.reach === null || !data ? '—' : fmtNumber(data.totals.reach)}
              delta={
                data && data.totals.reach !== null && data.previousTotals.reach !== null
                  ? change(data.totals.reach, data.previousTotals.reach)
                  : null
              }
              deltaLabel={t.kpi.vsPrevious}
            />
            <StatTile
              label={t.kpi.ctr}
              loading={!data}
              value={`${(data?.totals.ctr ?? 0).toFixed(2)}%`}
              delta={data && ctrChange(data.totals, data.previousTotals)}
              deltaLabel={t.kpi.vsPrevious}
            />
          </div>

          {/* Sarf va kliklar masshtabi har xil — ikkita alohida grafik */}
          <div className="grid gap-4 xl:grid-cols-2">
            {data ? (
              <>
                <MetricChart
                  title={`${t.charts.spend} (${currency === 'UZS' ? "so'm" : currency})`}
                  data={data.series.map((s) => ({ date: s.date, spend: Math.round(fromMinor(s.spend, currency)) }))}
                  dataKey="spend"
                />
                <MetricChart title={t.charts.clicks} data={data.series} dataKey="clicks" />
              </>
            ) : (
              <>
                <Skeleton className="h-80" />
                <Skeleton className="h-80" />
              </>
            )}
          </div>

          {data ? (
            <CampaignsTable campaigns={data.campaigns} currency={currency} canManage={canManage} />
          ) : (
            <Skeleton className="h-64" />
          )}
        </div>
      )}

      {conn && <CampaignFormDialog open={formOpen} onOpenChange={setFormOpen} currency={currency} />}
      {selectionId && <SelectAdAccountDialog selectionId={selectionId} onDone={() => setParams({ select: null })} />}
    </>
  );
}
