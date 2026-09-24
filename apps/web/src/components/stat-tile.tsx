import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Katta raqamli KPI kartasi. O'zgarish belgisi rang + ikonka + matn bilan (faqat rang emas). */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  loading,
}: {
  label: string;
  value: string;
  /** Masalan "+12%" yoki "+34"; musbat/manfiyligi `trend` bilan */
  delta?: { text: string; trend: 'up' | 'down' | 'flat' } | null;
  deltaLabel?: string;
  loading?: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-sm">{label}</span>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        )}
        {delta && !loading && (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                delta.trend === 'up' && 'text-emerald-700 dark:text-emerald-400',
                delta.trend === 'down' && 'text-red-700 dark:text-red-400',
              )}
            >
              {delta.trend === 'up' && <ArrowUpRightIcon className="size-3.5" aria-hidden />}
              {delta.trend === 'down' && <ArrowDownRightIcon className="size-3.5" aria-hidden />}
              {delta.text}
            </span>
            {deltaLabel}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
