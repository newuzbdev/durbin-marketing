'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { uz as uzLocale } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const toIso = (d: Date) => format(d, 'yyyy-MM-dd');

/** Sana tanlash (shadcn Calendar). Qiymat — YYYY-MM-DD satr, formalar va API bilan bir xil. */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** YYYY-MM-DD — bundan oldingi kunlar tanlanmaydi */
  min?: string;
  /** YYYY-MM-DD — bundan keyingi kunlar tanlanmaydi */
  max?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const disabled = [...(min ? [{ before: parseISO(min) }] : []), ...(max ? [{ after: parseISO(max) }] : [])];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn('w-full justify-start font-normal', !selected && 'text-muted-foreground', className)}
          />
        }
      >
        <CalendarIcon aria-hidden />
        {selected ? format(selected, 'd MMMM yyyy', { locale: uzLocale }) : '—'}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={uzLocale}
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          disabled={disabled}
          onSelect={(d) => {
            if (!d) return;
            onChange(toIso(d));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
