import { useEffect, useMemo, useState } from 'react';
import { BarChart3Icon, BrainIcon, ClockIcon, DownloadIcon, EyeIcon, ImagesIcon, Music2Icon, RefreshIcon, SparklesIcon, UsersIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { loadLearning, loadLibrary, type Learning, type LearningDay, type LibraryItem, type Tally } from './api';
import { BOARDS } from '../boards';
import { TREATMENT_IDS, treatmentTitle } from '../treatment-deal';
import { PillBars, Sparkline, TrendArea, type Point } from './charts';
import { DataTable, type Column } from './data-table';
import { change, CsvButton, downloadCsv, formatDate, formatDay, formatNumber, Segmented, StatCard, Widget, WidgetHeader, WidgetValue } from './kit';

const PERIODS = [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }];
const COLOUR_MATCH: Record<string, string> = { strong: 'Strong match', some: 'Some match', weak: 'Weak match', none: 'Not read' };
const LYRICS: Record<string, string> = { typed: 'Written by the creator', transcribed: 'Found by mumoo', none: 'No lyrics', unknown: 'Not recorded' };
const boardName = (id: string) => BOARDS.find(board => board.id === id)?.name ?? id;
const EVENT: Record<string, string> = { shown: 'Shown', play: 'Played', watch: 'Watched', select: 'Chosen', download: 'Download pressed', delivered: 'Downloaded', refresh: 'Refreshed' };
const seconds = (ms: number) => (ms ? `${(ms / 1000).toFixed(1)} s` : '–');
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** Out of how many cards people were shown: hands are told since the "shown" note; before, a play was the only sign a card was seen. */
const offered = (tally: Pick<Tally, 'shown' | 'plays'>) => Math.max(tally.shown, tally.plays);
const rateOf = (part: number, whole: number) => (whole ? part / whole : 0);
const points = (rate: number) => `${(rate * 100).toFixed(1)}%`;
/** Fewer cards shown than this in a breakdown, and its rate is shown faded: too few to read much into. */
const FEW = 20;

/** The shelf's templates by name, in the shelf's own order (`SHELF_ROWS`). */
export const TEMPLATE_TITLES: Record<string, string> = {
  photography: 'Directed',
  ...Object.fromEntries(TREATMENT_IDS.filter(id => id !== 'stutter').map(id => [id, treatmentTitle(id)])),
  thermal: 'Thermal', halftone: 'Halftone', stutter: treatmentTitle('stutter'), ascii: 'ASCII', riso: 'Riso', window: 'Window', silhouette: 'Silhouette', pulise: 'Pulse',
};
/** Templates no longer on the shelf, still named where their past numbers show. */
const RETIRED_TITLES: Record<string, string> = { dither: 'Dither', dust: 'Dust' };
const templateName = (id: string) => TEMPLATE_TITLES[id] ?? RETIRED_TITLES[id] ?? id;

/** Fewer cards shown than this, and a template is too early to judge. */
export const JUDGE_AFTER = 30;
export type Verdict = 'working' | 'average' | 'rework' | 'early';
/**
 * How a template is doing against the shelf as a whole, from downloads out of cards shown: working at 1.3 times the shelf's rate or
 * more (and at least three downloads), rework at half of it or less, too early with fewer than `JUDGE_AFTER` cards shown.
 */
export function verdict(delivered: number, shown: number, shelfRate: number): Verdict {
  if (shown < JUDGE_AFTER) return 'early';
  const rate = delivered / shown;
  if (delivered >= 3 && rate >= 1.3 * shelfRate) return 'working';
  if (rate <= 0.5 * shelfRate) return 'rework';
  return 'average';
}
const VERDICT: Record<Verdict, { label: string; className: string }> = {
  working: { label: 'Working', className: 'bg-emerald-100 text-emerald-800' },
  average: { label: 'Average', className: 'bg-muted text-muted-foreground' },
  rework: { label: 'Rework it', className: 'bg-destructive/10 text-destructive' },
  early: { label: 'Too early', className: 'bg-muted text-muted-foreground' },
};

