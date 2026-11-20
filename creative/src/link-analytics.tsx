import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeftIcon, PencilIcon } from 'lucide-react';
import { CopyButton, Cover, OpenButton, iconButton, textButton } from './smart-link-parts';
import { LABELS, addressOf, linkStats, type LinkStats, type Published, type Service, type Tally } from './smart-links';

const RANGES = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 0, label: 'All time' }] as const;
const SHOWN_ROWS = 8;
const COLOURS = { views: 'var(--primary)', clicks: '#5b9cff', engagement: '#ff8a3d' } as const;
const TRAFFIC: Record<string, string> = { organic: 'Organic', meta: 'Meta ads', tiktok: 'TikTok ads', google: 'Google ads', other_ads: 'Other ads' };
const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const flag = (code: string) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1f1a5 + c.charCodeAt(0))) : '🌐');
const countryName = (code: string) => { try { return /^[A-Z]{2}$/.test(code) ? regions.of(code) ?? code : 'Unknown'; } catch { return code; } };
const percent = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(part === whole ? 0 : 1)}%` : '0%');
type Metric = 'views' | 'clicks';

/** One link's analytics: totals, the timeline and where visits and clicks came from, over a chosen range. */
export default function LinkAnalytics({ item, onBack, onEdit }: { item: Published; onBack: () => void; onEdit: () => void }) {
  const [days, setDays] = useState<number>(7);
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<Metric>('views');
  const address = addressOf(item.slug);

  useEffect(() => {
    const stop = new AbortController();
    setError('');
    linkStats(item.slug, days, stop.signal).then(setStats, (cause: Error) => { if (!stop.signal.aborted) setError(cause.message); });
    return () => stop.abort();
  }, [item.slug, days]);

  const totals = stats?.totals;
  const loading = !stats || stats.days !== days;
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={iconButton} aria-label="Back to My Smart Links" onClick={onBack}><ArrowLeftIcon className="size-4" /></button>
      <Cover src={item.link.cover} size="size-10 sm:size-12" />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-semibold">{item.link.title} · {item.link.artist}</p>
        <a href={address} target="_blank" rel="noreferrer" className="block truncate text-sm text-muted-foreground hover:text-foreground">{address.replace(/^https?:\/\//, '')}</a>
      </div>
      <CopyButton text={address} />
      <OpenButton slug={item.slug} />
      <button type="button" className={iconButton} aria-label={`Edit ${item.slug}`} onClick={onEdit}><PencilIcon className="size-4" /></button>
      <div className="w-full sm:w-auto [&>div]:justify-between">
        <Segmented label="Range" value={days} options={RANGES.map(range => ({ value: range.days, label: range.label }))} onChange={setDays} />
      </div>
    </div>

    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}

    {loading && !error && <AnalyticsSkeleton />}
    {!loading && totals && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Total visits" value={totals?.views} />
      <Kpi label="Total link clicks" value={totals?.clicks} />
      <Kpi label="Engagement" value={`${(totals.engagement * 100).toFixed(1)}%`} hint="Link clicks per visit" />
      <Kpi label="Visits from ads" value={totals?.paid_views} hint={`${percent(totals.paid_views, totals.views)} of visits`} />
    </div>}

    {!loading && <Panel title="Timeline"><Timeline daily={stats.daily} /></Panel>}

    {!loading && <div className="flex items-center justify-between gap-3">
      <p className="m-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Breakdown</p>
      <Segmented label="Count" value={metric} options={[{ value: 'views', label: 'Visits' }, { value: 'clicks', label: 'Link clicks' }]} onChange={setMetric} />
    </div>}
    {!loading && <div className="grid gap-3 md:grid-cols-2 md:[&>*:last-child:nth-child(odd)]:col-span-2">
      <Breakdown title="Streaming services" rows={stats.services} metric="clicks" note="Link clicks"
        label={row => <><img src={`/logos/${row.key}.svg`} alt="" className="size-4 shrink-0 object-contain" />{LABELS[row.key as Service] ?? row.key}</>} />
      <Breakdown title="Organic vs ads" rows={stats.traffic} metric={metric} label={row => TRAFFIC[row.key] ?? row.key} />
      <Breakdown title="Top sources" rows={stats.sources} metric={metric} note="Organic visits" label={row => row.key} />
      <Breakdown title="Top countries" rows={stats.countries} metric={metric}
        label={row => <><span aria-hidden="true">{flag(row.key)}</span>{countryName(row.key)}</>} />
      <Breakdown title="Top browsers" rows={stats.browsers} metric={metric} label={row => row.key} />
      <Breakdown title="Top devices" rows={stats.devices} metric={metric} label={row => row.key} />
      <Breakdown title="Operating systems" rows={stats.systems} metric={metric} label={row => row.key} />
    </div>}
  </div>;
}

const pulse = 'animate-pulse rounded-full bg-muted';

/** The page's shape while its figures load, so it arrives whole instead of piece by piece. */
function AnalyticsSkeleton() {
  return <div aria-busy="true" aria-label="Loading analytics" className="flex flex-col gap-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-background p-4 sm:p-5">
        <span className={`${pulse} h-7 w-16 sm:h-8`} />
        <span className={`${pulse} h-3.5 w-28`} />
      </div>)}
    </div>
    <div className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-background p-5">
      <span className={`${pulse} h-4 w-20`} />
      <span className="animate-pulse rounded-[var(--radius-control)] bg-muted" style={{ height: CHART_HEIGHT }} />
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-background p-5">
        <span className={`${pulse} h-4 w-32`} />
        {Array.from({ length: 4 }, (_, row) => <span key={row} className={`${pulse} h-3.5`} style={{ width: `${90 - row * 15}%` }} />)}
      </div>)}
    </div>
  </div>;
}

function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <div role="radiogroup" aria-label={label} className="flex rounded-full bg-muted p-1">
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} onClick={() => onChange(option.value)}
      className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${option.value === value ? 'bg-foreground text-background' : 'bg-transparent text-muted-foreground hover:text-foreground'}`}>
      {option.label}
    </button>)}
  </div>;
}

