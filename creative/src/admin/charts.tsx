/** The admin's charts, after the Chronicle dashboard kit: a glowing area for a trend, rounded pill bars, a sparkline and a ranked list. */
import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from './kit';

export type Point = { label: string; title?: string; [series: string]: number | string | undefined };
export type Series = { key: string; label: string; color: string };

function TipBox({ active, payload, label, series, format }: {
  active?: boolean; payload?: { dataKey?: string | number; value?: number; payload?: Point }[]; label?: string; series: Series[]; format: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return <div className="min-w-36 rounded-xl bg-popover px-3 py-2 text-xs shadow-lg ring-1 ring-foreground/10">
    <p className="m-0 mb-1 font-medium">{point?.title ?? label}</p>
    {payload.map(entry => {
      const line = series.find(item => item.key === entry.dataKey);
      return <p key={String(entry.dataKey)} className="m-0 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full" style={{ background: line?.color }} />{line?.label}</span>
        <span className="font-mono font-medium tabular-nums">{format(Number(entry.value ?? 0))}</span>
      </p>;
    })}
  </div>;
}

/** One or more lines over time, each a soft gradient area; the first is the lead. */
export function TrendArea({ data, series, format = formatNumber, height = 260 }: { data: Point[]; series: Series[]; format?: (value: number) => string; height?: number }) {
  const id = useId().replace(/:/g, '');
  return <div style={{ height }} className="px-2">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>{series.map(line => <linearGradient key={line.key} id={`${id}-${line.key}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={line.color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={line.color} stopOpacity={0} />
        </linearGradient>)}</defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickFormatter={value => format(Number(value))} allowDecimals={false} />
        <Tooltip cursor={{ stroke: 'var(--border)' }} content={props => <TipBox {...(props as object)} series={series} format={format} />} />
        {series.map(line => <Area key={line.key} type="monotone" dataKey={line.key} stroke={line.color} strokeWidth={2} fill={`url(#${id}-${line.key})`} dot={false} activeDot={{ r: 4 }} />)}
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

/** Fully rounded bars; the last (today) is in full colour and glows, the rest sit back in a tint. */
export function PillBars({ data, dataKey, color = 'var(--chart-lead)', format = formatNumber, height = 220, label }: {
  data: Point[]; dataKey: string; color?: string; format?: (value: number) => string; height?: number; label: string;
}) {
  const id = useId().replace(/:/g, '');
  const highlight = data.reduce((best, point, index) => (Number(point[dataKey] ?? 0) > Number(data[best]?.[dataKey] ?? 0) ? index : best), 0);
  return <div style={{ height }} className="px-2">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 12, right: 12, left: 12, bottom: 0 }}>
        <defs><filter id={`glow-${id}`} x="-50%" y="-20%" width="200%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor={color} floodOpacity={0.45} /></filter></defs>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
        <Tooltip cursor={false} content={props => <TipBox {...(props as object)} series={[{ key: dataKey, label, color }]} format={format} />} />
        <Bar dataKey={dataKey} radius={999} maxBarSize={22} minPointSize={3}>
          {data.map((point, index) => <Cell key={point.label + index} fill={color} fillOpacity={index === highlight ? 1 : 0.3} filter={index === highlight ? `url(#glow-${id})` : undefined} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

/** A tiny line for a stat card. */
export function Sparkline({ values, color = 'var(--chart-lead)' }: { values: number[]; color?: string }) {
  const id = useId().replace(/:/g, '');
  const data = values.map((value, index) => ({ index, value }));
  return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 2 }}>
      <defs><linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={`url(#spark-${id})`} dot={false} isAnimationActive={false} />
    </AreaChart>
  </ResponsiveContainer>;
}

/** Ranked rows with a bar behind each, largest first (clicks by platform, views by country…). */
export function BarList({ rows, format = formatNumber, empty = 'Nothing yet.' }: { rows: { label: string; value: number }[]; format?: (value: number) => string; empty?: string }) {
  const top = Math.max(1, ...rows.map(row => row.value));
  if (!rows.length) return <p className="m-0 px-5 text-sm text-muted-foreground">{empty}</p>;
  return <ul className="m-0 flex list-none flex-col gap-1.5 px-5 py-0">
    {rows.map(row => <li key={row.label} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-lg px-2.5 py-1.5 text-sm">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 rounded-lg bg-[var(--chart-lead)]/15" style={{ width: `${(row.value / top) * 100}%` }} />
      <span className="relative truncate">{row.label}</span>
      <span className="relative font-mono tabular-nums">{format(row.value)}</span>
    </li>)}
  </ul>;
}