type Metric = 'delivered' | 'rate' | 'shown' | 'songs';
const METRICS: { value: Metric; label: string; format: (value: number) => string; of: (day: LearningDay) => number }[] = [
  { value: 'delivered', label: 'Downloads', format: formatNumber, of: day => day.delivered },
  { value: 'rate', label: 'Download rate', format: points, of: day => rateOf(day.delivered, offered(day)) },
  { value: 'shown', label: 'Cards shown', format: formatNumber, of: day => offered(day) },
  { value: 'songs', label: 'Songs', format: formatNumber, of: day => day.songs },
];

type Judged = { tally: Tally; shown: number; rate: number; trend: number | null; verdict: Verdict; kind?: string };

/** Every template of the shelf, best first, judged against the shelf's own download rate. */
function judgeTemplates(learning: Learning) {
  const now = new Map(learning.rows.map(row => [row.key, row]));
  const before = new Map(learning.earlier.map(row => [row.key, row]));
  const tallies = Object.keys(TEMPLATE_TITLES).map(id => now.get(id) ?? { key: id, shown: 0, plays: 0, selects: 0, downloads: 0, delivered: 0, refreshes: 0, avgWatchMs: 0 });
  const shownAll = tallies.reduce((sum, tally) => sum + offered(tally), 0);
  const shelfRate = rateOf(tallies.reduce((sum, tally) => sum + tally.delivered, 0), shownAll);
  const bestKind = (id: string) => learning.cards.find(card => card.key.startsWith(`${id} · `) && card.delivered > 0)?.key.split(' · ')[1];
  const rows: Judged[] = tallies.map(tally => {
    const shown = offered(tally);
    const rate = rateOf(tally.delivered, shown);
    const earlier = before.get(tally.key);
    const earlierShown = earlier ? offered(earlier) : 0;
    const trend = earlier && earlierShown >= JUDGE_AFTER && shown >= JUDGE_AFTER ? rate - earlier.delivered / earlierShown : null;
    return { tally, shown, rate, trend, verdict: verdict(tally.delivered, shown, shelfRate), kind: bestKind(tally.key) };
  }).sort((a, b) => Number(a.verdict === 'early') - Number(b.verdict === 'early') || b.rate - a.rate || b.tally.delivered - a.tally.delivered || b.shown - a.shown);
  return { rows, shelfRate };
}

function VerdictBadge({ verdict: judged }: { verdict: Verdict }) {
  return <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', VERDICT[judged].className)}>{VERDICT[judged].label}</span>;
}

/** The template ranking: a bar for each template's download rate against the best, with the shelf's rate marked. */
function Templates({ rows, shelfRate, days }: { rows: Judged[]; shelfRate: number; days: number }) {
  const top = Math.max(shelfRate, ...rows.map(row => row.rate), 0.0001);
  return <Widget>
    <WidgetHeader title="Templates" icon={SparklesIcon} />
    <p className="m-0 -mt-2 px-5 text-xs text-muted-foreground">
      Downloads out of cards shown, best first. The line marks the shelf as a whole ({points(shelfRate)}). Working: 1.3 times the shelf or more. Rework it: half or less. Change: against the {days} days before.
    </p>
    <div className="overflow-x-auto px-2">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead><tr className="text-left text-xs text-muted-foreground">
          <th className="px-3 py-2 font-medium">Template</th>
          <th className="w-[34%] px-3 py-2 font-medium">Download rate</th>
          <th className="px-3 py-2 text-right font-medium">Change</th>
          <th className="px-3 py-2 text-right font-medium">Downloads</th>
          <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Shown</th>
          <th className="hidden px-3 py-2 font-medium lg:table-cell">Most downloaded kind</th>
          <th className="px-3 py-2 font-medium" />
        </tr></thead>
        <tbody>{rows.map(({ tally, shown, rate, trend, verdict: judged, kind }) => <tr key={tally.key} className={cn(judged === 'early' && 'text-muted-foreground')}>
          <td className="px-3 py-2 font-medium">{templateName(tally.key)}</td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="relative h-2 flex-1 rounded-full bg-muted">
                <div className={cn('absolute inset-y-0 left-0 rounded-full', judged === 'rework' ? 'bg-destructive/60' : 'bg-[var(--chart-lead)]')} style={{ width: `${(rate / top) * 100}%` }} />
                <div aria-hidden="true" className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/40" style={{ left: `${(shelfRate / top) * 100}%` }} />
              </div>
              <span className="w-12 text-right font-mono">{shown ? points(rate) : '–'}</span>
            </div>
          </td>
          <td className={cn('px-3 py-2 text-right font-mono', trend === null ? 'text-muted-foreground' : trend >= 0 ? 'text-[var(--success)]' : 'text-destructive')}>
            {trend === null ? '–' : `${trend >= 0 ? '+' : '−'}${(Math.abs(trend) * 100).toFixed(1)} pts`}
          </td>
          <td className="px-3 py-2 text-right font-mono">{formatNumber(tally.delivered)}</td>
          <td className="hidden px-3 py-2 text-right font-mono md:table-cell">{formatNumber(shown)}</td>
          <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">{kind ?? '–'}</td>
          <td className="px-3 py-2 text-right"><VerdictBadge verdict={judged} /></td>
        </tr>)}</tbody>
      </table>
    </div>
  </Widget>;
}