function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-background p-5">
    <div className="flex min-h-6 items-center justify-between gap-3">
      <h2 className="m-0 text-sm font-semibold">{title}</h2>
      {aside}
    </div>
    {children}
  </section>;
}

function Kpi({ label, value, hint }: { label: string; value: number | string | undefined; hint?: string }) {
  return <div className="flex flex-col gap-1 rounded-[var(--radius-panel)] bg-background p-4 sm:p-5">
    <p className="m-0 text-2xl font-semibold sm:text-3xl tabular-nums tracking-tight">{value === undefined ? '–' : typeof value === 'number' ? value.toLocaleString() : value}</p>
    <p className="m-0 text-sm text-muted-foreground">{label}{hint && <span className="block text-xs">{hint}</span>}</p>
  </div>;
}

/** A ranked list with each row's share drawn behind it, the first rows shown and the rest on request. */
function Breakdown({ title, rows, metric, label, note }: {
  title: string; rows: Tally[]; metric: Metric; label: (row: Tally) => ReactNode; note?: string;
}) {
  const [all, setAll] = useState(false);
  const counted = rows.filter(row => row[metric] > 0).sort((a, b) => b[metric] - a[metric]);
  const total = counted.reduce((sum, row) => sum + row[metric], 0);
  const shown = all ? counted : counted.slice(0, SHOWN_ROWS);
  return <Panel title={title} aside={<span className="text-xs text-muted-foreground">{note ?? (metric === 'views' ? 'Visits' : 'Link clicks')}</span>}>
    {counted.length === 0 && <p className="m-0 py-6 text-center text-sm text-muted-foreground">Nothing in this period yet.</p>}
    {counted.length > 0 && <ol className="m-0 flex list-none flex-col gap-1 p-0">
      {shown.map(row => <li key={row.key} className="relative flex items-center gap-2 overflow-hidden rounded-[var(--radius-control)] px-3 py-2 text-sm">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-primary/12" style={{ width: `${(row[metric] / counted[0][metric]) * 100}%` }} />
        <span className="relative flex min-w-0 flex-1 items-center gap-2 truncate">{label(row)}</span>
        <span className="relative tabular-nums">{row[metric].toLocaleString()}<span className="text-muted-foreground"> · {percent(row[metric], total)}</span></span>
      </li>)}
    </ol>}
    {counted.length > SHOWN_ROWS && <button type="button" onClick={() => setAll(!all)}
      className={`${textButton} self-start`}>
      {all ? 'Show fewer' : `Show all ${counted.length}`}
    </button>}
  </Panel>;
}

