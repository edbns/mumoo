import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CheckIcon, EyeOffIcon, FilmIcon, ImageIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GENRES } from '../genres';
import { themesFor } from '../genre-guide';
import {
  changeItem, deleteItem, deleteTag, loadLibrary, uploadFile,
  type Change, type Library, type LibraryItem, type LibraryStatus, type TagCount,
} from './api';

/** The most the server allows; the page stops short of them so a person is never told off after the fact. */
const MAX_TAGS = 15;
const MAX_TAGS_IN_POOL = 200;
/** Words for what is often in the picture, offered on every item so the same thing is always called the same (car, not cars or lambo). */
const COMMON_TAGS = [
  'car', 'girls', 'guys', 'couple', 'club', 'party', 'dancing', 'crowd', 'champagne', 'money', 'jewelry', 'luxury',
  'night', 'neon', 'city', 'street', 'beach', 'pool', 'sunset', 'road', 'stage', 'studio', 'fashion', 'close up',
];
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';
const STATUS_LABEL: Record<LibraryStatus, string> = { pending: 'Waiting', approved: 'Approved', hidden: 'Hidden' };
const STATUS_STYLE: Record<LibraryStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  hidden: 'bg-muted text-muted-foreground',
};
const cap = (word: string) => word[0].toUpperCase() + word.slice(1);
const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** `some`: on for only part of a selection (shown half-on, `aria-pressed="mixed"`). */
function Chip({ on, some = false, children, ...props }: { on: boolean; some?: boolean } & React.ComponentProps<'button'>) {
  const look = on ? 'bg-foreground text-background' : some ? 'bg-secondary text-foreground ring-1 ring-inset ring-foreground/40' : 'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground';
  return <button type="button" aria-pressed={on ? true : some ? 'mixed' : false} {...props}
    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${look} disabled:cursor-not-allowed disabled:opacity-40`}>{children}</button>;
}

function Media({ item, controls = false }: { item: LibraryItem; controls?: boolean }) {
  if (item.kind !== 'video') return <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />;
  return <video src={item.url} muted loop playsInline preload="metadata" controls={controls} className="size-full object-cover"
    onMouseEnter={controls ? undefined : event => void event.currentTarget.play().catch(() => undefined)}
    onMouseLeave={controls ? undefined : event => { event.currentTarget.pause(); event.currentTarget.currentTime = 0; }} />;
}

type Sending = { name: string; state: 'sending' | 'done' | 'failed'; reason?: string };

/** Drop files in, say once that you cleared them, and they join the library as "Waiting" until you tag and approve them. `onDone` gets the ids of a batch once it has all been sent. */
function Uploader({ onAdded, onDone }: { onAdded: (item: LibraryItem) => void; onDone: (ids: string[]) => void }) {
  const [rights, setRights] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<Sending[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = sending.some(entry => entry.state === 'sending');

  async function send(files: File[]) {
    if (!rights || files.length === 0) return;
    const set = (index: number, entry: Sending) => setSending(list => list.map((old, at) => at === index ? entry : old));
    setSending(files.map(file => ({ name: file.name, state: 'sending' })));
    const added: string[] = [];
    for (const [index, file] of files.entries()) {
      try {
        const item = await uploadFile(file, note);
        onAdded(item);
        added.push(item.id);
        set(index, { name: file.name, state: 'done' });
      } catch (cause) {
        set(index, { name: file.name, state: 'failed', reason: (cause as Error).message });
      }
    }
    if (added.length) onDone(added);
  }
  const drop = (event: DragEvent) => { event.preventDefault(); setOver(false); void send([...event.dataTransfer.files]); };

  return <section aria-label="Add files" className="flex flex-col gap-4 rounded-[var(--radius-panel)] bg-card p-5 shadow-sm">
    <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} className="mt-0.5 size-4 accent-foreground" />
          <span>I cleared the rights to these files. This is recorded with my email and the time.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Where they came from (optional)
          <input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="Licence, source or invoice"
            className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm font-normal text-foreground outline-ring placeholder:text-muted-foreground/70 focus-visible:outline-2" />
        </label>
      </div>
      <div onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
        className={`flex flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] border-2 border-dashed p-6 text-center transition-colors ${over ? 'border-foreground bg-muted' : 'border-border'} ${rights ? '' : 'opacity-50'}`}>
        <UploadIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="m-0 text-sm">Drop photos, videos or GIFs here</p>
        <p className="m-0 text-xs text-muted-foreground">Photos (made into small JPEGs), GIF (25 MB), MP4, MOV, WebM (150 MB). Videos and GIFs take a minute to prepare.</p>
        <Button variant="secondary" size="sm" disabled={!rights || busy} onClick={() => input.current?.click()}>Choose files</Button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden aria-label="Files to add"
          onChange={event => { void send([...(event.target.files ?? [])]); event.target.value = ''; }} />
        {!rights && <p className="m-0 text-xs text-muted-foreground">Tick the box first.</p>}
      </div>
    </div>
    {sending.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
      {sending.map((entry, index) => <li key={index} className="flex items-center gap-2">
        <span className={entry.state === 'failed' ? 'text-destructive' : entry.state === 'done' ? 'text-emerald-700' : 'text-muted-foreground'}>
          {entry.state === 'sending' ? 'Sending' : entry.state === 'done' ? 'Added' : 'Failed'}
        </span>
        <span className="truncate">{entry.name}</span>
        {entry.reason && <span className="text-xs text-destructive">{entry.reason}</span>}
      </li>)}
    </ul>}
  </section>;
}

/** A card opens its item; its tick puts it in the selection (shift-click ticks every card between this one and the last ticked). */
function Card({ item, selected, ticked, onSelect, onTick }: { item: LibraryItem; selected: boolean; ticked: boolean; onSelect: () => void; onTick: (range: boolean) => void }) {
  return <div className="relative">
  <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${item.kind}, ${STATUS_LABEL[item.status]}${item.tags.length ? `, ${item.tags.join(', ')}` : ', no tags yet'}`}
    className={`group flex w-full flex-col overflow-hidden rounded-[var(--radius-panel)] bg-card p-0 text-left shadow-sm outline-ring transition-shadow focus-visible:outline-2 ${selected || ticked ? 'ring-2 ring-foreground' : 'hover:shadow-md'}`}>
    <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
      <Media item={item} />
      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      {!item.ready && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${item.problem ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{item.problem ? 'Cannot be used' : 'Preparing…'}</span>}
      {item.ready && item.warning && <span className="absolute bottom-2 left-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Low resolution</span>}
      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {item.kind === 'video' ? <FilmIcon className="size-3" aria-hidden="true" /> : <ImageIcon className="size-3" aria-hidden="true" />}{item.kind === 'gif' ? 'GIF' : cap(item.kind)}
      </span>
    </div>
    <div className="flex min-h-14 flex-wrap content-start gap-1 p-3">
      {item.tags.length === 0 && <span className="text-xs text-destructive">No tags yet</span>}
      {item.tags.map(tag => <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>)}
    </div>
  </button>
  <button type="button" role="checkbox" aria-checked={ticked} aria-label={ticked ? 'Unselect' : 'Select'} onClick={event => onTick(event.shiftKey)}
    className={`absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border-2 p-0 shadow-sm outline-ring transition-colors focus-visible:outline-2 ${ticked ? 'border-foreground bg-foreground text-background' : 'border-white bg-black/40 text-transparent hover:bg-black/60'}`}>
    <CheckIcon className="size-4" aria-hidden="true" />
  </button>
  </div>;
}

/** Tags worth offering that the list does not have yet: the chosen genre's looks, then the common words. */
const suggestionsFor = (genre: string, subGenre: string, poolNames: readonly string[]) =>
  [...new Set([...(genre ? themesFor(genre, subGenre) : []), ...COMMON_TAGS])].filter(tag => !poolNames.includes(tag));

/** The side panel for one item: what is in it (tags), a genre it is kept for, where it came from, and approve, hide or delete. */
function Panel({ item, pool, onClose, onSaved, onDeleted }: {
  item: LibraryItem; pool: TagCount[]; onClose: () => void;
  onSaved: (item: LibraryItem, tags: TagCount[]) => void; onDeleted: (library: Library) => void;
}) {
  const [tags, setTags] = useState(item.tags);
  const [genre, setGenre] = useState(item.genre ?? '');
  const [subGenre, setSubGenre] = useState(item.subGenre ?? '');
  const [note, setNote] = useState(item.note);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Another item was chosen: start from its values.
  useEffect(() => {
    setTags(item.tags); setGenre(item.genre ?? ''); setSubGenre(item.subGenre ?? ''); setNote(item.note); setNewTag(''); setError('');
  }, [item.id]);

  const same = (a: string[], b: string[]) => a.length === b.length && a.every(value => b.includes(value));
  const dirty = !same(tags, item.tags) || genre !== (item.genre ?? '') || subGenre !== (item.subGenre ?? '') || note !== item.note;
  const toggle = (list: string[], value: string, limit: number) => list.includes(value) ? list.filter(entry => entry !== value) : list.length < limit ? [...list, value] : list;
  const group = GENRES.find(entry => entry.name === genre);
  const poolNames = pool.map(entry => entry.name);
  const shownTags = [...poolNames, ...tags.filter(tag => !poolNames.includes(tag))];

  // One click gives the item a tag the brain looks for; it then shows among the item's tags.
  const suggested = suggestionsFor(genre, subGenre, [...poolNames, ...tags]);
  function suggest(tag: string) {
    if (tags.length >= MAX_TAGS) return setError(`At most ${MAX_TAGS} tags for one item.`);
    if (!poolNames.includes(tag) && poolNames.length >= MAX_TAGS_IN_POOL) return setError(`The tag list is full (${MAX_TAGS_IN_POOL}). Remove one you do not use, or reuse one.`);
    setError(''); setTags(list => [...list, tag]);
  }

  function addNewTag() {
    const tag = newTag.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag) return;
    if (tags.length >= MAX_TAGS) return setError(`At most ${MAX_TAGS} tags for one item.`);
    if (!poolNames.includes(tag) && poolNames.length >= MAX_TAGS_IN_POOL) return setError(`The tag list is full (${MAX_TAGS_IN_POOL}). Remove one you do not use, or reuse one.`);
    setError(''); setTags(list => list.includes(tag) ? list : [...list, tag]); setNewTag('');
  }

  async function save(status?: 'approved' | 'hidden') {
    setBusy(true); setError('');
    const change: Change = { tags, genre, subGenre: genre ? subGenre : '', note, ...(status && { status }) };
    try {
      const saved = await changeItem(item.id, change);
      onSaved(saved.item, saved.tags);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm('Delete this file for good? It is removed from storage and cannot be undone.')) return;
    setBusy(true);
    try { onDeleted(await deleteItem(item.id)); } catch (cause) { setError((cause as Error).message); setBusy(false); }
  }

  return <aside aria-label="Edit item" className="fixed inset-y-0 right-0 z-10 flex w-full max-w-md flex-col gap-5 overflow-y-auto bg-card p-6 shadow-2xl">
    <div className="flex items-center justify-between">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><XIcon className="size-4" aria-hidden="true" /></Button>
    </div>
    <div className="aspect-[3/4] max-h-80 self-center overflow-hidden rounded-[var(--radius-panel)] bg-muted"><Media item={item} controls /></div>

    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags (up to {MAX_TAGS}) · everything you see in it</legend>
      <div className="flex flex-wrap gap-1.5">
        {shownTags.map(tag => <Chip key={tag} on={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= MAX_TAGS}
          onClick={() => setTags(list => toggle(list, tag, MAX_TAGS))}>{tag}{!poolNames.includes(tag) && ' (new)'}</Chip>)}
        {shownTags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet. Add the first one below.</span>}
      </div>
      {suggested.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Suggested:</span>
        {suggested.map(tag => <Chip key={tag} on={false} onClick={() => suggest(tag)}>{tag}</Chip>)}
      </div>}
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); addNewTag(); }}>
        <input value={newTag} onChange={event => setNewTag(event.target.value)} maxLength={24} placeholder="New tag, like beach" aria-label="New tag"
          className="min-w-0 flex-1 rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm outline-ring focus-visible:outline-2" />
        <Button variant="secondary" type="submit" disabled={!newTag.trim()}>Add</Button>
      </form>
    </fieldset>

    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Genre (optional) · preferred for it when set</legend>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Genre" value={genre} onChange={event => { setGenre(event.target.value); setSubGenre(''); }}
          className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm outline-ring focus-visible:outline-2">
          <option value="">Any genre</option>
          {GENRES.map(entry => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
        </select>
        <select aria-label="Sub-genre" value={subGenre} disabled={!group} onChange={event => setSubGenre(event.target.value)}
          className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm outline-ring focus-visible:outline-2 disabled:opacity-50">
          <option value="">Any sub-genre</option>
          {group?.subGenres.map(entry => <option key={entry} value={entry}>{entry}</option>)}
        </select>
      </div>
    </fieldset>

    <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rights note
      <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2}
        className="resize-none rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-ring focus-visible:outline-2" />
    </label>
    {!item.ready && <p role="status" className={`m-0 text-sm ${item.problem ? 'text-destructive' : 'text-muted-foreground'}`}>
      {item.problem
        ? `${item.problem} ${item.status === 'approved' ? 'It is approved, but the templates will not use it until this is fixed.' : 'It cannot be approved for the templates until this is fixed.'} Reload the page to see if it has been prepared since.`
        : 'Our worker is preparing this. It reaches the templates when it is ready and approved.'}</p>}
    {item.warning && <p role="status" className="m-0 rounded-[var(--radius-control)] bg-amber-100 px-3 py-2 text-sm text-amber-900">{item.warning}</p>}
    <p className="m-0 text-xs text-muted-foreground">Cleared by {item.clearedBy} on {when(item.clearedAt)} · {item.contentType} · {megabytes(item.bytes)}{item.width && item.height ? ` · ${item.width}×${item.height}` : ''}</p>

    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    <div className="mt-auto flex flex-wrap items-center gap-2">
      {item.status !== 'approved' && <Button disabled={busy} onClick={() => void save('approved')}><CheckIcon className="size-4" aria-hidden="true" />Approve</Button>}
      {item.status !== 'hidden' && <Button variant="secondary" disabled={busy} onClick={() => void save('hidden')}><EyeOffIcon className="size-4" aria-hidden="true" />Hide</Button>}
      <Button variant="secondary" disabled={busy || !dirty} onClick={() => void save()}>Save changes</Button>
      <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" disabled={busy} onClick={() => void remove()}><Trash2Icon className="size-4" aria-hidden="true" />Delete</Button>
    </div>
  </aside>;
}

