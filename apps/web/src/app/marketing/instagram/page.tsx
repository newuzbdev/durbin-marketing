'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { Period } from '@durbin/shared';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AccountBar, ConnectCard, MockNotice, SelectAccountDialog } from '@/components/instagram/connection';
import { StatsTab } from '@/components/instagram/stats-tab';
import { PostsTab } from '@/components/instagram/posts-tab';
import { DmTab } from '@/components/instagram/dm-tab';
import { SyncBanner } from '@/components/sync-banner';
import { useInstagramConnection, useSyncInstagram, useSyncState } from '@/lib/queries/instagram';
import { uz } from '@/messages/uz';

const t = uz.instagram;
const TABS = ['stats', 'posts', 'dm'] as const;
type Tab = (typeof TABS)[number];
const PERIOD_OPTIONS: Period[] = ['last_7d', 'last_30d', 'this_month', 'last_month'];

export default function InstagramPage() {
  // useSearchParams statik prerender'da Suspense talab qiladi
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <InstagramView />
    </Suspense>
  );
}

function InstagramView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const connection = useInstagramConnection();
  const sync = useSyncInstagram();
  const syncState = useSyncState('INSTAGRAM');

  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'stats';
  const period: Period = PERIOD_OPTIONS.includes(params.get('period') as Period)
    ? (params.get('period') as Period)
    : 'last_30d';
  const selectionId = params.get('select');

  function setParams(update: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(update)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // OAuth callback natijasi (?connected=1 / ?error=...) — bir marta ko'rsatiladi
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
      toast.error(t.errors[error] ?? uz.common.error);
      setParams({ error: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const conn = connection.data;

  return (
    <>
      <PageHeader
        title={uz.nav.instagram}
        description={t.description}
        actions={conn && <AccountBar connection={conn} />}
      />
      <MockNotice />
      {conn && syncState.syncing && (
        <SyncBanner text={syncState.firstSync ? uz.common.firstSync : uz.common.syncing} />
      )}

      {connection.isLoading ? (
        <Skeleton className="h-64" />
      ) : !conn ? (
        <ConnectCard />
      ) : syncState.firstSync ? (
        // Hali hech narsa sync qilinmagan — nollar o'rniga skelet
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === 'stats' ? null : String(v) })}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="stats">{t.tabs.stats}</TabsTrigger>
              <TabsTrigger value="posts">{t.tabs.posts}</TabsTrigger>
              <TabsTrigger value="dm">{t.tabs.dm}</TabsTrigger>
            </TabsList>
            {tab !== 'dm' && (
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                value={[period]}
                onValueChange={(v: unknown[]) => {
                  const next = v[0] as Period | undefined;
                  if (next) setParams({ period: next === 'last_30d' ? null : next });
                }}
              >
                {PERIOD_OPTIONS.map((p) => (
                  <ToggleGroupItem key={p} value={p}>
                    {uz.periods[p]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </div>
          <TabsContent value="stats">
            <StatsTab period={period} />
          </TabsContent>
          <TabsContent value="posts">
            <PostsTab period={period} />
          </TabsContent>
          <TabsContent value="dm">
            <DmTab />
          </TabsContent>
        </Tabs>
      )}

      {selectionId && <SelectAccountDialog selectionId={selectionId} onDone={() => setParams({ select: null })} />}
    </>
  );
}
