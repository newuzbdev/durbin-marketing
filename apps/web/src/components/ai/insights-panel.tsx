'use client';

import { CircleAlertIcon, InfoIcon, RefreshCwIcon, SparklesIcon, TrendingUpIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { AiInsightKind, AiTone } from '@durbin/shared';
import { SyncBanner } from '@/components/sync-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { fmtAgo } from '@/lib/format';
import { useGenerateInsights, useInsights } from '@/lib/queries/ai';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';

const t = uz.ai;

// Rang yagona belgi emas — har bir ohangda ikonka va yozuv ham bor
const TONE: Record<AiTone, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  positive: { icon: TrendingUpIcon, className: 'text-emerald-700 dark:text-emerald-400' },
  negative: { icon: CircleAlertIcon, className: 'text-amber-700 dark:text-amber-400' },
  neutral: { icon: InfoIcon, className: 'text-muted-foreground' },
};

export function InsightsPanel({ kind, canManage }: { kind: AiInsightKind; canManage: boolean }) {
  const insights = useInsights(kind);
  const generate = useGenerateInsights(kind);
  const copy = t.insights[kind];
  const data = insights.data;

  const run = () =>
    generate.mutate(undefined, {
      onError: (err) => toast.error(err instanceof ApiError ? err.message : uz.common.error),
    });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {data ? t.insights.generatedAt(fmtAgo(data.createdAt)) : copy.empty}
        </p>
        {canManage && (
          <Button onClick={run} disabled={generate.isPending} variant={data ? 'outline' : 'default'}>
            {data ? <RefreshCwIcon className={generate.isPending ? 'animate-spin' : undefined} /> : <SparklesIcon />}
            {data ? t.insights.regenerate : copy.generate}
          </Button>
        )}
      </div>

      {generate.isPending && <SyncBanner text={t.thinking} />}

      {insights.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : data ? (
        <ul className={cn('grid gap-3 md:grid-cols-2', generate.isPending && 'opacity-50')}>
          {data.items.map((item, i) => {
            const tone = TONE[item.tone];
            return (
              <li key={i}>
                <Card size="sm" className="h-full">
                  <CardContent className="grid gap-1.5">
                    <div className="flex items-start gap-2">
                      <tone.icon className={cn('mt-0.5 size-4 shrink-0', tone.className)} aria-hidden />
                      <h3 className="font-medium">
                        {item.title}
                        <span className="sr-only"> — {t.tones[item.tone]}</span>
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.text}</p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        !generate.isPending && (
          <div className="text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center text-sm">
            <SparklesIcon className="size-6" aria-hidden />
            {copy.empty}
          </div>
        )
      )}
    </div>
  );
}
