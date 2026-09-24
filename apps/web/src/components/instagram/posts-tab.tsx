'use client';

import { useState } from 'react';
import type { IgMediaDto, Period } from '@durbin/shared';
import { BookmarkIcon, ExternalLinkIcon, EyeIcon, HeartIcon, MessageCircleIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate, fmtNumber } from '@/lib/format';
import { useInstagramMedia, useTopMedia } from '@/lib/queries/instagram';
import { uz } from '@/messages/uz';

const t = uz.instagram.posts;

export function PostsTab({ period }: { period: Period }) {
  const top = useTopMedia(period, true);
  const [page, setPage] = useState(1);
  const media = useInstagramMedia(page, true);
  const pages = media.data ? Math.max(1, Math.ceil(media.data.total / media.data.pageSize)) : 1;

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h2 className="font-medium">{t.top}</h2>
        {top.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : top.data?.length ? (
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {top.data.map((m, i) => (
              <li key={m.id}>
                <TopPostCard media={m} rank={i + 1} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">{t.topEmpty}</p>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t.all}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.type}</TableHead>
                  <TableHead>{t.date}</TableHead>
                  <TableHead className="min-w-64">{t.caption}</TableHead>
                  <TableHead className="text-right">{t.reach}</TableHead>
                  <TableHead className="text-right">{t.likes}</TableHead>
                  <TableHead className="text-right">{t.comments}</TableHead>
                  <TableHead className="text-right">{t.saves}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {media.data?.items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge variant="secondary">{uz.instagram.mediaTypes[m.type]}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(m.postedAt)}</TableCell>
                    <TableCell className="max-w-md truncate">
                      {m.permalink ? (
                        <a href={m.permalink} target="_blank" rel="noreferrer" className="hover:underline">
                          {m.caption || '—'}
                        </a>
                      ) : (
                        m.caption || '—'
                      )}
                    </TableCell>
                    <Num value={m.reach} />
                    <Num value={m.likes} />
                    <Num value={m.comments} />
                    <Num value={m.saves} />
                  </TableRow>
                ))}
                {media.data && media.data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                      {t.empty}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t.prev}
              </Button>
              <span className="text-muted-foreground tabular-nums">
                {page} / {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                {t.next}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Num({ value }: { value: number }) {
  return <TableCell className="text-right tabular-nums">{fmtNumber(value)}</TableCell>;
}

function TopPostCard({ media, rank }: { media: IgMediaDto; rank: number }) {
  return (
    <Card size="sm" className="h-full">
      {media.thumbnailUrl && (
        // Instagram CDN rasmlari — next/image domen sozlamasisiz oddiy <img>
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.thumbnailUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
      )}
      <CardContent className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs font-medium tabular-nums">#{rank}</span>
          <Badge variant="secondary">{uz.instagram.mediaTypes[media.type]}</Badge>
        </div>
        <p className="line-clamp-2 min-h-10 text-sm">{media.caption || '—'}</p>
        <div className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <Metric icon={EyeIcon} label={t.reach} value={media.reach} strong />
          <Metric icon={HeartIcon} label={t.likes} value={media.likes} />
          <Metric icon={MessageCircleIcon} label={t.comments} value={media.comments} />
          <Metric icon={BookmarkIcon} label={t.saves} value={media.saves} />
        </div>
        <span className="text-muted-foreground text-xs">{fmtDate(media.postedAt)}</span>
        {media.permalink && (
          <a
            href={media.permalink}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            <ExternalLinkIcon className="size-3" /> {t.open}
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  strong,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <span className="flex items-center gap-1" title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}:</span>
      <span className={strong ? 'text-foreground font-medium tabular-nums' : 'tabular-nums'}>{fmtNumber(value)}</span>
    </span>
  );
}
