import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadLearning, loadLibrary, type Learning, type LibraryItem, type Tally } from './api';
import { BOARDS } from '../boards';
import { TREATMENT_IDS, treatmentTitle } from '../treatment-deal';

const PERIODS = [7, 30, 90] as const;
const COLOUR_MATCH: Record<string, string> = { strong: 'Strong', some: 'Some', weak: 'Weak', none: 'Not read' };
const boardName = (id: string) => BOARDS.find(board => board.id === id)?.name ?? id;
const EVENT: Record<string, string> = { shown: 'Shown', play: 'Played', watch: 'Watched', select: 'Chosen', download: 'Download pressed', delivered: 'Downloaded', refresh: 'Refreshed' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const seconds = (ms: number) => (ms ? `${(ms / 1000).toFixed(1)} s` : '–');
const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
/** Out of how many cards people were shown: hands are told since the "shown" note; before, a play was the only sign a card was seen. */
const offered = (tally: Pick<Tally, 'shown' | 'plays'>) => Math.max(tally.shown, tally.plays);
/** Chosen: put in the chosen videos, out of every card shown. */
const keptRate = (tally: Tally) => share(tally.selects, offered(tally));
/** Downloaded: delivered, out of every card shown. What the brain learns from. */
const downloadRate = (tally: Tally) => share(tally.delivered, offered(tally));

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
const points = (rate: number) => `${(rate * 100).toFixed(1)}%`;

/**
 * Every template of the shelf, best first: how often its card was shown, chosen and downloaded, its download rate, the period before
 * for the trend, the kind of card people download most, and a verdict, so a template that does not work is reworked and the ones
 * that do are built on.
 */
function Templates({ learning }: { learning: Learning }) {
  const now = new Map(learning.rows.map(row => [row.key, row]));
  const before = new Map(learning.earlier.map(row => [row.key, row]));
  const tallies = Object.keys(TEMPLATE_TITLES).map(id => now.get(id) ?? { key: id, shown: 0, plays: 0, selects: 0, downloads: 0, delivered: 0, refreshes: 0, avgWatchMs: 0 });
  const shownAll = tallies.reduce((sum, tally) => sum + offered(tally), 0);
  const deliveredAll = tallies.reduce((sum, tally) => sum + tally.delivered, 0);
  const shelfRate = shownAll ? deliveredAll / shownAll : 0;
  const bestKind = (id: string) => learning.cards.find(card => card.key.startsWith(`${id} · `) && card.delivered > 0)?.key.split(' · ')[1];
  const rows = tallies.map(tally => {
    const shown = offered(tally);
    const rate = shown ? tally.delivered / shown : 0;
    const earlier = before.get(tally.key);
    const earlierShown = earlier ? offered(earlier) : 0;
    const trend = earlier && earlierShown >= JUDGE_AFTER && shown >= JUDGE_AFTER ? rate - earlier.delivered / earlierShown : null;
    return { tally, shown, rate, trend, verdict: verdict(tally.delivered, shown, shelfRate), kind: bestKind(tally.key) };
  }).sort((a, b) => Number(a.verdict === 'early') - Number(b.verdict === 'early') || b.rate - a.rate || b.tally.delivered - a.tally.delivered || b.shown - a.shown);
  return <section aria-label="What works" className="flex flex-col gap-3">
    <div>
      <h2 className="m-0 text-sm font-medium">What works</h2>
      <p className="m-0 text-xs text-muted-foreground">
        Every template, best first (too early to judge at the bottom), by downloads out of the cards people were shown ({points(shelfRate)} across the shelf). Working: 1.3 times the shelf or more. Rework it: half the shelf or less.
        Trend: against the {learning.days} days before. Plays do not count.
      </p>
    </div>
    <div className="overflow-x-auto rounded-[var(--radius-panel)] bg-card shadow-sm">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead><tr className="text-left text-xs text-muted-foreground">
          {['Template', 'Shown', 'Chosen', 'Downloaded', 'Download rate', 'Trend', 'Most downloaded kind', ''].map(head => <th key={head} className="px-4 py-2 font-medium">{head}</th>)}
        </tr></thead>
        <tbody>{rows.map(({ tally, shown, rate, trend, verdict: judged, kind }) => <tr key={tally.key} className="border-t border-border">
          <td className="px-4 py-2 font-medium">{templateName(tally.key)}</td>
          <td className="px-4 py-2">{shown}</td>
          <td className="px-4 py-2">{tally.selects}</td>
          <td className="px-4 py-2">{tally.delivered}</td>
          <td className="px-4 py-2">{shown ? points(rate) : '–'}</td>
          <td className={`px-4 py-2 ${trend === null ? 'text-muted-foreground' : trend >= 0 ? 'text-emerald-700' : 'text-destructive'}`}>
            {trend === null ? '–' : `${trend >= 0 ? '▲' : '▼'} ${(Math.abs(trend) * 100).toFixed(1)} pts`}
          </td>
          <td className="px-4 py-2 text-muted-foreground">{kind ?? '–'}</td>
          <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT[judged].className}`}>{VERDICT[judged].label}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="flex flex-col gap-1 rounded-[var(--radius-panel)] bg-card p-5 shadow-sm">
    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-3xl font-semibold tabular-nums">{value}</span>
    {note && <span className="text-xs text-muted-foreground">{note}</span>}
  </div>;
}

function Table({ title, note, tallies, label }: { title: string; note: string; tallies: Tally[]; label?: (key: string) => React.ReactNode }) {
  return <section aria-label={title} className="flex flex-col gap-3">
    <div>
      <h2 className="m-0 text-sm font-medium">{title}</h2>
      <p className="m-0 text-xs text-muted-foreground">{note}</p>
    </div>
    {tallies.length === 0 ? <p className="m-0 rounded-[var(--radius-panel)] bg-card p-5 text-sm text-muted-foreground">Nothing yet.</p>
      : <div className="overflow-x-auto rounded-[var(--radius-panel)] bg-card shadow-sm">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead><tr className="text-left text-xs text-muted-foreground">
            {['', 'Shown', 'Played', 'Avg watch', 'Chosen', 'Chosen rate', 'Download pressed', 'Downloaded', 'Download rate'].map(head => <th key={head} className="px-4 py-2 font-medium">{head}</th>)}
          </tr></thead>
          <tbody>{tallies.map(tally => <tr key={tally.key} className="border-t border-border">
            <td className="px-4 py-2">{label ? label(tally.key) : tally.key}</td>
            <td className="px-4 py-2">{offered(tally)}</td>
            <td className="px-4 py-2">{tally.plays}</td>
            <td className="px-4 py-2">{seconds(tally.avgWatchMs)}</td>
            <td className="px-4 py-2">{tally.selects}</td>
            <td className="px-4 py-2">{keptRate(tally)}</td>
            <td className="px-4 py-2">{tally.downloads}</td>
            <td className="px-4 py-2">{tally.delivered}</td>
            <td className="px-4 py-2">{downloadRate(tally)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}

/**
 * How the brain learns genres: the songs it can compare a clip with, and how creators who did not know their genre answered
 * "We think it sounds like…". Only a yes is kept; many no's for a style mean its guesses are not ready.
 */
function GenreLearning({ genre }: { genre: Learning['genre'] }) {
  const asked = genre.answers.reduce((sum, row) => sum + row.yes + row.no + row.unsure, 0);
  const yes = genre.answers.reduce((sum, row) => sum + row.yes, 0);
  return <section aria-label="Genre learning" className="flex flex-col gap-3">
    <div>
      <h2 className="m-0 text-sm font-medium">Genre learning</h2>
      <p className="m-0 text-xs text-muted-foreground">Songs with a known genre, and the answers to “We think it sounds like…”. Answers wait for the daily check before they teach the brain.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <Stat label="Songs to learn from" value={genre.prints.songs} note={`${genre.prints.creator} picked · ${genre.prints.confirmed} confirmed · ${genre.prints.corrected} corrected · ${genre.prints.seeded} seeded clips`} />
      <Stat label="Waiting to be checked" value={genre.candidates.waiting} note={`${genre.candidates.held} held for you · ${genre.candidates.rejected} never confirmed`} />
      <Stat label="I don’t know" value={genre.unknowns} note={asked ? `${asked} were asked a guess` : 'None asked a guess yet'} />
      <Stat label="Guesses right" value={asked ? `${Math.round((yes / asked) * 100)}%` : '–'} note={asked ? `${yes} yes of ${asked} answers` : undefined} />
    </div>
    {genre.answers.length > 0 && <div className="overflow-x-auto rounded-[var(--radius-panel)] bg-card shadow-sm">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead><tr className="text-left text-xs text-muted-foreground">
          {['Guessed', 'Yes', 'No', 'Not sure'].map(head => <th key={head} className="px-4 py-2 font-medium">{head}</th>)}
        </tr></thead>
        <tbody>{genre.answers.map(row => <tr key={row.style} className="border-t border-border">
          <td className="px-4 py-2 capitalize">{row.style}</td>
          <td className="px-4 py-2">{row.yes}</td>
          <td className="px-4 py-2">{row.no}</td>
          <td className="px-4 py-2">{row.unsure}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {genre.checks.length > 0 && <div className="overflow-x-auto rounded-[var(--radius-panel)] bg-card shadow-sm">
      <table className="w-full border-collapse text-sm tabular-nums">
        <caption className="px-4 pt-3 text-left text-xs text-muted-foreground">“Sounds more like…”: picks the brain heard as another genre. Many keeps mean it questions them too soon.</caption>
        <thead><tr className="text-left text-xs text-muted-foreground">
          {['Picked', 'Heard', 'Switched', 'Kept', 'Not sure'].map(head => <th key={head} className="px-4 py-2 font-medium">{head}</th>)}
        </tr></thead>
        <tbody>{genre.checks.map(row => <tr key={`${row.picked}|${row.guessed}`} className="border-t border-border">
          <td className="px-4 py-2 capitalize">{row.picked}</td>
          <td className="px-4 py-2 capitalize">{row.guessed}</td>
          <td className="px-4 py-2">{row.switched}</td>
          <td className="px-4 py-2">{row.kept}</td>
          <td className="px-4 py-2">{row.unsure}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

/** What people do with the creatives, so we can see what the brain is learning: per row, kind of card, look, vibe, mood and library picture. */
export function LearningView() {
  const [days, setDays] = useState<number>(30);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [pictures, setPictures] = useState<Map<string, LibraryItem>>(new Map());
  const [error, setError] = useState('');

  useEffect(() => {
    setLearning(null);
    loadLearning(days).then(next => { setLearning(next); setError(''); }, (cause: Error) => setError(cause.message));
  }, [days]);
  useEffect(() => { loadLibrary().then(library => setPictures(new Map(library.items.map(item => [item.id, item]))), () => undefined); }, []);

  const picture = (id: string) => {
    const item = pictures.get(id);
    if (!item) return <span className="text-muted-foreground">Removed picture</span>;
    return <span className="flex items-center gap-3">
      <img src={item.url} alt="" className="size-10 shrink-0 rounded object-cover" />
      <span className="flex flex-col">
        <span className="capitalize">{item.kind}</span>
        <span className="text-xs text-muted-foreground">{item.tags.join(', ') || 'No tags yet'}</span>
      </span>
    </span>;
  };

  return <div className="mx-auto flex max-w-5xl flex-col gap-8">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="m-0 text-2xl font-semibold">Learning</h1>
        <p className="m-0 text-sm text-muted-foreground">What the brain learns from is downloads, out of the cards people were shown. The shelf puts first the templates people download, each template leads with the kind of card people download and picks the pictures they download, all learned per lane. A card only chosen and never downloaded counts a quarter; plays count for nothing.</p>
      </div>
      <div className="flex gap-1" role="group" aria-label="Period">
        {PERIODS.map(period => <Button key={period} size="sm" variant={period === days ? 'default' : 'secondary'} aria-pressed={period === days} onClick={() => setDays(period)}>{period} days</Button>)}
      </div>
    </header>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    {!learning ? !error && <p className="m-0 text-sm text-muted-foreground">Loading…</p> : <>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Songs" value={learning.totals.songs} />
        <Stat label="Cards shown" value={offered(learning.totals)} />
        <Stat label="Downloaded" value={learning.totals.delivered} note={`${downloadRate(learning.totals)} of cards shown`} />
        <Stat label="Chosen" value={learning.totals.selects} note={`${keptRate(learning.totals)} of cards shown`} />
        <Stat label="Refresh presses" value={learning.totals.refreshes} />
        <Stat label="Played" value={learning.totals.plays} note={`Avg watch ${seconds(learning.totals.avgWatchMs)} · not learned from`} />
      </div>
      <Templates learning={learning} />
      <Table title="What people download" note="Each kind of card of each template: a treatment's variant, a Window colour, a Silhouette figure and colour, a Riso ink, a live look. The template leads with the kinds people download." tallies={learning.cards}
        label={key => { const [row, kind] = key.split(' · '); return <>{row} <span className="text-muted-foreground">· {kind}</span></>; }} />
      <Table title="Templates by lane" note="The same, for each lane the brain chose for the song. The shelf's order is learned per lane: a song's own lane counts in full, the others a quarter." tallies={learning.rowLanes}
        label={key => { const [row, lane] = key.split(' · '); return <>{row} <span className="text-muted-foreground">· {lane}</span></>; }} />
      <Table title="Place on the shelf" note="Cards by where their template was on the shelf (1 is the top). Templates near the top are seen and played more just for being there; the download rate says whether they deserve it." tallies={learning.places}
        label={key => `Place ${Number(key) + 1}`} />
      <Table title="Library pictures" note="Most downloaded first. Every picture of a reel counts. Cards on the person's own picture are left out." tallies={learning.pictures} label={picture} />
      <Table title="Mood boards" note="Cards dealt from each board. A board shown often and rarely downloaded is a weak fit for those songs." tallies={learning.boards} label={boardName} />
      <Table title="Mood boards by genre" note="The same, for each genre the creator gave (unknown when they did not know)." tallies={learning.boardGenres}
        label={key => { const [board, genre] = key.split(' · '); return <>{boardName(board)} <span className="text-muted-foreground">· {genre}</span></>; }} />
      <Table title="Genre colour match" note="Cards on our pictures, by how well the picture carries the colours of the song's genre. Not read: the picture is not measured yet, or the genre has no colours. If strong matches are downloaded more, colours are worth more weight."
        tallies={learning.colours} label={key => COLOUR_MATCH[key] ?? key} />
      <Table title="Looks" note="The live look, else the lyric type, else the style." tallies={learning.looks} />
      <Table title="Vibe and lane" note="How the song was heard, and the lane the brain chose." tallies={learning.vibes} />
      <Table title="Moods of the words" note="The main mood the lyric reader found." tallies={learning.moods} />
      <GenreLearning genre={learning.genre} />
      <section aria-label="Latest" className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-medium">Latest</h2>
        {learning.recent.length === 0 ? <p className="m-0 rounded-[var(--radius-panel)] bg-card p-5 text-sm text-muted-foreground">Nothing yet.</p>
          : <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {learning.recent.map((event, index) => <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] bg-card px-4 py-2 text-sm">
              <span className="w-32 shrink-0 font-medium">{EVENT[event.event] ?? event.event}{event.watchMs ? ` ${seconds(event.watchMs)}` : ''}</span>
              <span className="text-muted-foreground">{[event.row, event.look, event.genre, event.vibe, event.lane, event.mood].filter(Boolean).join(' · ')}</span>
              {event.nthDownload === 1 && <span className="rounded-full bg-muted px-2 text-xs">first download</span>}
              <span className="ml-auto text-xs text-muted-foreground">{when(event.at)}</span>
            </li>)}
          </ul>}
      </section>
    </>}
  </div>;
}