/** What a bulk edit does to each chosen item: tags to add and to take off. A tag in neither is left as each item has it. */
type Edit = { add: string[]; drop: string[] };
const NO_EDIT: Edit = { add: [], drop: [] };
/** How a tag stands across the selection, once the edit is applied: on all, on some, or on none. */
function standing(code: string, items: readonly LibraryItem[], edit: Edit): 'all' | 'some' | 'none' {
  if (edit.add.includes(code)) return 'all';
  if (edit.drop.includes(code)) return 'none';
  const having = items.filter(item => item.tags.includes(code)).length;
  return having === items.length ? 'all' : having ? 'some' : 'none';
}
/** On everywhere: take it off all. Otherwise: put it on all. */
const flip = (edit: Edit, code: string, all: boolean): Edit => all
  ? { add: edit.add.filter(entry => entry !== code), drop: [...edit.drop.filter(entry => entry !== code), code] }
  : { add: [...edit.add.filter(entry => entry !== code), code], drop: edit.drop.filter(entry => entry !== code) };
/** One item's list after the edit, kept within `limit` (what it already has stays first); `left` is what did not fit. */
function edited(list: readonly string[], edit: Edit, limit: number) {
  const kept = list.filter(code => !edit.drop.includes(code));
  const wanted = edit.add.filter(code => !kept.includes(code));
  const room = Math.max(0, limit - kept.length);
  return { list: [...kept, ...wanted.slice(0, room)], left: wanted.length - Math.min(room, wanted.length) };
}
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(value => b.includes(value));
/** Gentle on the server: a few changes at a time. */
async function inTurns<T>(jobs: readonly (() => Promise<T>)[], width = 4): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, async () => {
    while (next < jobs.length) {
      const at = next++;
      try { results[at] = { status: 'fulfilled', value: await jobs[at]() }; } catch (reason) { results[at] = { status: 'rejected', reason }; }
    }
  }));
  return results;
}
const LEAVE = '__leave__';
const NO_TAGS = '__none__';