/** The shelf at a glance: how many templates fall in each verdict, the best and the weakest. */
function ShelfHealth({ rows }: { rows: Judged[] }) {
  const count = (judged: Verdict) => rows.filter(row => row.verdict === judged).length;
  const judgedRows = rows.filter(row => row.verdict !== 'early');
  const best = judgedRows[0];
  const weakest = judgedRows.length > 1 ? judgedRows[judgedRows.length - 1] : undefined;
  return <Widget>
    <WidgetHeader title="Shelf health" icon={BrainIcon} />
    <div className="grid grid-cols-2 gap-2 px-5">
      {(['working', 'average', 'rework', 'early'] as const).map(judged => <div key={judged} className="flex flex-col gap-1 rounded-xl bg-muted/60 p-3">
        <span className="font-mono text-2xl font-semibold tabular-nums">{count(judged)}</span>
        <span className="self-start"><VerdictBadge verdict={judged} /></span>
      </div>)}
    </div>
    <dl className="m-0 flex flex-col gap-2 px-5 text-sm">
      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Best</dt><dd className="m-0 font-medium">{best ? `${templateName(best.tally.key)} · ${points(best.rate)}` : '–'}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Weakest</dt><dd className="m-0 font-medium">{weakest ? `${templateName(weakest.tally.key)} · ${points(weakest.rate)}` : '–'}</dd></div>
    </dl>
  </Widget>;
}

type RateRow = { label: React.ReactNode; key: string; tally: Tally };
/** A ranked list by download rate, with how many downloads it rests on; rates on few cards are faded. */
function RateList({ rows, empty = 'Nothing yet.' }: { rows: RateRow[]; empty?: string }) {
  const rated = rows.map(row => ({ ...row, shown: offered(row.tally), rate: rateOf(row.tally.delivered, offered(row.tally)) }))
    .sort((a, b) => Number(a.shown < FEW) - Number(b.shown < FEW) || b.rate - a.rate || b.tally.delivered - a.tally.delivered);
  const top = Math.max(0.0001, ...rated.map(row => row.rate));
  if (!rated.length) return <p className="m-0 px-5 text-sm text-muted-foreground">{empty}</p>;
  return <ul className="m-0 flex list-none flex-col gap-1.5 px-5 py-0">
    <li aria-hidden="true" className="flex justify-between gap-3 px-2.5 text-xs text-muted-foreground"><span /><span className="flex gap-2"><span>Rate</span><span className="w-14 text-right">Downloads</span></span></li>
    {rated.map(row => <li key={row.key} className={cn('relative flex items-center justify-between gap-3 overflow-hidden rounded-lg px-2.5 py-1.5 text-sm', row.shown < FEW && 'text-muted-foreground')}
      title={`${formatNumber(row.tally.delivered)} downloads of ${formatNumber(row.shown)} cards shown`}>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 rounded-lg', row.shown < FEW ? 'bg-muted' : 'bg-[var(--chart-lead)]/15')} style={{ width: `${(row.rate / top) * 100}%` }} />
      <span className="relative min-w-0 truncate">{row.label}</span>
      <span className="relative flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
        <span>{points(row.rate)}</span>
        <span className="w-14 text-right text-xs text-muted-foreground">{formatNumber(row.tally.delivered)}</span>
      </span>
    </li>)}
  </ul>;
}

