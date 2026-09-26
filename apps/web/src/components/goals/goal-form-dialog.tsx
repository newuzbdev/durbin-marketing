'use client';

import { useId, useState } from 'react';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { GOAL_TYPES, type GoalDto, type GoalType } from '@durbin/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiError } from '@/lib/api';
import { useCreateGoal, useUpdateGoal } from '@/lib/queries/goals';
import { uz } from '@/messages/uz';

const t = uz.goals;
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: GoalDto | null;
}

export function GoalFormDialog({ open, onOpenChange, goal }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <GoalForm goal={goal} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({ goal, onDone }: { goal?: GoalDto | null; onDone: () => void }) {
  const ids = useId();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const now = new Date();

  const [name, setName] = useState(goal?.name ?? '');
  const [type, setType] = useState<GoalType>(goal?.type ?? 'LEAD');
  const [target, setTarget] = useState(goal ? String(goal.target) : '');
  const [startDate, setStartDate] = useState(goal?.startDate ?? iso(startOfMonth(now)));
  const [endDate, setEndDate] = useState(goal?.endDate ?? iso(endOfMonth(now)));
  const [error, setError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  function setMonth(offset: number) {
    const m = addMonths(now, offset);
    setStartDate(iso(startOfMonth(m)));
    setEndDate(iso(endOfMonth(m)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(target);
    if (!name.trim()) return setError(t.errors.name);
    if (!Number.isInteger(n) || n <= 0) return setError(t.errors.target);
    if (endDate < startDate) return setError(t.errors.dates);

    const input = { name: name.trim(), type, target: n, startDate, endDate };
    try {
      if (goal) await update.mutateAsync({ id: goal.id, ...input });
      else await create.mutateAsync(input);
      toast.success(goal ? t.form.saved : t.form.created);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : uz.common.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{goal ? t.form.editTitle : t.form.createTitle}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor={`${ids}-name`}>{t.form.name}</Label>
        <Input
          id={`${ids}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.form.namePlaceholder}
          maxLength={200}
        />
      </div>

      <div className="grid gap-2">
        <Label>{t.form.type}</Label>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[type]}
          onValueChange={(v: unknown[]) => v[0] && setType(v[0] as GoalType)}
          aria-label={t.form.type}
          className="flex-wrap"
        >
          {GOAL_TYPES.map((gt) => (
            <ToggleGroupItem key={gt} value={gt}>
              {t.types[gt]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {type !== 'LEAD' && <p className="text-muted-foreground text-xs">{t.dataMissing[type]}</p>}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${ids}-target`}>
          {t.form.target} ({t.units[type]})
        </Label>
        <Input
          id={`${ids}-target`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="1000"
        />
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-start`}>{t.form.startDate}</Label>
            <DatePicker id={`${ids}-start`} value={startDate} onChange={setStartDate} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-end`}>{t.form.endDate}</Label>
            <DatePicker id={`${ids}-end`} min={startDate} value={endDate} onChange={setEndDate} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="xs" onClick={() => setMonth(0)}>
            {t.form.thisMonth}
          </Button>
          <Button type="button" variant="outline" size="xs" onClick={() => setMonth(1)}>
            {t.form.nextMonth}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{uz.common.cancel}</DialogClose>
        <Button type="submit" disabled={saving}>
          {saving ? uz.common.loading : uz.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
