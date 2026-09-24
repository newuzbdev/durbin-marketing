'use client';

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { TableIcon, LineChartIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtCompact, fmtDayShort, fmtNumber } from '@/lib/format';
import { uz } from '@/messages/uz';

/**
 * Bitta seriyali vaqt grafigi (dataviz: bitta o'q, bitta seriya — legend yo'q, sarlavha nomlaydi).
 * Rang: --chart-1 (validatsiyadan o'tgan palitra, 1-slot). Jadval ko'rinishi har doim mavjud.
 */
export function MetricChart({
  title,
  data,
  dataKey,
  zeroBased = true,
}: {
  title: string;
  data: { date: string; [key: string]: number | string }[];
  dataKey: string;
  /** Followerlar kabi katta, sekin o'zgaruvchi qiymatlar uchun false — o'q ma'lumotga moslashadi */
  zeroBased?: boolean;
}) {
  const [asTable, setAsTable] = useState(false);
  const config = { [dataKey]: { label: title, color: 'var(--chart-1)' } } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={uz.instagram.charts.tableView}
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? <LineChartIcon /> : <TableIcon />}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {asTable ? (
          <div className="max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{uz.instagram.charts.date}</TableHead>
                  <TableHead className="text-right">{title}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{fmtDayShort(d.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(Number(d[dataKey]))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-64 w-full">
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={fmtDayShort}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={fmtCompact}
                domain={zeroBased ? [0, 'auto'] : ['dataMin - 5', 'dataMax + 5']}
                allowDecimals={false}
              />
              <ChartTooltip
                cursor={{ strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_, payload) => fmtDayShort(String(payload?.[0]?.payload?.date ?? ''))}
                    formatter={(value) => (
                      <span className="text-foreground font-medium tabular-nums">{fmtNumber(Number(value))}</span>
                    )}
                  />
                }
              />
              <Line
                dataKey={dataKey}
                type="monotone"
                stroke={`var(--color-${dataKey})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
