import { useEffect, useRef, useState } from 'react';
import { Music2Icon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { ACCEPTED_AUDIO } from '../audio-format';
import { decodeAudio, hashAudio, probeDurationMs } from '../audio';
import { DURATION_MS } from '../composition';
import { encodePcmWav } from '../staging-alignment';
import type { StyleMatch } from '../style-search';
import { forgetSong, keepClipPrint, loadGenre, startClipPrint, type GenreTraining } from './api';

/** Where the clips of a song are cut: a quarter, half and three quarters in, as the owner's first songs were. */
const PLACES = [0.25, 0.5, 0.75];
/** The sound print hears 48 kHz mono, as a creator's clip is sent. */
const RATE = 48_000;
const POLL_MS = 3000;
const GIVE_UP_MS = 120_000;
/** A sub-genre is guessed only when at least two other songs of it are near: three songs is the least that can teach it. */
const ENOUGH = 3;

type Item = { key: string; file: File; match: StyleMatch | null; status: 'waiting' | 'working' | 'done' | 'failed'; note?: string };
type Search = (typed: string, limit?: number) => StyleMatch[];

const styleOf = (file: File, search: Search | null) => {
  const stem = file.name.replace(/\.[^.]*$/, '');
  const typed = stem.includes(' - ') ? stem.slice(stem.lastIndexOf(' - ') + 3).trim() : '';
  return typed && search ? search(typed, 1)[0] ?? null : null;
};

async function cut(audio: AudioBuffer, startSeconds: number): Promise<Blob> {
  const context = new OfflineAudioContext(1, DURATION_MS * RATE / 1000, RATE);
  const source = context.createBufferSource(); source.buffer = audio; source.connect(context.destination); source.start(0, startSeconds);
  const rendered = await context.startRendering();
  return new Blob([encodePcmWav(rendered.getChannelData(0), RATE)], { type: 'audio/wav' });
}

/** Cuts a song's clips here, has each printed, and keeps them with its style. Returns how many were kept. */
async function teach(file: File, match: StyleMatch): Promise<{ kept: number; clips: number }> {
  const probed = await probeDurationMs(file);
  const bytes = await file.arrayBuffer();
  const sourceSha256 = await hashAudio(bytes);
  const audio = await decodeAudio(bytes, probed);
  const starts = [...new Set(PLACES.map(place => Math.max(0, Math.round(audio.duration * place - DURATION_MS / 2000))))]
    .filter(start => start + DURATION_MS / 1000 <= audio.duration);
  const { style } = match;
  const results = await Promise.all(starts.map(async start => {
    const { id } = await startClipPrint(await cut(audio, start));
    const label = { sourceSha256, offsetMs: start * 1000, style: style.name, genre: style.genre, subGenre: style.subGenre, source: 'seeded' as const };
    for (const deadline = Date.now() + GIVE_UP_MS; Date.now() < deadline;) {
      await new Promise(resolve => setTimeout(resolve, POLL_MS));
      const { status } = await keepClipPrint(id, label);
      if (status !== 'running') return status === 'stored';
    }
    return false;
  }));
  return { kept: results.filter(Boolean).length, clips: starts.length };
}

function StylePicker({ value, search, onChange }: { value: StyleMatch | null; search: Search | null; onChange: (match: StyleMatch | null) => void }) {
  const found = useRef<StyleMatch[]>([]);
  const option = ({ label, style }: StyleMatch): ComboboxOption => ({ value: label, label: `${label} · ${style.subGenre}` });
  return <Combobox label="Style" hideLabel placeholder="Type its style…" emptyMessage={search ? 'No style found.' : 'Loading styles…'}
    options={value ? [option(value)] : []} value={value?.label ?? ''}
    search={typed => { found.current = search?.(typed) ?? []; return found.current.map(option); }}
    onValueChange={label => onChange(found.current.find(match => match.label === label) ?? null)} />;
}

/**
 * Genre training: the admin drops songs whose style they know, so the brain can guess genres before launch. Each song is
 * opened here one at a time (little memory), three 15 s clips are cut and printed in the cloud; only the prints are kept.
 */
export function GenreView() {
  const [training, setTraining] = useState<GenreTraining | null>(null);
  const [error, setError] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState<Search | null>(null);
  useEffect(() => { void import('../style-search').then(module => setSearch(() => module.searchStyles)); }, []);
  useEffect(() => { loadGenre().then(setTraining, (cause: Error) => setError(cause.message)); }, []);

  const update = (key: string, change: Partial<Item>) => setItems(list => list.map(item => item.key === key ? { ...item, ...change } : item));
  const ready = items.filter(item => item.status === 'waiting' && item.match);

  function add(files: File[]) {
    setItems(list => [...list, ...files.map(file => ({ key: `${file.name}:${file.size}:${Math.random()}`, file, match: styleOf(file, search), status: 'waiting' as const }))]);
  }

  async function run() {
    setRunning(true);
    for (const item of ready) {
      update(item.key, { status: 'working', note: 'Listening…' });
      try {
        const { kept, clips } = await teach(item.file, item.match!);
        update(item.key, kept ? { status: 'done', note: `${kept} of ${clips} clips learned` } : { status: 'failed', note: clips ? 'No clip could be printed. Try again.' : 'Too short: a song needs at least 15 seconds.' });
      } catch (cause) {
        update(item.key, { status: 'failed', note: (cause as Error).message });
      }
    }
    setRunning(false);
    loadGenre().then(setTraining, (cause: Error) => setError(cause.message));
  }

  async function forget(song: string) {
    if (!window.confirm('Forget this song? Its clips will no longer teach the brain.')) return;
    forgetSong(song).then(setTraining, (cause: Error) => setError(cause.message));
  }

  const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
  return <div className="mx-auto flex max-w-5xl flex-col gap-8">
    <header>
      <h1 className="m-0 text-2xl font-semibold">Genre training</h1>
      <p className="m-0 text-sm text-muted-foreground">Drop songs whose style you know. Each one teaches the brain how that style sounds, so it can guess for creators who don’t know theirs. Only a sound print is kept, never the song.</p>
    </header>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}

    {training && <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="Songs" value={training.songs.length} note={`${training.groups.length} sub-genres`} />
      <Stat label="Would ask" value={percent(training.ready.asked, training.ready.clips)} note={`On ${training.ready.asked} of ${training.ready.clips} clips, if their song were new`} />
      <Stat label="Right when asked" value={percent(training.ready.right, training.ready.asked)} note="The right sub-genre. A yes to a wrong guess is learned as true." />
    </div>}

    <section aria-label="Add songs" className="flex flex-col gap-3">
      <FileDropzone accept={ACCEPTED_AUDIO} icon={Music2Icon} title="Drop songs here" hint="Name a file “Title - Style.mp3” and its style is filled in."
        buttonLabel="Select songs" inputLabel="Songs" removeLabel="Remove" onSelectMany={add} />
      {items.length > 0 && <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map(item => <li key={item.key} className="grid grid-cols-[1fr_minmax(220px,320px)_auto] items-center gap-3 rounded-[var(--radius-control)] bg-card px-4 py-2 text-sm">
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{item.file.name}</span>
            {item.note && <span className={`text-xs ${item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{item.note}</span>}
          </span>
          {item.status === 'waiting' ? <StylePicker value={item.match} search={search} onChange={match => update(item.key, { match })} />
            : <span className="text-muted-foreground">{item.match?.label}</span>}
          {item.status === 'waiting' || item.status === 'failed'
            ? <Button size="sm" variant="secondary" disabled={running} onClick={() => setItems(list => list.filter(other => other.key !== item.key))}>Remove</Button>
            : <span className="w-[72px] text-right text-xs text-muted-foreground">{item.status === 'working' ? 'Working' : 'Done'}</span>}
        </li>)}
      </ul>}
      {items.length > 0 && <div className="flex items-center justify-end gap-3">
        {items.some(item => item.status === 'waiting' && !item.match) && <span className="text-xs text-muted-foreground">Give every song a style to teach it.</span>}
        <Button disabled={running || ready.length === 0} onClick={() => void run()}>{running ? 'Teaching…' : `Teach ${ready.length} song${ready.length === 1 ? '' : 's'}`}</Button>
      </div>}
    </section>

    {training && <section aria-label="Sub-genres" className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-sm font-medium">Sub-genres</h2>
        <p className="m-0 text-xs text-muted-foreground">A sub-genre needs at least {ENOUGH} songs before it can be guessed, and more makes it surer.</p>
      </div>
      {training.groups.length === 0 ? <p className="m-0 rounded-[var(--radius-panel)] bg-card p-5 text-sm text-muted-foreground">Nothing yet.</p>
        : <div className="overflow-x-auto rounded-[var(--radius-panel)] bg-card shadow-sm">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead><tr className="text-left text-xs text-muted-foreground">{['Genre', 'Sub-genre', 'Songs', ''].map(head => <th key={head} className="px-4 py-2 font-medium">{head}</th>)}</tr></thead>
            <tbody>{training.groups.map(group => <tr key={`${group.genre}/${group.subGenre}`} className="border-t border-border">
              <td className="px-4 py-2">{group.genre}</td>
              <td className="px-4 py-2">{group.subGenre}</td>
              <td className="px-4 py-2">{group.songs}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{group.songs < ENOUGH ? `Needs ${ENOUGH - group.songs} more` : ''}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </section>}

    {training && training.songs.length > 0 && <section aria-label="Songs" className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-sm font-medium">Songs</h2>
        <p className="m-0 text-xs text-muted-foreground">Newest first. Songs are known only by their style; forget one that was given the wrong style.</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {training.songs.map(song => <li key={song.song} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] bg-card px-4 py-2 text-sm">
          <span className="font-medium capitalize">{song.style}</span>
          <span className="text-muted-foreground">{song.genre} · {song.subGenre} · {song.clips} clip{song.clips === 1 ? '' : 's'} · {song.source}</span>
          <span className="ml-auto text-xs text-muted-foreground">{new Date(song.at).toLocaleDateString()}</span>
          <Button size="sm" variant="ghost" aria-label={`Forget this ${song.style} song`} onClick={() => void forget(song.song)}><Trash2Icon className="size-4" aria-hidden="true" /></Button>
        </li>)}
      </ul>
    </section>}
  </div>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="flex flex-col gap-1 rounded-[var(--radius-panel)] bg-card p-5 shadow-sm">
    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-3xl font-semibold tabular-nums">{value}</span>
    {note && <span className="text-xs text-muted-foreground">{note}</span>}
  </div>;
}
