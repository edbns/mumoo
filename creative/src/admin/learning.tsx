import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadLearning, loadLibrary, type Learning, type LibraryItem, type Tally } from './api';

const PERIODS = [7, 30, 90] as const;
const EVENT: Record<string, string> = { play: 'Played', watch: 'Watched', select: 'Into cart', download: 'Download pressed', delivered: 'Delivered', refresh: 'Refreshed' };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const seconds = (ms: number) => (ms ? `${(ms / 1000).toFixed(1)} s` : '–');
/** Kept: put in the cart, out of every play. */
const keptRate = (tally: Tally) => (tally.plays ? `${Math.round((tally.selects / tally.plays) * 100)}%` : '–');

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
            {['', 'Played', 'Avg watch', 'Into cart', 'Kept', 'Download pressed', 'Delivered'].map(head => <th key={head} className="px-4 py-2 font-medium">{head}</th>)}
          </tr></thead>
          <tbody>{tallies.map(tally => <tr key={tally.key} className="border-t border-border">
            <td className="px-4 py-2">{label ? label(tally.key) : tally.key}</td>
            <td className="px-4 py-2">{tally.plays}</td>
            <td className="px-4 py-2">{seconds(tally.avgWatchMs)}</td>
            <td className="px-4 py-2">{tally.selects}</td>
            <td className="px-4 py-2">{keptRate(tally)}</td>
            <td className="px-4 py-2">{tally.downloads}</td>
            <td className="px-4 py-2">{tally.delivered}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}

/** What people do with the creatives, so we can see what the brain is learning: per row, look, vibe, mood and library picture. */
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
        <span className="text-xs text-muted-foreground">{[...item.attitudes, ...item.tags].join(', ') || 'No mood or tags'}</span>
      </span>
    </span>;
  };

  return <div className="mx-auto flex max-w-5xl flex-col gap-8">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="m-0 text-2xl font-semibold">Learning</h1>
        <p className="m-0 text-sm text-muted-foreground">What people play, watch, keep and download. The brain leans a little towards the pictures people keep.</p>
      </div>
      <div className="flex gap-1" role="group" aria-label="Period">
        {PERIODS.map(period => <Button key={period} size="sm" variant={period === days ? 'default' : 'secondary'} aria-pressed={period === days} onClick={() => setDays(period)}>{period} days</Button>)}
      </div>
    </header>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    {!learning ? !error && <p className="m-0 text-sm text-muted-foreground">Loading…</p> : <>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Songs" value={learning.totals.songs} />
        <Stat label="Played" value={learning.totals.plays} note={`Avg watch ${seconds(learning.totals.avgWatchMs)}`} />
        <Stat label="Into cart" value={learning.totals.selects} note={`Kept ${keptRate(learning.totals)} of plays`} />
        <Stat label="Download pressed" value={learning.totals.downloads} />
        <Stat label="Delivered" value={learning.totals.delivered} note={learning.totals.downloads ? `${Math.round((learning.totals.delivered / learning.totals.downloads) * 100)}% of presses` : undefined} />
      </div>
      <Table title="Rows" note="Which rows of the shelf people use." tallies={learning.rows} />
      <Table title="Library pictures" note="Every picture of a reel counts. Cards on the person's own picture are left out." tallies={learning.pictures} label={picture} />
      <Table title="Looks" note="The live look, else the lyric type, else the style." tallies={learning.looks} />
      <Table title="Vibe and lane" note="How the song was heard, and the lane the brain chose." tallies={learning.vibes} />
      <Table title="Moods of the words" note="The main mood the lyric reader found." tallies={learning.moods} />
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
