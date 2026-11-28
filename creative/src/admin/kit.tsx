/**
 * The admin's building blocks, after the Chronicle dashboard kit (shadcnstore, MIT, via 21st.dev): a soft card for each widget,
 * its big monospace figure with the change against the period before, a segmented switch, and CSV export.
 */
import { ChevronDownIcon, ChevronUpIcon, DownloadIcon, type Icon as IconType } from '@/components/icons';
import { cn } from '@/lib/utils';

export function Widget({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('admin-rise flex flex-col gap-4 rounded-2xl bg-card py-5 shadow-[var(--surface-shadow)] ring-1 ring-foreground/5', className)}>{children}</section>;
}

export function WidgetHeader({ title, icon: Icon, action, className }: { title: React.ReactNode; icon?: IconType; action?: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-start justify-between gap-2 px-5', className)}>
    <h2 className="m-0 flex items-center gap-2 text-base font-medium">{Icon && <Icon className="size-4 text-[var(--chart-lead)]" aria-hidden="true" />}{title}</h2>
    {action && <div className="-my-1 flex items-center gap-1">{action}</div>}
  </div>;
}

/** The change from `before` to `now` (0.12 is 12% up), or null when there was nothing before to compare with. */
export const change = (now: number, before: number) => (before === 0 ? (now === 0 ? 0 : null) : (now - before) / before);

/** ↑ 12% in green or ↓ 4% in red; `invert` where down is good (failures, refunds). */
export function Delta({ value, invert = false, className }: { value: number | null | undefined; invert?: boolean; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cn('text-xs text-muted-foreground', className)}>new</span>;
  const up = value >= 0;
  const good = value === 0 || (invert ? !up : up);
  const Arrow = up ? ChevronUpIcon : ChevronDownIcon;
  return <span className={cn('inline-flex items-center gap-0.5 text-sm font-medium tabular-nums', good ? 'text-[var(--success)]' : 'text-destructive', className)}>
    <Arrow className="size-3.5" aria-hidden="true" />{formatPercent(Math.abs(value))}
  </span>;
}

export function WidgetValue({ value, delta, invert, caption, size = 'lg' }: { value: React.ReactNode; delta?: number | null; invert?: boolean; caption?: React.ReactNode; size?: 'md' | 'lg' }) {
  return <div className="flex flex-col gap-1 px-5">
    <span className={cn('font-mono font-semibold tracking-tight tabular-nums', size === 'lg' ? 'text-3xl' : 'text-2xl')}>{value}</span>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {delta !== undefined && <Delta value={delta} invert={invert} />}
      {caption && <span className="font-mono text-xs text-muted-foreground tabular-nums">{caption}</span>}
    </div>
  </div>;
}

/** A small card: what it is, the figure, its change and one line under it; `children` (a mini chart) sits on the right. */
export function StatCard({ title, icon, value, delta, invert, caption, href, children }: {
  title: string; icon?: IconType; value: string; delta?: number | null; invert?: boolean; caption?: string; href?: string; children?: React.ReactNode;
}) {
  const body = <>
    <WidgetHeader title={<span className="text-sm">{title}</span>} icon={icon} />
    <div className="flex items-end justify-between gap-2">
      <WidgetValue value={value} delta={delta} invert={invert} caption={caption} size="md" />
      {children && <div className="h-12 w-[42%] shrink-0 pr-5">{children}</div>}
    </div>
  </>;
  return href
    ? <a href={href} className="admin-rise flex flex-col gap-3 rounded-2xl bg-card py-5 text-foreground no-underline shadow-[var(--surface-shadow)] ring-1 ring-foreground/5 transition-shadow hover:shadow-[var(--surface-shadow-hover)]">{body}</a>
    : <section className="admin-rise flex flex-col gap-3 rounded-2xl bg-card py-5 shadow-[var(--surface-shadow)] ring-1 ring-foreground/5">{body}</section>;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-muted p-1">
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} onClick={() => onChange(option.value)}
      className={cn('cursor-pointer rounded-full border-0 px-3 py-1 text-xs font-medium transition-colors', option.value === value ? 'bg-card text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground')}>
      {option.label}
    </button>)}
  </div>;
}

export function CsvButton({ onClick, label = 'CSV' }: { onClick: () => void; label?: string }) {
  return <button type="button" onClick={onClick} title="Download as CSV"
    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted">
    <DownloadIcon className="size-3.5" aria-hidden="true" />{label}
  </button>;
}

/** Download rows as a CSV file; values are quoted so commas, quotes and line breaks survive, and Excel reads it as UTF-8. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const quote = (value: string | number | boolean | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [header, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', body], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const formatPercent = (value: number) => `${(value * 100).toFixed(value !== 0 && Math.abs(value) < 0.1 ? 1 : 0)}%`;
export const formatMoney = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
};
export const formatSeconds = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return '–';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
};
/** Dates are shown in the admin's own time zone, as the computer reads them. */
export const formatDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
export const formatDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