/** The selection, while cards are being ticked: how many, and the way to edit them (the panel would hide half the cards). */
function SelectionBar({ count, shown, onClear, onEdit }: { count: number; shown: boolean; onClear: () => void; onEdit: () => void }) {
  return <div role="region" aria-label="Selection" aria-hidden={!shown}
    className={`fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground py-2 pl-5 pr-2 text-background shadow-2xl transition-transform duration-300 ease-out ${shown ? 'translate-y-0' : 'pointer-events-none translate-y-[200%]'}`}>
    <span className="text-sm font-medium tabular-nums">{count} selected</span>
    <Button variant="ghost" size="sm" tabIndex={shown ? 0 : -1} className="text-background hover:bg-background/15 hover:text-background" onClick={onClear}>Clear</Button>
    <Button size="sm" tabIndex={shown ? 0 : -1} className="bg-background text-foreground hover:bg-background/90" onClick={onEdit}>Edit {count}</Button>
  </div>;
}

/** The side panel for several items at once: tags put on or taken off all of them, one genre for all, and approve, hide or delete them together. */
function BulkPanel({ items, pool, onClose, onSaved, onDeleted }: {
  items: LibraryItem[]; pool: TagCount[]; onClose: () => void;
  onSaved: (items: LibraryItem[], tags: TagCount[] | null) => void; onDeleted: (library: Library | null, gone: string[]) => void;
}) {
  const [tags, setTags] = useState<Edit>(NO_EDIT);
  const [genre, setGenre] = useState(LEAVE);
  const [subGenre, setSubGenre] = useState('');
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');

  const poolNames = pool.map(entry => entry.name);
  const shownTags = [...poolNames, ...tags.add.filter(tag => !poolNames.includes(tag))];
  const group = GENRES.find(entry => entry.name === genre);
  const suggested = suggestionsFor(genre !== LEAVE ? genre : '', subGenre, shownTags);
  const dirty = tags.add.length + tags.drop.length > 0 || genre !== LEAVE;

  function addNewTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag) return;
    if (!poolNames.includes(tag) && poolNames.length + tags.add.filter(entry => !poolNames.includes(entry)).length >= MAX_TAGS_IN_POOL) {
      return setError(`The tag list is full (${MAX_TAGS_IN_POOL}). Remove one you do not use, or reuse one.`);
    }
    setError(''); setTags(edit => flip(edit, tag, false)); setNewTag('');
  }

  /** What each item is sent: only what changes for it. */
  function plan(status?: 'approved' | 'hidden') {
    let unfit = 0;
    const changes = items.flatMap(item => {
      const nextTags = edited(item.tags, tags, MAX_TAGS);
      unfit += nextTags.left;
      const change: Change = {};
      if (!sameList(nextTags.list, item.tags)) change.tags = nextTags.list;
      if (genre !== LEAVE && (genre !== (item.genre ?? '') || (genre ? subGenre : '') !== (item.subGenre ?? ''))) {
        change.genre = genre;
        change.subGenre = genre ? subGenre : '';
      }
      if (status && status !== item.status) change.status = status;
      return Object.keys(change).length ? [{ item, change }] : [];
    });
    return { changes, unfit };
  }

  async function apply(status?: 'approved' | 'hidden') {
    const { changes, unfit } = plan(status);
    setBusy(true); setError(''); setReport('');
    const results = await inTurns(changes.map(({ item, change }) => () => changeItem(item.id, change)));
    const saved = results.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []));
    const refused = [...new Set(results.flatMap(result => (result.status === 'rejected' ? [(result.reason as Error).message] : [])))];
    onSaved(saved.map(entry => entry.item), saved.at(-1)?.tags ?? null);
    const failed = results.length - saved.length;
    setReport([
      `Saved ${saved.length} of ${items.length}.`,
      changes.length < items.length && !failed ? `${items.length - changes.length} already had this.` : '',
      unfit ? `${unfit} tag${unfit === 1 ? '' : 's'} did not fit (an item holds at most ${MAX_TAGS} tags).` : '',
    ].filter(Boolean).join(' '));
    if (refused.length) setError(`${failed} not saved: ${refused.join(' ')}`);
    if (!failed) { setTags(NO_EDIT); setGenre(LEAVE); setSubGenre(''); }
    setBusy(false);
  }

  async function removeAll() {
    if (!window.confirm(`Delete these ${items.length} files for good? They are removed from storage and cannot be undone.`)) return;
    setBusy(true); setError('');
    const results = await inTurns(items.map(item => () => deleteItem(item.id)), 2);
    const gone = items.filter((_, at) => results[at].status === 'fulfilled').map(item => item.id);
    const last = [...results].reverse().find(result => result.status === 'fulfilled') as PromiseFulfilledResult<Library> | undefined;
    if (gone.length < items.length) setError(`${items.length - gone.length} could not be deleted. Try again in a moment.`);
    setBusy(false);
    onDeleted(last?.value ?? null, gone);
  }

  const label = 'mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground';
  return <aside aria-label="Edit selected items" className="fixed inset-y-0 right-0 z-10 flex w-full max-w-md flex-col gap-5 overflow-y-auto bg-card p-6 shadow-2xl">
    <div className="flex items-center justify-between">
      <h2 className="m-0 text-base font-semibold">{items.length} selected</h2>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Back to the selection"><XIcon className="size-4" aria-hidden="true" /></Button>
    </div>
    <p className="m-0 text-xs text-muted-foreground">Click a tag to put it on all of them; click again to take it off all. Half-filled means some have it; leave it and they keep it as it is.</p>

    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className={label}>Tags (up to {MAX_TAGS} each) · everything you see in them</legend>
      <div className="flex flex-wrap gap-1.5">
        {shownTags.map(tag => {
          const state = standing(tag, items, tags);
          return <Chip key={tag} on={state === 'all'} some={state === 'some'} onClick={() => setTags(edit => flip(edit, tag, state === 'all'))}>{tag}{!poolNames.includes(tag) && ' (new)'}</Chip>;
        })}
        {shownTags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet. Add the first one below.</span>}
      </div>
      {suggested.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Suggested:</span>
        {suggested.map(tag => <Chip key={tag} on={false} onClick={() => addNewTag(tag)}>{tag}</Chip>)}
      </div>}
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); addNewTag(newTag); }}>
        <input value={newTag} onChange={event => setNewTag(event.target.value)} maxLength={24} placeholder="New tag for all, like beach" aria-label="New tag for all"
          className="min-w-0 flex-1 rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm outline-ring focus-visible:outline-2" />
        <Button variant="secondary" type="submit" disabled={!newTag.trim()}>Add</Button>
      </form>
    </fieldset>

    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className={label}>Genre · for all of them</legend>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Genre for all" value={genre} onChange={event => { setGenre(event.target.value); setSubGenre(''); }}
          className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm outline-ring focus-visible:outline-2">
          <option value={LEAVE}>Leave as it is</option>
          <option value="">Any genre</option>
          {GENRES.map(entry => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
        </select>
        <select aria-label="Sub-genre for all" value={subGenre} disabled={!group} onChange={event => setSubGenre(event.target.value)}
          className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm outline-ring focus-visible:outline-2 disabled:opacity-50">
          <option value="">Any sub-genre</option>
          {group?.subGenres.map(entry => <option key={entry} value={entry}>{entry}</option>)}
        </select>
      </div>
    </fieldset>

    {report && <p role="status" className="m-0 text-sm text-emerald-700">{report}</p>}
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    <div className="mt-auto flex flex-wrap items-center gap-2">
      <Button disabled={busy} onClick={() => void apply('approved')}><CheckIcon className="size-4" aria-hidden="true" />{dirty ? 'Save and approve all' : 'Approve all'}</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void apply('hidden')}><EyeOffIcon className="size-4" aria-hidden="true" />Hide all</Button>
      <Button variant="secondary" disabled={busy || !dirty} onClick={() => void apply()}>Save changes</Button>
      <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" disabled={busy} onClick={() => void removeAll()}><Trash2Icon className="size-4" aria-hidden="true" />Delete all</Button>
    </div>
  </aside>;
}