function Breakdown({ title, icon, note, rows }: { title: string; icon?: Parameters<typeof WidgetHeader>[0]['icon']; note: string; rows: RateRow[] }) {
  return <Widget>
    <WidgetHeader title={title} icon={icon} />
    <p className="m-0 -mt-2 px-5 text-xs text-muted-foreground">{note}</p>
    <RateList rows={rows} />
  </Widget>;
}

/** Adds up tallies that share a key (a lane across every template). */
function merged(tallies: Tally[], keyOf: (key: string) => string): Tally[] {
  const sums = new Map<string, Tally>();
  for (const tally of tallies) {
    const key = keyOf(tally.key);
    const sum = sums.get(key) ?? { key, shown: 0, plays: 0, selects: 0, downloads: 0, delivered: 0, refreshes: 0, avgWatchMs: 0 };
    sums.set(key, { ...sum, shown: sum.shown + tally.shown, plays: sum.plays + tally.plays, selects: sum.selects + tally.selects, downloads: sum.downloads + tally.downloads, delivered: sum.delivered + tally.delivered, refreshes: sum.refreshes + tally.refreshes });
  }
  return [...sums.values()];
}

/** How the brain learns genres: the songs it can compare a clip with, and how creators answered "We think it sounds like…". */
function GenreLearning({ genre }: { genre: Learning['genre'] }) {
  const asked = genre.answers.reduce((sum, row) => sum + row.yes + row.no + row.unsure, 0);
  const yes = genre.answers.reduce((sum, row) => sum + row.yes, 0);
  const figures = [
    { label: 'Songs to learn from', value: formatNumber(genre.prints.songs), note: `${genre.prints.creator} picked · ${genre.prints.confirmed} confirmed · ${genre.prints.corrected} corrected · ${genre.prints.seeded} seeded` },
    { label: 'Waiting for the daily check', value: formatNumber(genre.candidates.waiting), note: `${genre.candidates.held} held for you · ${genre.candidates.rejected} never confirmed` },
    { label: '“I don’t know”', value: formatNumber(genre.unknowns), note: asked ? `${asked} answered a guess` : 'None answered a guess yet' },
    { label: 'Guesses right', value: asked ? `${Math.round((yes / asked) * 100)}%` : '–', note: asked ? `${yes} yes of ${asked}` : 'No answers yet' },
  ];
  return <Widget>
    <WidgetHeader title="Genre learning" icon={Music2Icon} />
    <p className="m-0 -mt-2 px-5 text-xs text-muted-foreground">Songs with a known genre, and the answers to “We think it sounds like…”. Answers wait for the daily check before they teach the brain.</p>
    <div className="grid gap-3 px-5 sm:grid-cols-2 xl:grid-cols-4">
      {figures.map(figure => <div key={figure.label} className="flex flex-col gap-1 rounded-xl bg-muted/60 p-4">
        <span className="text-xs text-muted-foreground">{figure.label}</span>
        <span className="font-mono text-2xl font-semibold tabular-nums">{figure.value}</span>
        <span className="text-xs text-muted-foreground">{figure.note}</span>
      </div>)}
    </div>
    {(genre.answers.length > 0 || genre.checks.length > 0) && <div className="grid gap-4 px-5 lg:grid-cols-2">
      {genre.answers.length > 0 && <div>
        <h3 className="m-0 mb-2 text-sm font-medium">Guesses, by genre</h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{genre.answers.map(row => {
          const total = row.yes + row.no + row.unsure || 1;
          return <li key={row.style} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 truncate capitalize">{row.style}</span>
            <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted" title={`${row.yes} yes · ${row.no} no · ${row.unsure} not sure`}>
              <span className="bg-[var(--chart-lead)]" style={{ width: `${(row.yes / total) * 100}%` }} />
              <span className="bg-destructive/60" style={{ width: `${(row.no / total) * 100}%` }} />
            </span>
            <span className="w-24 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{row.yes} yes · {row.no} no</span>
          </li>;
        })}</ul>
      </div>}
      {genre.checks.length > 0 && <div>
        <h3 className="m-0 mb-2 text-sm font-medium">“Sounds more like…”</h3>
        <p className="m-0 mb-2 text-xs text-muted-foreground">Picks the brain heard as another genre. Many kept means it questions them too soon.</p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">{genre.checks.map(row => <li key={`${row.picked}|${row.guessed}`} className="flex justify-between gap-3">
          <span><span className="capitalize">{row.picked}</span> <span className="text-muted-foreground">heard as</span> <span className="capitalize">{row.guessed}</span></span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{row.switched} switched · {row.kept} kept · {row.unsure} not sure</span>
        </li>)}</ul>
      </div>}
    </div>}
  </Widget>;
}

