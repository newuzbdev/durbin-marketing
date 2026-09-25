'use client';

import { PauseIcon, PlayIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { AdCampaignDto, CampaignStatus } from '@durbin/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtMoney, fmtNumber } from '@/lib/format';
import { useSetCampaignStatus } from '@/lib/queries/ads';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';
import { errorMessage } from './connection';

const t = uz.ads;

const STATUS_BADGE: Record<CampaignStatus, string> = {
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
  PAUSED: '',
  ARCHIVED: '',
  DELETED: '',
};

export function CampaignsTable({
  campaigns,
  currency,
  canManage,
}: {
  campaigns: AdCampaignDto[];
  currency: string;
  canManage: boolean;
}) {
  const setStatus = useSetCampaignStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.campaigns.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-56">{t.campaigns.name}</TableHead>
                <TableHead>{t.campaigns.status}</TableHead>
                <TableHead>{t.campaigns.objective}</TableHead>
                <TableHead className="text-right">{t.campaigns.budget}</TableHead>
                <TableHead className="text-right">{t.campaigns.spend}</TableHead>
                <TableHead className="text-right">{t.campaigns.clicks}</TableHead>
                <TableHead className="text-right">{t.campaigns.reach}</TableHead>
                <TableHead className="text-right">{t.campaigns.ctr}</TableHead>
                <TableHead className="text-right">{t.campaigns.leads}</TableHead>
                {canManage && <TableHead className="w-32" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const controllable = c.status === 'ACTIVE' || c.status === 'PAUSED';
                const next = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
                const busy = setStatus.isPending && setStatus.variables?.id === c.id;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-72 truncate font-medium" title={c.name}>
                      {c.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(STATUS_BADGE[c.status])}>
                        {t.statuses[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {t.objectives[c.objective] ?? c.objective}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {c.dailyBudget ? fmtMoney(c.dailyBudget, currency) : '—'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{fmtMoney(c.spend, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.reach === null ? '—' : fmtNumber(c.reach)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(c.leads)}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {controllable && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              setStatus.mutate(
                                { id: c.id, status: next },
                                {
                                  onSuccess: () => toast.success(next === 'PAUSED' ? t.campaigns.paused : t.campaigns.resumed),
                                  onError: (err) => toast.error(errorMessage(err)),
                                },
                              )
                            }
                          >
                            {c.status === 'ACTIVE' ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
                            {c.status === 'ACTIVE' ? t.campaigns.pause : t.campaigns.resume}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {campaigns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground py-8 text-center">
                    {t.campaigns.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
