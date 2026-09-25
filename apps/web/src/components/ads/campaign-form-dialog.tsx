'use client';

import { useEffect, useId, useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { InfoIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { CAMPAIGN_OBJECTIVES, toMinor, type CampaignObjective, type GeoCityDto } from '@durbin/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiError } from '@/lib/api';
import { fmtMoney } from '@/lib/format';
import { useCitySearch, useCreateCampaign } from '@/lib/queries/ads';
import { uz } from '@/messages/uz';

const t = uz.ads;
type Gender = 'all' | 'female' | 'male';
const iso = (d: Date) => format(d, 'yyyy-MM-dd');

export function CampaignFormDialog({
  open,
  onOpenChange,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {open && <CampaignForm currency={currency} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CampaignForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const ids = useId();
  const create = useCreateCampaign();
  const today = iso(new Date());

  const [name, setName] = useState('');
  const [objective, setObjective] = useState<CampaignObjective>('OUTCOME_LEADS');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(iso(addDays(new Date(), 13)));
  const [ageMin, setAgeMin] = useState('25');
  const [ageMax, setAgeMax] = useState('55');
  const [gender, setGender] = useState<Gender>('all');
  const [cities, setCities] = useState<GeoCityDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const daily = Number(budget);
  const days = endDate >= startDate ? differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1 : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const min = Number(ageMin);
    const max = Number(ageMax);
    if (!name.trim()) return setError(t.errors2.name);
    if (!Number.isFinite(daily) || daily <= 0) return setError(t.errors2.budget);
    if (startDate < today) return setError(t.errors2.past);
    if (endDate < startDate) return setError(t.errors2.dates);
    if (!(min >= 13 && max <= 65 && min <= max)) return setError(t.errors2.ages);

    try {
      await create.mutateAsync({
        name: name.trim(),
        objective,
        dailyBudget: toMinor(daily, currency),
        startDate,
        endDate,
        audience: {
          ageMin: min,
          ageMax: max,
          genders: gender === 'all' ? [] : [gender],
          cities: cities.map((c) => c.key),
        },
      });
      toast.success(t.form.created);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : uz.common.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t.form.title}</DialogTitle>
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
        <Label>{t.form.objective}</Label>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          value={[objective]}
          onValueChange={(v: unknown[]) => v[0] && setObjective(v[0] as CampaignObjective)}
          aria-label={t.form.objective}
          className="flex-wrap"
        >
          {CAMPAIGN_OBJECTIVES.map((o) => (
            <ToggleGroupItem key={o} value={o}>
              {t.objectives[o]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-muted-foreground text-xs">{t.objectiveHints[objective]}</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${ids}-budget`}>
          {t.form.budget} ({currency === 'UZS' ? "so'm" : currency})
        </Label>
        <Input
          id={`${ids}-budget`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder={currency === 'UZS' ? '100000' : '10'}
        />
        {daily > 0 && days > 0 && (
          <p className="text-muted-foreground text-xs">{t.form.total(fmtMoney(toMinor(daily * days, currency), currency), days)}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-start`}>{t.form.startDate}</Label>
          <Input id={`${ids}-start`} type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${ids}-end`}>{t.form.endDate}</Label>
          <Input id={`${ids}-end`} type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
      </div>

      <fieldset className="grid gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t.form.audience}</legend>
        <div className="flex items-end gap-2">
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-agemin`}>{t.form.ageFrom}</Label>
            <Input id={`${ids}-agemin`} type="number" min={13} max={65} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} className="w-20" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${ids}-agemax`}>{t.form.ageTo}</Label>
            <Input id={`${ids}-agemax`} type="number" min={13} max={65} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} className="w-20" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>{t.form.gender}</Label>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[gender]}
            onValueChange={(v: unknown[]) => v[0] && setGender(v[0] as Gender)}
            aria-label={t.form.gender}
          >
            {(['all', 'female', 'male'] as const).map((g) => (
              <ToggleGroupItem key={g} value={g}>
                {t.form.genders[g]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <CityPicker value={cities} onChange={setCities} />
      </fieldset>

      <p className="text-muted-foreground flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs">
        <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        {t.form.pausedNote}
      </p>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{uz.common.cancel}</DialogClose>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? uz.common.loading : t.form.create}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Meta geolokatsiya qidiruvi — tanlanganlar chip ko'rinishida */
function CityPicker({ value, onChange }: { value: GeoCityDto[]; onChange: (v: GeoCityDto[]) => void }) {
  const id = useId();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const results = useCitySearch(query);

  // Har bir harfda so'rov yubormaslik uchun
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const options = results.data?.filter((c) => !value.some((v) => v.key === c.key)) ?? [];

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t.form.cities}</Label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <li key={c.key} className="bg-muted inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-xs">
              {c.name}
              <button
                type="button"
                aria-label={t.form.cityRemove(c.name)}
                className="hover:bg-background rounded p-0.5"
                onClick={() => onChange(value.filter((v) => v.key !== c.key))}
              >
                <XIcon className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input id={id} value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.form.citySearch} autoComplete="off" />
      {query.length >= 2 && (
        <ul className="grid max-h-40 overflow-y-auto rounded-lg border">
          {results.isLoading && <li className="text-muted-foreground px-3 py-2 text-xs">{uz.common.loading}</li>}
          {!results.isLoading && options.length === 0 && (
            <li className="text-muted-foreground px-3 py-2 text-xs">{t.form.noCities}</li>
          )}
          {options.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                className="hover:bg-muted w-full px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  onChange([...value, c]);
                  setInput('');
                  setQuery('');
                }}
              >
                {c.name}
                {c.region && <span className="text-muted-foreground"> · {c.region}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">{t.form.citiesHint}</p>
    </div>
  );
}
