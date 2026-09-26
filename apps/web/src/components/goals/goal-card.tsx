'use client';

import { format, parseISO } from 'date-fns';
import { uz as uzLocale } from 'date-fns/locale';
import { CalendarIcon, CircleAlertIcon, EllipsisIcon, InfoIcon, PencilIcon, Trash2Icon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import type { GoalDto, GoalStatus, LeadSource } from '@durbin/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fmtNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { uz } from '@/messages/uz';

const t = uz.goals;
/** YYYY-MM-DD → "14-may" (mahalliy kun, UTC siljishisiz) */
export const fmtGoalDay = (iso: string) => format(parseISO(iso), 'd MMMM', { locale: uzLocale });

const BAR: Record<GoalStatus, string> = {
  upcoming: 'bg-muted-foreground/40',
  active: 'bg-primary',
  achieved: 'bg-emerald-600 dark:bg-emerald-500',
  missed: 'bg-red-600 dark:bg-red-500',
};

const STATUS_BADGE: Record<GoalStatus, string> = {
  upcoming: '',
  active: '',
  achieved: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
  missed: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-100',
};

interface Props {
  goal: GoalDto;
  canManage: boolean;
  onEdit: (goal: GoalDto) => void;
  onDelete: (goal: GoalDto) => void;
}

export function GoalCard({ goal, canManage, onEdit, onDelete }: Props) {
  const unit = t.units[goal.type];
  const behind = goal.status === 'active' ? goal.expected - goal.current : 0;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{t.types[goal.type]}</Badge>
            {goal.status !== 'active' && (
              <Badge variant="outline" className={STATUS_BADGE[goal.status]}>
                {t.statuses[goal.status]}
              </Badge>
            )}
          </div>
          <CardTitle className="truncate text-base" title={goal.name}>
            {goal.name}
          </CardTitle>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} />}>
              <EllipsisIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit(goal)}>
                <PencilIcon aria-hidden /> {t.edit}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(goal)}>
                <Trash2Icon aria-hidden /> {t.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="tabular-nums">
            <span className="text-2xl font-semibold tracking-tight">{fmtNumber(goal.current)}</span>
            <span className="text-muted-foreground"> / {fmtNumber(goal.target)}</span>
          </p>
          <span className="text-sm font-medium tabular-nums">{goal.percent}%</span>
        </div>

        <div
          role="progressbar"
          aria-label={goal.name}
          aria-valuemin={0}
          aria-valuemax={goal.target}
          aria-valuenow={Math.min(goal.current, goal.target)}
          aria-valuetext={`${fmtNumber(goal.current)} / ${fmtNumber(goal.target)} — ${goal.percent}%`}
          className="bg-muted relative h-2 w-full overflow-hidden rounded-full"
        >
          <div className={cn('h-full rounded-full transition-all', BAR[goal.status])} style={{ width: `${goal.percent}%` }} />
          {/* Tekis sur'at bo'yicha "bugun shu yerda bo'lishi kerak" belgisi */}
          {goal.status === 'active' && goal.expected < goal.target && (
            <div
              className="bg-foreground/60 absolute top-0 h-full w-0.5"
              style={{ left: `${(goal.expected / goal.target) * 100}%` }}
              aria-hidden
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {goal.status === 'achieved' ? t.done : t.remaining(fmtNumber(goal.remaining), unit)}
          </span>
          {goal.status === 'active' && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                behind > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400',
              )}
            >
              {behind > 0 ? (
                <TrendingDownIcon className="size-3.5" aria-hidden />
              ) : (
                <TrendingUpIcon className="size-3.5" aria-hidden />
              )}
              {behind > 0 ? t.behind(fmtNumber(behind), unit) : t.onTrack}
            </span>
          )}
        </div>

        {goal.bySource && Object.keys(goal.bySource).length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t.leads.source}>
            {(Object.entries(goal.bySource) as [LeadSource, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([source, n]) => (
                <li key={source} className="bg-muted rounded-md px-1.5 py-0.5 text-xs">
                  {t.leads.sources[source]}: <span className="font-medium tabular-nums">{fmtNumber(n)}</span>
                </li>
              ))}
          </ul>
        )}

        {goal.type === 'REACH' && !goal.dataMissing && (
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <InfoIcon className="size-3" aria-hidden /> {t.reachNote}
          </p>
        )}
        {goal.dataMissing && (
          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            {t.dataMissing[goal.type]}
          </p>
        )}

        <div className="text-muted-foreground mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3 text-xs">
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3.5" aria-hidden />
            {fmtGoalDay(goal.startDate)} — {fmtGoalDay(goal.endDate)}
          </span>
          <span>
            {goal.status === 'upcoming'
              ? t.startsIn(fmtGoalDay(goal.startDate))
              : goal.status === 'active'
                ? t.daysLeft(goal.daysLeft)
                : t.ended(fmtGoalDay(goal.endDate))}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
