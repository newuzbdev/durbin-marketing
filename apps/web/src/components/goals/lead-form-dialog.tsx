'use client';

import { useId, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { MANUAL_LEAD_SOURCES } from '@durbin/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiError } from '@/lib/api';
import { useAddLead } from '@/lib/queries/goals';
import { uz } from '@/messages/uz';

const t = uz.goals;
type Source = (typeof MANUAL_LEAD_SOURCES)[number];

export function LeadFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <LeadForm onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function LeadForm({ onDone }: { onDone: () => void }) {
  const ids = useId();
  const add = useAddLead();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [source, setSource] = useState<Source>('INSTAGRAM');
  const [count, setCount] = useState('1');
  const [date, setDate] = useState(today);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(count);
    if (!Number.isInteger(n) || n <= 0) return setError(t.errors.count);
    if (date > today) return setError(t.errors.futureDate);
    try {
      await add.mutateAsync({
        source,
        count: n,
        date,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success(t.leads.added);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : uz.common.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t.addLead}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-2">
        <Label>{t.leads.source}</Label>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[source]}
          onValueChange={(v: unknown[]) => v[0] && setSource(v[0] as Source)}
          aria-label={t.leads.source}
          className="flex-wrap"
        >
          {MANUAL_LEAD_SOURCES.map((s) => (
            <ToggleGroupItem key={s} value={s}>
              {t.leads.sources[s]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-count`}>{t.leads.count}</Label>
          <Input
            id={`${ids}-count`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-date`}>{t.leads.date}</Label>
          <Input id={`${ids}-date`} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-name`}>{t.leads.name}</Label>
            <Input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-phone`}>{t.leads.phone}</Label>
            <Input
              id={`${ids}-phone`}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={50}
              placeholder="+998"
              autoComplete="off"
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{t.leads.contactHint}</p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{uz.common.cancel}</DialogClose>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? uz.common.loading : uz.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