type DetailRow = { name: string; shown: number; plays: number; watch: number; chosen: number; chosenRate: number; downloaded: number; rate: number };
const DETAIL_COLUMNS: Column<DetailRow>[] = [
  { key: 'name', label: 'Name' },
  { key: 'shown', label: 'Shown', align: 'right', cell: row => formatNumber(row.shown) },
  { key: 'plays', label: 'Played', align: 'right', wide: true, cell: row => formatNumber(row.plays) },
  { key: 'watch', label: 'Avg watch', align: 'right', wide: true, cell: row => seconds(row.watch), text: row => (row.watch / 1000).toFixed(1) },
  { key: 'chosen', label: 'Chosen', align: 'right', cell: row => formatNumber(row.chosen) },
  { key: 'chosenRate', label: 'Chosen rate', align: 'right', wide: true, cell: row => points(row.chosenRate), text: row => points(row.chosenRate) },
  { key: 'downloaded', label: 'Downloaded', align: 'right', cell: row => formatNumber(row.downloaded) },
  { key: 'rate', label: 'Download rate', align: 'right', cell: row => points(row.rate), text: row => points(row.rate) },
];
type DetailTable = 'cards' | 'rowLanes' | 'places' | 'pictures' | 'boards' | 'boardGenres' | 'colours' | 'looks' | 'vibes' | 'moods' | 'lyrics' | 'genres';
const DETAIL_TABLES: { value: DetailTable; label: string }[] = [
  { value: 'cards', label: 'Kinds of card' }, { value: 'rowLanes', label: 'Templates by lane' }, { value: 'places', label: 'Shelf place' },
  { value: 'pictures', label: 'Pictures' }, { value: 'boards', label: 'Mood boards' }, { value: 'boardGenres', label: 'Boards by genre' },
  { value: 'colours', label: 'Colour match' }, { value: 'looks', label: 'Looks' }, { value: 'vibes', label: 'Vibe and lane' },
  { value: 'moods', label: 'Moods' }, { value: 'lyrics', label: 'Lyrics' }, { value: 'genres', label: 'Genres' },
];

