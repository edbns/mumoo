import { useEffect, useMemo, useState } from 'react';
import { ActivityIcon, AlertTriangleIcon, BarChart3Icon, FilmIcon, Link2Icon, ReceiptTextIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { loadStats, type Day, type Overview, type Stats } from './api';
import { BarList, PillBars, Sparkline, TrendArea, type Point } from './charts';
import { Badge } from './data-table';
import { change, CsvButton, downloadCsv, formatBytes, formatDay, formatMoney, formatNumber, formatPercent, formatSeconds, Segmented, StatCard, Widget, WidgetHeader, WidgetValue } from './kit';
import { OverviewView } from './overview';

type Period = 7 | 30 | 90 | 365;
const PERIODS: { value: Period; label: string }[] = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }, { value: 365, label: '12 months' }];
type Metric = 'revenue' | 'signups' | 'videos' | 'linkViews';
const METRICS: { value: Metric; label: string; format: (value: number) => string }[] = [
  { value: 'revenue', label: 'Revenue', format: value => formatMoney(value) },
  { value: 'signups', label: 'Sign-ups', format: formatNumber },
  { value: 'videos', label: 'Videos made', format: formatNumber },
  { value: 'linkViews', label: 'Link views', format: formatNumber },
];
const SERVICE_NAMES: Record<string, string> = { analysis: 'Song analysis', genre: 'Genre guess', lyrics: 'Lyrics', meaning: 'Lyric meaning', checkout: 'Checkout', payments: 'Payments' };
const COUNTRY = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
const countryName = (code: string) => { try { return code.length === 2 ? COUNTRY?.of(code.toUpperCase()) ?? code : code === '?' ? 'Unknown' : code; } catch { return code; } };

const total = (days: Day[], key: keyof Omit<Day, 'day'>) => days.reduce((sum, day) => sum + day[key], 0);

/** A week a bar for 90 days, a month a bar for 12 months, so the bars stay readable. */
function buckets(days: Day[], period: Period): { label: string; title: string; days: Day[] }[] {
  if (period <= 30) return days.map(day => ({ label: formatDay(day.day), title: formatDay(day.day), days: [day] }));
  const groups = new Map<string, Day[]>();
  for (const day of days) {
    const date = new Date(`${day.day}T00:00:00Z`);
    const key = period === 365 ? day.day.slice(0, 7) : (() => { const monday = new Date(date); monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return monday.toISOString().slice(0, 10); })();
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups].map(([key, group]) => period === 365
    ? { label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), title: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }), days: group }
    : { label: formatDay(key), title: `Week of ${formatDay(key)}`, days: group });
}

