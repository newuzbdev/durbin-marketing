'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { uz as uzLocale } from 'date-fns/locale';
import { PlusIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadSource } from '@durbin/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { fmtNumber } from '@/lib/format';
import { useDeleteLead, useLeads } from '@/lib/queries/goals';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';

const t = uz.goals;

/** Manba rangi — jadvalda qayerdan kelganini bir qarashda ajratish uchun */
const SOURCE_DOT: Record<LeadSource, string> = {
  INSTAGRAM: 'bg-pink-500',
  FB_ADS: 'bg-blue-500',
  TELEGRAM: 'bg-sky-500',
  MANUAL: 'bg-muted-foreground/50',
  WEBHOOK: 'bg-violet-500',
};

export function LeadsCard({
  canManage,
  onAdd,
  className,
}: {
  canManage: boolean;
  onAdd: () => void;
  className?: string;
}) {
  const [page, setPage] = useState(1);
  const leads = useLeads(page);
  const remove = useDeleteLead();
  const pages = leads.data ? Math.max(1, Math.ceil(leads.data.total / leads.data.pageSize)) : 1;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          {t.leads.title}
          {leads.data && leads.data.total > 0 && (
            <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">{fmtNumber(leads.data.total)}</span>
          )}
        </CardTitle>
        <CardDescription>{t.leads.description}</CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onAdd}>
              <PlusIcon aria-hidden /> {t.addLead}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        {leads.isLoading ? (
          <Skeleton className="h-48" />
        ) : leads.data?.items.length === 0 ? (
          <div className="text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm">
            <UsersIcon className="size-6" aria-hidden />
            {t.leads.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.leads.contact}</TableHead>
                  <TableHead>{t.leads.source}</TableHead>
                  <TableHead>{t.leads.date}</TableHead>
                  <TableHead className="text-right">{t.leads.count}</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.data?.items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.name || l.phone ? (
                        <div className="grid">
                          <span className="font-medium">{l.name ?? l.phone}</span>
                          {l.name && l.phone && (
                            <a href={`tel:+${l.phone.replace(/\D/g, '')}`} className="text-muted-foreground text-xs tabular-nums hover:underline">
                              +{l.phone.replace(/\D/g, '')}
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1.5 font-normal">
                        <span className={cn('size-1.5 rounded-full', SOURCE_DOT[l.source])} aria-hidden />
                        {t.leads.sources[l.source]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {format(parseISO(l.date), 'd MMM yyyy', { locale: uzLocale })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(l.count)}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={t.leads.deleteLabel}
                          disabled={remove.isPending}
                          onClick={() =>
                            remove.mutate(l.id, {
                              onSuccess: () => toast.success(t.leads.deleted),
                              onError: (err) => toast.error(err instanceof ApiError ? err.message : uz.common.error),
                            })
                          }
                        >
                          <Trash2Icon aria-hidden />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {uz.instagram.posts.prev}
            </Button>
            <span className="text-muted-foreground tabular-nums">
              {page} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              {uz.instagram.posts.next}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