/** What people do with the videos on the shelf, so we can see what the brain is learning, and whether it is getting better. */
export function LearningView() {
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<Metric>('delivered');
  const [detail, setDetail] = useState<DetailTable>('cards');
  const [learning, setLearning] = useState<Learning | null>(null);
  const [pictures, setPictures] = useState<Map<string, LibraryItem>>(new Map());
  const [error, setError] = useState('');

  useEffect(() => {
    setLearning(null);
    loadLearning(days).then(next => { setLearning(next); setError(''); }, (cause: Error) => setError(cause.message));
  }, [days]);
  useEffect(() => { loadLibrary().then(library => setPictures(new Map(library.items.map(item => [item.id, item]))), () => undefined); }, []);

  const pictureName = (id: string) => {
    const item = pictures.get(id);
    return item ? [capitalised(item.kind), item.tags.slice(0, 3).join(', ')].filter(Boolean).join(' · ') : 'Removed picture';
  };
  const nameOf: Record<DetailTable, (key: string) => string> = {
    cards: key => { const [row, kind] = key.split(' · '); return `${templateName(row)} · ${kind}`; },
    rowLanes: key => { const [row, lane] = key.split(' · '); return `${templateName(row)} · ${lane}`; },
    places: key => `Place ${Number(key) + 1}`,
    pictures: pictureName,
    boards: boardName,
    boardGenres: key => { const [board, genre] = key.split(' · '); return `${boardName(board)} · ${genre}`; },
    colours: key => COLOUR_MATCH[key] ?? key,
    looks: key => key, vibes: key => key, moods: key => key,
    lyrics: key => LYRICS[key] ?? key,
    genres: key => capitalised(key),
  };

  const view = useMemo(() => {
    if (!learning) return null;
    const { rows, shelfRate } = judgeTemplates(learning);
    const metricDef = METRICS.find(item => item.value === metric)!;
    const trend: Point[] = learning.series.map((day, index) => {
      const before = learning.beforeSeries[index];
      return { label: formatDay(day.day), title: formatDay(day.day), now: metricDef.of(day), before: before ? metricDef.of(before) : 0 };
    });
    const totalOf = (which: Metric, from: Learning['totals']) =>
      which === 'rate' ? rateOf(from.delivered, offered(from)) : which === 'shown' ? offered(from) : which === 'songs' ? from.songs : from.delivered;
    const spark = (of: (day: LearningDay) => number) => learning.series.map(of);
    return { rows, shelfRate, metricDef, trend, totalOf, spark };
  }, [learning, metric]);

  const exportDays = () => learning && downloadCsv(`mumoo-learning-daily-${days}-days-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Day (UTC)', 'Songs', 'People', 'Cards shown', 'Played', 'Chosen', 'Downloaded', 'Download rate', 'Refresh presses'],
    learning.series.map(day => [day.day, day.songs, day.people, offered(day), day.plays, day.selects, day.delivered, points(rateOf(day.delivered, offered(day))), day.refreshes]));

  const detailRows = (table: DetailTable): DetailRow[] => (learning?.[table] ?? []).map(tally => ({
    name: nameOf[table](tally.key), shown: offered(tally), plays: tally.plays, watch: tally.avgWatchMs, chosen: tally.selects,
    chosenRate: rateOf(tally.selects, offered(tally)), downloaded: tally.delivered, rate: rateOf(tally.delivered, offered(tally)),
  }));
  /** Rows with cards shown, in the server's order (most downloaded first), so a slice keeps the ones with the most to say. */
  const asRate = (tallies: Tally[], label: (key: string) => React.ReactNode): RateRow[] =>
    tallies.filter(tally => offered(tally) > 0).map(tally => ({ key: tally.key, label: label(tally.key), tally }));

  const word = `${days} days`;
  return <div className="mx-auto flex max-w-[90rem] flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-2xl font-semibold">Learning</h1>
        <p className="m-0 mt-1 max-w-3xl text-sm text-muted-foreground">How well the shelf matches what people want: downloads out of the cards they were shown, over the last {word}, each figure beside the {word} before. Downloads teach the brain; a card only chosen counts a quarter, plays count for nothing.</p>
      </div>
      <div className="flex items-center gap-2">
        <Segmented label="Period" value={days} options={PERIODS} onChange={setDays} />
        <CsvButton onClick={exportDays} label="Daily CSV" />
      </div>
    </header>
    {error && <p role="alert" className="m-0 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
    {!learning || !view ? !error && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-card/70" />)}</div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Download rate" icon={BarChart3Icon} value={points(view.totalOf('rate', learning.totals))}
          delta={learning.before.delivered ? change(view.totalOf('rate', learning.totals), view.totalOf('rate', learning.before)) : null}
          caption={learning.before.delivered ? `was ${points(view.totalOf('rate', learning.before))}` : `${formatNumber(offered(learning.totals))} cards shown`}>
          <Sparkline values={view.spark(day => rateOf(day.delivered, offered(day)))} />
        </StatCard>
        <StatCard title="Videos downloaded" icon={DownloadIcon} value={formatNumber(learning.totals.delivered)} delta={change(learning.totals.delivered, learning.before.delivered)}
          caption={`${formatNumber(learning.totals.selects)} chosen`}>
          <Sparkline values={view.spark(day => day.delivered)} />
        </StatCard>
        <StatCard title="Songs" icon={Music2Icon} value={formatNumber(learning.totals.songs)} delta={change(learning.totals.songs, learning.before.songs)}
          caption={learning.totals.songs ? `${(learning.totals.delivered / learning.totals.songs).toFixed(1)} downloads a song` : undefined}>
          <Sparkline values={view.spark(day => day.songs)} />
        </StatCard>
        <StatCard title="Cards shown" icon={EyeIcon} value={formatNumber(offered(learning.totals))} delta={change(offered(learning.totals), offered(learning.before))}
          caption={`${formatNumber(learning.totals.plays)} played`}>
          <Sparkline values={view.spark(day => offered(day))} />
        </StatCard>
        <StatCard title="Chosen rate" icon={SparklesIcon} value={points(rateOf(learning.totals.selects, offered(learning.totals)))}
          delta={learning.before.selects ? change(rateOf(learning.totals.selects, offered(learning.totals)), rateOf(learning.before.selects, offered(learning.before))) : null}
          caption="put in the chosen videos" />
        <StatCard title="Refreshes a song" icon={RefreshIcon} invert
          value={learning.totals.songs ? (learning.totals.refreshes / learning.totals.songs).toFixed(1) : '–'}
          delta={learning.before.songs && learning.totals.songs ? change(learning.totals.refreshes / learning.totals.songs, learning.before.refreshes / learning.before.songs) : null}
          caption="fewer is a better first shelf" />
        <StatCard title="Average watch" icon={ClockIcon} value={seconds(learning.totals.avgWatchMs)}
          delta={learning.before.avgWatchMs ? change(learning.totals.avgWatchMs, learning.before.avgWatchMs) : null} caption="a card's preview, played" />
        <StatCard title="People the shelf knows" icon={UsersIcon} value={formatNumber(learning.peopleLearned)} caption="their shelf leads with what they kept" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Widget className="xl:col-span-2">
          <WidgetHeader title={view.metricDef.label} icon={BarChart3Icon} action={<Segmented label="Chart" value={metric} options={METRICS} onChange={setMetric} />} />
          <WidgetValue value={view.metricDef.format(view.totalOf(metric, learning.totals))}
            delta={change(view.totalOf(metric, learning.totals), view.totalOf(metric, learning.before))}
            caption={`vs ${view.metricDef.format(view.totalOf(metric, learning.before))} the ${word} before`} />
          <TrendArea data={view.trend} format={view.metricDef.format}
            series={[{ key: 'now', label: `Last ${word}`, color: 'var(--chart-lead)' }, { key: 'before', label: 'The period before', color: 'var(--chart-2)' }]} />
        </Widget>
        <ShelfHealth rows={view.rows} />
      </div>

      <Templates rows={view.rows} shelfRate={view.shelfRate} days={learning.days} />

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Breakdown title="Lyrics" icon={Music2Icon} note="Download rate by where the words came from." rows={asRate(learning.lyrics, key => LYRICS[key] ?? key)} />
        <Breakdown title="Genres" icon={Music2Icon} note="Download rate by the genre the creator gave." rows={asRate(learning.genres, capitalised).slice(0, 8)} />
        <Breakdown title="Lanes" icon={BrainIcon} note="Download rate by the lane the brain chose for the song." rows={asRate(merged(learning.rowLanes, key => key.split(' · ')[1] ?? key), capitalised)} />
        <Breakdown title="Best kinds of card" icon={SparklesIcon} note="A template's variant, colour, figure or ink. Each template leads with its best." rows={asRate(learning.cards, nameOf.cards).slice(0, 8)} />
        <Breakdown title="Mood boards" icon={ImagesIcon} note="A board shown often and rarely downloaded is a weak fit." rows={asRate(learning.boards, boardName).slice(0, 8)} />
        <Breakdown title="Genre colour match" icon={ImagesIcon} note="If strong matches are downloaded more, colours are worth more weight." rows={asRate(learning.colours, key => COLOUR_MATCH[key] ?? key)} />
        <Widget className="lg:col-span-2">
          <WidgetHeader title="Place on the shelf" icon={BarChart3Icon} />
          <p className="m-0 -mt-2 px-5 text-xs text-muted-foreground">Download rate by where the template sat (1 is the top). The top is seen more just for being there; a steep drop means the order matters more than the template.</p>
          <PillBars label="Download rate" format={points}
            data={learning.places.slice().sort((a, b) => Number(a.key) - Number(b.key)).map(place => ({ label: String(Number(place.key) + 1), title: `Place ${Number(place.key) + 1}`, rate: rateOf(place.delivered, offered(place)) }))}
            dataKey="rate" />
        </Widget>
        <Widget>
          <WidgetHeader title="Library pictures" icon={ImagesIcon} />
          <p className="m-0 -mt-2 px-5 text-xs text-muted-foreground">Most downloaded. People’s own pictures are left out.</p>
          {learning.pictures.length === 0 ? <p className="m-0 px-5 text-sm text-muted-foreground">Nothing yet.</p>
            : <ul className="m-0 flex list-none flex-col gap-2 px-5 py-0">{learning.pictures.slice(0, 6).map(tally => {
              const item = pictures.get(tally.key);
              return <li key={tally.key} className="flex items-center gap-3 text-sm">
                {item ? <img src={item.url} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-muted" />}
                <span className="min-w-0 flex-1 truncate">{pictureName(tally.key)}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums">{formatNumber(tally.delivered)} downloads · {points(rateOf(tally.delivered, offered(tally)))}</span>
              </li>;
            })}</ul>}
        </Widget>
      </div>

      <GenreLearning genre={learning.genre} />

      <Widget>
        <WidgetHeader title="All the numbers" icon={BarChart3Icon} action={<select value={detail} onChange={event => setDetail(event.target.value as DetailTable)} aria-label="Table"
          className="h-8 cursor-pointer rounded-full border border-border bg-card px-3 text-xs font-medium">
          {DETAIL_TABLES.map(table => <option key={table.value} value={table.value}>{table.label}</option>)}
        </select>} />
        <div className="px-5"><DataTable key={detail} rows={detailRows(detail)} columns={DETAIL_COLUMNS} name={`mumoo-learning-${detail}-${days}-days`}
          initialSort={[{ id: 'downloaded', desc: true }]} /></div>
      </Widget>

      <Widget>
        <WidgetHeader title="Latest" icon={ClockIcon} />
        {learning.recent.length === 0 ? <p className="m-0 px-5 text-sm text-muted-foreground">Nothing yet.</p>
          : <ul className="m-0 flex max-h-96 list-none flex-col gap-1 overflow-y-auto px-5 py-0">
            {learning.recent.map((event, index) => <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-1.5 text-sm odd:bg-muted/50">
              <span className="w-36 shrink-0 font-medium">{EVENT[event.event] ?? event.event}{event.watchMs ? ` ${seconds(event.watchMs)}` : ''}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{[event.row && templateName(event.row), event.look, event.genre, event.vibe, event.lane, event.mood].filter(Boolean).join(' · ')}</span>
              {event.nthDownload === 1 && <span className="rounded-full bg-muted px-2 text-xs">first download</span>}
              <span className="font-mono text-xs text-muted-foreground">{formatDate(event.at)}</span>
            </li>)}
          </ul>}
      </Widget>
    </>}
  </div>;
}