/** The whole tag list, with how many items use each; remove one you do not need, so the list stays short. */
function Tags({ tags, onChange }: { tags: TagCount[]; onChange: (library: Library) => void }) {
  const [error, setError] = useState('');
  async function remove(tag: TagCount) {
    if (tag.items > 0 && !window.confirm(`Remove "${tag.name}"? It is taken off the ${tag.items} item${tag.items === 1 ? '' : 's'} that use it.`)) return;
    try { onChange(await deleteTag(tag.name)); setError(''); } catch (cause) { setError((cause as Error).message); }
  }
  return <section aria-label="Tags" className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-card p-5 shadow-sm">
    <h2 className="m-0 text-sm font-medium">Tags <span className="text-muted-foreground">({tags.length} of {MAX_TAGS_IN_POOL}). Fewer tags help the choice stay fast.</span></h2>
    <div className="flex flex-wrap gap-1.5">
      {tags.length === 0 && <span className="text-xs text-muted-foreground">None yet.</span>}
      {tags.map(tag => <span key={tag.name} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-xs">
        {tag.name} <span className="text-muted-foreground">{tag.items}</span>
        <button type="button" aria-label={`Remove tag ${tag.name}`} onClick={() => void remove(tag)} className="flex size-5 items-center justify-center rounded-full bg-transparent p-0 text-muted-foreground hover:bg-secondary hover:text-foreground"><XIcon className="size-3" aria-hidden="true" /></button>
      </span>)}
    </div>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
  </section>;
}