export function DashboardView({ overview }: { overview: Overview }) {
  const [period, setPeriod] = useState<Period>(30);
  const [metric, setMetric] = useState<Metric>('revenue');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    loadStats(period).then(next => { if (live) setStats(next); }, (cause: Error) => { if (live) setError(cause.message); });
    return () => { live = false; };
  }, [period]);

  const view = useMemo(() => {
    if (!stats) return null;
    const { series, before } = stats;
    const groups = buckets(series, period);
    const earlier = buckets(before, period);
    const sumOf = (group: { days: Day[] }, key: keyof Omit<Day, 'day'>) => total(group.days, key);
    const trend: Point[] = groups.map((group, index) => ({ label: group.label, title: group.title, now: sumOf(group, metric), before: earlier[index] ? sumOf(earlier[index], metric) : 0 }));
    const bars: Point[] = groups.map(group => ({ label: group.label, title: group.title, videos: sumOf(group, 'videos') }));
    const spark = (key: keyof Omit<Day, 'day'>) => groups.map(group => sumOf(group, key));
    const stat = (key: keyof Omit<Day, 'day'>) => ({ now: total(series, key), delta: change(total(series, key), total(before, key)), spark: spark(key) });
    return { trend, bars, stat };
  }, [stats, period, metric]);

  const exportDays = () => stats && downloadCsv(`mumoo-daily-${period}-days-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Day (UTC)', 'Sign-ups', 'Orders', 'Revenue (USD)', 'Credits sold', 'Refunds', 'Videos made', 'Videos failed', 'Free videos', 'Uploads', 'Smart links created', 'Link views', 'Link clicks', 'People last seen'],
    stats.series.map(day => [day.day, day.signups, day.orders, (day.revenue / 100).toFixed(2), day.creditsSold, day.refunds, day.videos, day.failed, day.freeVideos, day.uploads, day.links, day.linkViews, day.linkClicks, day.lastSeen]));

  const word = PERIODS.find(item => item.value === period)!.label;
  const metricDef = METRICS.find(item => item.value === metric)!;
  const renders = stats?.renders ?? [];
  const made = renders.find(row => row.status === 'done');
  const count = (status: string) => renders.find(row => row.status === status)?.count ?? 0;
  const finished = count('done') + count('failed');

  return <div className="mx-auto flex max-w-[90rem] flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-2xl font-semibold">Overview</h1>
        <p className="m-0 mt-1 text-sm text-muted-foreground">The last {word.toLowerCase()}, each figure beside the {word.toLowerCase()} before.</p>
      </div>
      <div className="flex items-center gap-2">
        <Segmented label="Period" value={period} options={PERIODS} onChange={setPeriod} />
        <CsvButton onClick={exportDays} label="Daily CSV" />
      </div>
    </header>
    {error && <p role="alert" className="m-0 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
    {!view || !stats ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-card/70" />)}</div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Revenue" icon={WalletIcon} value={formatMoney(view.stat('revenue').now)} delta={view.stat('revenue').delta} caption={`${formatNumber(view.stat('orders').now)} orders`}>
          <Sparkline values={view.stat('revenue').spark} />
        </StatCard>
        <StatCard title="New people" icon={UsersIcon} value={formatNumber(view.stat('signups').now)} delta={view.stat('signups').delta} caption={`${formatNumber(stats.people.total)} in all`} href="#people">
          <Sparkline values={view.stat('signups').spark} />
        </StatCard>
        <StatCard title="Videos made" icon={FilmIcon} value={formatNumber(view.stat('videos').now)} delta={view.stat('videos').delta} caption={`${formatNumber(view.stat('freeVideos').now)} free`} href="#videos">
          <Sparkline values={view.stat('videos').spark} />
        </StatCard>
        <StatCard title="Smart link clicks" icon={Link2Icon} value={formatNumber(view.stat('linkClicks').now)} delta={view.stat('linkClicks').delta} caption={`${formatNumber(view.stat('linkViews').now)} views`} href="#links">
          <Sparkline values={view.stat('linkClicks').spark} />
        </StatCard>
        <StatCard title="Paying people" icon={WalletIcon} value={formatNumber(stats.people.buyers)}
          caption={`${stats.people.total ? formatPercent(stats.people.buyers / stats.people.total) : '0%'} of everyone`} href="#orders" />
        <StatCard title="Active" icon={ActivityIcon} value={formatNumber(stats.people.active7)}
          caption={`7 days · ${formatNumber(stats.people.active1)} today · ${formatNumber(stats.people.active30)} in 30 days`} />
        <StatCard title="Failed videos" icon={AlertTriangleIcon} value={formatNumber(view.stat('failed').now)} delta={view.stat('failed').delta} invert
          caption={finished ? `${formatPercent(count('failed') / finished)} of finished` : 'None finished'} href="#videos" />
        <StatCard title="Refunds" icon={ReceiptTextIcon} value={formatNumber(view.stat('refunds').now)} delta={view.stat('refunds').delta} invert
          caption={`${formatNumber(view.stat('creditsSold').now)} credits sold`} href="#orders" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Widget className="xl:col-span-2">
          <WidgetHeader title={metricDef.label} icon={BarChart3Icon} action={<Segmented label="Chart" value={metric} options={METRICS} onChange={setMetric} />} />
          <WidgetValue value={metricDef.format(view.stat(metric).now)} delta={view.stat(metric).delta} caption={`vs ${metricDef.format(total(stats.before, metric))} the ${word.toLowerCase()} before`} />
          <TrendArea data={view.trend} format={metricDef.format}
            series={[{ key: 'now', label: `Last ${word.toLowerCase()}`, color: 'var(--chart-lead)' }, { key: 'before', label: 'The period before', color: 'var(--chart-2)' }]} />
        </Widget>
        <Widget>
          <WidgetHeader title="Videos made" icon={FilmIcon} />
          <WidgetValue value={formatNumber(view.stat('videos').now)} caption={period <= 30 ? 'a bar a day' : period === 90 ? 'a bar a week' : 'a bar a month'} />
          <PillBars data={view.bars} dataKey="videos" label="Videos" />
        </Widget>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Widget>
          <WidgetHeader title="Making videos" icon={FilmIcon} />
          <div className="grid grid-cols-2 gap-4 px-5">
            <div><p className="m-0 text-xs text-muted-foreground">Typical make time</p><p className="m-0 font-mono text-xl font-semibold tabular-nums">{formatSeconds(made?.makeSeconds)}</p></div>
            <div><p className="m-0 text-xs text-muted-foreground">Typical wait to start</p><p className="m-0 font-mono text-xl font-semibold tabular-nums">{formatSeconds(made?.waitSeconds)}</p></div>
          </div>
          <div className="flex flex-wrap gap-2 px-5">
            <Badge tone="good">{formatNumber(count('done'))} made</Badge>
            <Badge tone="bad">{formatNumber(count('failed'))} failed</Badge>
            <Badge tone="muted">{formatNumber(count('cancelled'))} cancelled</Badge>
            <Badge tone="busy">{formatNumber(stats.people.rendering)} making now</Badge>
          </div>
          <p className="m-0 px-5 text-xs text-muted-foreground">{formatNumber(stats.people.makers)} people have made videos · {formatBytes(stats.people.storedBytes)} kept in Media</p>
        </Widget>
        <Widget className="xl:col-span-2">
          <WidgetHeader title="Services" icon={ActivityIcon} />
          {stats.services.length === 0 ? <p className="m-0 px-5 text-sm text-muted-foreground">No calls in this period.</p>
            : <div className="overflow-x-auto px-5"><table className="w-full border-collapse text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 text-left font-medium">Service</th><th className="py-2 text-right font-medium">Calls</th>
                <th className="py-2 text-right font-medium">Worked</th><th className="py-2 text-right font-medium">Average</th><th className="py-2 text-right font-medium">Slowest 5%</th>
              </tr></thead>
              <tbody className="font-mono tabular-nums">{stats.services.map(row => {
                const share = row.calls ? row.ok / row.calls : 1;
                return <tr key={row.service} className="border-b border-border/70 last:border-b-0">
                  <th scope="row" className="py-2 text-left font-sans font-medium">{SERVICE_NAMES[row.service] ?? row.service}</th>
                  <td className="py-2 text-right">{formatNumber(row.calls)}</td>
                  <td className={`py-2 text-right ${share < 0.95 ? 'text-destructive' : 'text-[var(--success)]'}`}>{formatPercent(share)}</td>
                  <td className="py-2 text-right">{formatSeconds(row.avgMs / 1000)}</td>
                  <td className="py-2 text-right">{formatSeconds(row.p95Ms / 1000)}</td>
                </tr>;
              })}</tbody>
            </table></div>}
        </Widget>
        <Widget>
          <WidgetHeader title="Link clicks by platform" icon={Link2Icon} />
          <BarList rows={stats.clicksByService.map(row => ({ label: row.service, value: row.clicks }))} empty="No clicks in this period." />
        </Widget>
        <Widget>
          <WidgetHeader title="Link views by country" icon={Link2Icon} />
          <BarList rows={stats.viewsByCountry.map(row => ({ label: countryName(row.country), value: row.views }))} empty="No views in this period." />
        </Widget>
        <Widget>
          <WidgetHeader title="Link views by source" icon={Link2Icon} />
          <BarList rows={stats.viewsBySource.map(row => ({ label: row.source, value: row.views }))} empty="No views in this period." />
          <p className="m-0 px-5 text-xs text-muted-foreground">{formatNumber(stats.people.links)} smart links · {formatNumber(stats.people.referred)} people joined with a friend’s link, {formatNumber(stats.people.referredPaid)} went on to buy</p>
        </Widget>
      </div>
    </>}
    <div className="mt-4"><OverviewView overview={overview} /></div>
  </div>;
}