const CHART_HEIGHT = 240;
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Visits, link clicks (left scale) and clicks per visit (right scale, 0–100%) per day; each can be hidden. */
function Timeline({ daily }: { daily: LinkStats['daily'] }) {
  const [shown, setShown] = useState({ views: true, clicks: true, engagement: true });
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(1, ...daily.map(day => Math.max(shown.views ? day.views : 0, shown.clicks ? day.clicks : 0))));
  const x = (index: number) => (daily.length > 1 ? (index / (daily.length - 1)) * 1000 : 500);
  const y = (value: number, max: number) => CHART_HEIGHT - (value / max) * CHART_HEIGHT;
  const line = (values: number[], max: number) => values.map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value, max)}`).join('');
  const rate = (day: LinkStats['daily'][number]) => (day.views ? Math.min(1, day.clicks / day.views) : 0);
  const tickCount = Math.min(daily.length, 7);
  const ticks = Array.from({ length: tickCount }, (_, index) => Math.round((index / Math.max(1, tickCount - 1)) * (daily.length - 1)));
  const at = hover === null ? null : daily[hover];
  const legend = [
    { key: 'views', label: 'Visits' }, { key: 'clicks', label: 'Link clicks' }, { key: 'engagement', label: 'Clicks / visits' },
  ] as const;
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-2">
      {legend.map(entry => <button key={entry.key} type="button" aria-pressed={shown[entry.key]} onClick={() => setShown({ ...shown, [entry.key]: !shown[entry.key] })}
        className={`flex cursor-pointer items-center gap-2 rounded-full border border-border bg-transparent px-3 py-1 text-xs ${shown[entry.key] ? 'text-foreground' : 'text-muted-foreground opacity-60'}`}>
        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: COLOURS[entry.key] }} />{entry.label}
      </button>)}
    </div>
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2">
      <div className="relative w-8 text-right text-[11px] text-muted-foreground" style={{ height: CHART_HEIGHT }}>
        {[1, 0.5, 0].map(share => <span key={share} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - share) * 100}%` }}>{Math.round(top * share).toLocaleString()}</span>)}
      </div>
      <div className="relative" style={{ height: CHART_HEIGHT }} onMouseLeave={() => setHover(null)}
        onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); setHover(Math.round(((event.clientX - box.left) / box.width) * (daily.length - 1))); }}>
        <svg viewBox={`0 0 1000 ${CHART_HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" role="img"
          aria-label={`Visits and link clicks per day, ${daily.length} days`}>
          {[0, 0.5, 1].map(share => <line key={share} x1="0" x2="1000" y1={share * CHART_HEIGHT} y2={share * CHART_HEIGHT} stroke="currentColor" className="text-border" vectorEffect="non-scaling-stroke" />)}
          {shown.views && <path d={line(daily.map(day => day.views), top)} fill="none" stroke={COLOURS.views} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          {shown.clicks && <path d={line(daily.map(day => day.clicks), top)} fill="none" stroke={COLOURS.clicks} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          {shown.engagement && <path d={line(daily.map(rate), 1)} fill="none" stroke={COLOURS.engagement} strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={CHART_HEIGHT} stroke="currentColor" className="text-muted-foreground" vectorEffect="non-scaling-stroke" />}
        </svg>
        {at && hover !== null && <div className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-[var(--radius-control)] bg-card p-3 text-xs shadow-[0_12px_32px_-12px_#000]"
          style={{ left: `${(x(hover) / 1000) * 100}%`, transform: `translateX(${hover > daily.length / 2 ? 'calc(-100% - 12px)' : '12px'})` }}>
          <p className="m-0 mb-1.5 font-semibold">{shortDay(at.day)}</p>
          <p className="m-0" style={{ color: COLOURS.views }}>Visits: <b className="text-foreground">{at.views}</b></p>
          <p className="m-0" style={{ color: COLOURS.clicks }}>Link clicks: <b className="text-foreground">{at.clicks}</b></p>
          <p className="m-0" style={{ color: COLOURS.engagement }}>Clicks / visits: <b className="text-foreground">{(rate(at) * 100).toFixed(1)}%</b></p>
        </div>}
      </div>
      <div className="relative w-9 text-[11px] text-muted-foreground" style={{ height: CHART_HEIGHT }}>
        {[1, 0.5, 0].map(share => <span key={share} className="absolute left-0 -translate-y-1/2" style={{ top: `${(1 - share) * 100}%` }}>{share * 100}%</span>)}
      </div>
      <div />
      <div className="relative mt-2 h-4 text-[11px] text-muted-foreground">
        {ticks.map((index, position) => <span key={index} className={`absolute -translate-x-1/2 whitespace-nowrap ${position % 2 ? 'max-sm:hidden' : ''}`} style={{ left: `${(x(index) / 1000) * 100}%` }}>{shortDay(daily[index].day)}</span>)}
      </div>
    </div>
  </div>;
}

/** A round number at or above `value` for the top of the scale. */
function niceMax(value: number) {
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find(step => step * power >= value) ?? 10) * power;
}