type StatusFilter = 'all' | LibraryStatus;

export function LibraryView({ onChanged }: { onChanged: () => void }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tag, setTag] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  /** The ticked cards are being edited (the panel is open); until then only the selection bar shows. */
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!picked.length) setEditing(false); }, [picked.length]);
  const anchor = useRef<string | null>(null);

  useEffect(() => { loadLibrary().then(setLibrary, (cause: Error) => setError(cause.message)); }, []);
  // A video or GIF is being prepared by our worker: look again until it is ready (or has said why it cannot be).
  const waiting = Boolean(library?.items.some(item => !item.ready && !item.problem));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => { loadLibrary().then(setLibrary, () => undefined); }, 6000);
    return () => clearInterval(timer);
  }, [waiting]);

  const replace = (next: Library) => { setLibrary(next); onChanged(); };
  const items = library?.items ?? [];
  const tagFits = (item: LibraryItem) => !tag || (tag === NO_TAGS ? item.tags.length === 0 : item.tags.includes(tag));
  const shown = items.filter(item => (status === 'all' || item.status === status) && tagFits(item));
  const count = (value: StatusFilter) => value === 'all' ? items.length : items.filter(item => item.status === value).length;
  const open = items.find(item => item.id === openId) ?? null;
  const chosen = items.filter(item => picked.includes(item.id));
  const allShownPicked = shown.length > 0 && shown.every(item => picked.includes(item.id));

  /** Ticks or unticks one card; with shift, every card shown between it and the last one ticked follows it. */
  function tick(id: string, range: boolean) {
    setOpenId(null);
    const on = !picked.includes(id);
    const from = range && anchor.current ? shown.findIndex(item => item.id === anchor.current) : -1;
    const to = shown.findIndex(item => item.id === id);
    const ids = from >= 0 && to >= 0 ? shown.slice(Math.min(from, to), Math.max(from, to) + 1).map(item => item.id) : [id];
    setPicked(list => (on ? [...new Set([...list, ...ids])] : list.filter(entry => !ids.includes(entry))));
    anchor.current = id;
  }
  const refresh = () => loadLibrary().then(setLibrary, () => undefined);

  return <div className={`mx-auto flex max-w-6xl flex-col gap-6 ${chosen.length ? 'pb-24' : ''}`}>
    <header><h1 className="m-0 text-2xl font-semibold">Library</h1>
      <p className="m-0 mt-1 text-sm text-muted-foreground">Cleared photos, videos and GIFs the templates may use. Only approved items are ever used.</p></header>
    <Uploader onAdded={item => { setLibrary(current => current && { ...current, items: [item, ...current.items] }); onChanged(); }}
      onDone={ids => { if (ids.length === 1) { setPicked([]); setOpenId(ids[0]); } else { setOpenId(null); setPicked(ids); } }} />
    {library && <Tags tags={library.tags} onChange={replace} />}
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}

    <div className="flex flex-wrap items-center gap-2">
      {(['all', 'pending', 'approved', 'hidden'] as const).map(value => <Chip key={value} on={status === value} onClick={() => setStatus(value)}>
        {value === 'all' ? 'All' : STATUS_LABEL[value]} {count(value)}</Chip>)}
      <select aria-label="Filter by tag" value={tag} onChange={event => setTag(event.target.value)}
        className="ml-auto rounded-[var(--radius-control)] bg-card px-3 py-1.5 text-sm shadow-sm outline-ring focus-visible:outline-2">
        <option value="">Every tag</option>
        <option value={NO_TAGS}>No tags yet ({items.filter(item => item.tags.length === 0).length})</option>
        {(library?.tags ?? []).map(entry => <option key={entry.name} value={entry.name}>{entry.name} ({items.filter(item => item.tags.includes(entry.name)).length})</option>)}
      </select>
    </div>
    {shown.length > 0 && <div className="-mt-3 flex flex-wrap items-center gap-2 text-sm">
      <Button variant="secondary" size="sm" onClick={() => { setOpenId(null); setPicked(list => (allShownPicked ? list.filter(id => !shown.some(item => item.id === id)) : [...new Set([...list, ...shown.map(item => item.id)])])); }}>
        {allShownPicked ? 'Unselect these' : `Select all shown (${shown.length})`}</Button>
      {picked.length > 0 && <Button variant="ghost" size="sm" onClick={() => setPicked([])}>Clear selection ({picked.length})</Button>}
      <span className="text-xs text-muted-foreground">Tick cards to edit many at once. Shift-click a tick to select a run of them.</span>
    </div>}

    {!library ? <p className="m-0 text-sm text-muted-foreground">Loading…</p>
      : shown.length === 0 ? <p className="m-0 rounded-[var(--radius-panel)] bg-card p-10 text-center text-sm text-muted-foreground">
        {items.length === 0 ? 'Nothing here yet. Add your first cleared file above.' : 'Nothing matches these filters.'}</p>
      : <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {shown.map(item => <Card key={item.id} item={item} selected={item.id === openId} ticked={picked.includes(item.id)}
          onSelect={() => (picked.length ? tick(item.id, false) : setOpenId(item.id))} onTick={range => tick(item.id, range)} />)}
      </div>}

    <SelectionBar count={chosen.length} shown={chosen.length > 0 && !editing} onClear={() => setPicked([])} onEdit={() => setEditing(true)} />
    {chosen.length > 0 && editing && library && <BulkPanel items={chosen} pool={library.tags} onClose={() => setEditing(false)}
      onSaved={(saved, tags) => {
        setLibrary(current => current && { items: current.items.map(item => saved.find(entry => entry.id === item.id) ?? item), tags: tags ?? current.tags });
        onChanged(); void refresh();
      }}
      onDeleted={(next, gone) => { setPicked(list => list.filter(id => !gone.includes(id))); if (next) replace(next); else void refresh(); }} />}
    {!chosen.length && open && library && <Panel item={open} pool={library.tags} onClose={() => setOpenId(null)}
      onSaved={(saved, tags) => { setLibrary(current => current && { items: current.items.map(item => item.id === saved.id ? saved : item), tags }); onChanged(); }}
      onDeleted={next => { setOpenId(null); replace(next); }} />}
  </div>;
}
