'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { uz as uzLocale } from 'date-fns/locale';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { fmtNumber } from '@/lib/format';
import { useDeleteLead, useLeads } from '@/lib/queries/goals';
import { uz } from '@/messages/uz';

const t = uz.goals;

export function LeadsCard({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1);
  const leads = useLeads(page);
  const remove = useDeleteLead();
  const pages = leads.data ? Math.max(1, Math.ceil(leads.data.total / leads.data.pageSize)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.leads.title}</CardTitle>
        <CardDescription>{t.leads.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {leads.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.leads.date}</TableHead>
                  <TableHead>{t.leads.source}</TableHead>
                  <TableHead className="text-right">{t.leads.count}</TableHead>
                  <TableHead>{t.leads.contact}</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.data?.items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(parseISO(l.date), 'd MMMM yyyy', { locale: uzLocale })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t.leads.sources[l.source]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(l.count)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[l.name, l.phone].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
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
                {leads.data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                      {t.leads.empty}
                    </TableCell>
                  </TableRow>
                )}
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
