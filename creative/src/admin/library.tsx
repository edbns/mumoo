import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CheckIcon, EyeOffIcon, FilmIcon, ImageIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GENRES } from '../genres';
import { themesFor } from '../genre-guide';
import { ATTITUDES } from '../lyric-meaning';
import {
  changeItem, deleteItem, deleteTag, loadLibrary, uploadFile,
  type Change, type Library, type LibraryItem, type LibraryStatus, type TagCount,
} from './api';

/** The most the server allows; the page stops short of them so a person is never told off after the fact. */
const MAX_ATTITUDES = 4;
const MAX_TAGS = 5;
const MAX_TAGS_IN_POOL = 40;
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

function Chip({ on, children, ...props }: { on: boolean } & React.ComponentProps<'button'>) {
  return <button type="button" aria-pressed={on} {...props}
    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${on ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground'} disabled:cursor-not-allowed disabled:opacity-40`}>{children}</button>;
}

function Media({ item, controls = false }: { item: LibraryItem; controls?: boolean }) {
  if (item.kind !== 'video') return <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />;
  return <video src={item.url} muted loop playsInline preload="metadata" controls={controls} className="size-full object-cover"
    onMouseEnter={controls ? undefined : event => void event.currentTarget.play().catch(() => undefined)}
    onMouseLeave={controls ? undefined : event => { event.currentTarget.pause(); event.currentTarget.currentTime = 0; }} />;
}

type Sending = { name: string; state: 'sending' | 'done' | 'failed'; reason?: string };

/** Drop files in, say once that you cleared them, and they join the library as "Waiting" until you tag and approve them. */
function Uploader({ onAdded }: { onAdded: (item: LibraryItem) => void }) {
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
    for (const [index, file] of files.entries()) {
      try {
        onAdded(await uploadFile(file, note));
        set(index, { name: file.name, state: 'done' });
      } catch (cause) {
        set(index, { name: file.name, state: 'failed', reason: (cause as Error).message });
      }
    }
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

function Card({ item, selected, onSelect }: { item: LibraryItem; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${item.kind}, ${STATUS_LABEL[item.status]}${item.attitudes.length ? `, ${item.attitudes.join(', ')}` : ', no attitude yet'}`}
    className={`group flex flex-col overflow-hidden rounded-[var(--radius-panel)] bg-card p-0 text-left shadow-sm outline-ring transition-shadow focus-visible:outline-2 ${selected ? 'ring-2 ring-foreground' : 'hover:shadow-md'}`}>
    <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
      <Media item={item} />
      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      {!item.ready && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${item.problem ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{item.problem ? 'Cannot be used' : 'Preparing…'}</span>}
      <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {item.kind === 'video' ? <FilmIcon className="size-3" aria-hidden="true" /> : <ImageIcon className="size-3" aria-hidden="true" />}{item.kind === 'gif' ? 'GIF' : cap(item.kind)}
      </span>
    </div>
    <div className="flex min-h-14 flex-wrap content-start gap-1 p-3">
      {item.attitudes.length === 0 && <span className="text-xs text-destructive">No attitude yet</span>}
      {item.attitudes.map(code => <span key={code} className="rounded-full bg-foreground px-2 py-0.5 text-xs text-background">{cap(code)}</span>)}
      {item.tags.map(tag => <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>)}
    </div>
  </button>;
}

/** The side panel for one item: what it is for (attitudes, tags, genre), where it came from, and approve, hide or delete. */
function Panel({ item, pool, onClose, onSaved, onDeleted }: {
  item: LibraryItem; pool: TagCount[]; onClose: () => void;
  onSaved: (item: LibraryItem, tags: TagCount[]) => void; onDeleted: (library: Library) => void;
}) {
  const [attitudes, setAttitudes] = useState(item.attitudes);
  const [tags, setTags] = useState(item.tags);
  const [genre, setGenre] = useState(item.genre ?? '');
  const [subGenre, setSubGenre] = useState(item.subGenre ?? '');
  const [note, setNote] = useState(item.note);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Another item was chosen: start from its values.
  useEffect(() => {
    setAttitudes(item.attitudes); setTags(item.tags); setGenre(item.genre ?? ''); setSubGenre(item.subGenre ?? ''); setNote(item.note); setNewTag(''); setError('');
  }, [item.id]);

  const same = (a: string[], b: string[]) => a.length === b.length && a.every(value => b.includes(value));
  const dirty = !same(attitudes, item.attitudes) || !same(tags, item.tags) || genre !== (item.genre ?? '') || subGenre !== (item.subGenre ?? '') || note !== item.note;
  const toggle = (list: string[], value: string, limit: number) => list.includes(value) ? list.filter(entry => entry !== value) : list.length < limit ? [...list, value] : list;
  const group = GENRES.find(entry => entry.name === genre);
  const poolNames = pool.map(entry => entry.name);
  const shownTags = [...poolNames, ...tags.filter(tag => !poolNames.includes(tag))];

  // The guidance's themes for the chosen genre: one click gives the item a tag the brain looks for.
  const suggested = genre ? themesFor(genre, subGenre) : [];
  function suggest(tag: string) {
    if (tags.includes(tag)) return setTags(list => list.filter(entry => entry !== tag));
    if (tags.length >= MAX_TAGS) return setError(`At most ${MAX_TAGS} tags for one item. Fewer is better.`);
    if (!poolNames.includes(tag) && poolNames.length >= MAX_TAGS_IN_POOL) return setError(`The tag list is full (${MAX_TAGS_IN_POOL}). Remove one you do not use, or reuse one.`);
    setError(''); setTags(list => [...list, tag]);
  }

  function addNewTag() {
    const tag = newTag.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!tag) return;
    if (tags.length >= MAX_TAGS) return setError(`At most ${MAX_TAGS} tags for one item. Fewer is better.`);
    if (!poolNames.includes(tag) && poolNames.length >= MAX_TAGS_IN_POOL) return setError(`The tag list is full (${MAX_TAGS_IN_POOL}). Remove one you do not use, or reuse one.`);
    setError(''); setTags(list => list.includes(tag) ? list : [...list, tag]); setNewTag('');
  }

  async function save(status?: 'approved' | 'hidden') {
    setBusy(true); setError('');
    const change: Change = { attitudes, tags, genre, subGenre: genre ? subGenre : '', note, ...(status && { status }) };
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
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Attitude (up to {MAX_ATTITUDES}) · the feeling it suits</legend>
      <div className="flex flex-wrap gap-1.5">
        {ATTITUDES.map(code => <Chip key={code} on={attitudes.includes(code)} disabled={!attitudes.includes(code) && attitudes.length >= MAX_ATTITUDES}
          onClick={() => setAttitudes(list => toggle(list, code, MAX_ATTITUDES))}>{cap(code)}</Chip>)}
      </div>
    </fieldset>

    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags (up to {MAX_TAGS}) · what is in it</legend>
      <div className="flex flex-wrap gap-1.5">
        {shownTags.map(tag => <Chip key={tag} on={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= MAX_TAGS}
          onClick={() => setTags(list => toggle(list, tag, MAX_TAGS))}>{tag}{!poolNames.includes(tag) && ' (new)'}</Chip>)}
        {shownTags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet. Add the first one below.</span>}
      </div>
      {suggested.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Suggested for {subGenre || genre}:</span>
        {suggested.map(tag => <Chip key={tag} on={tags.includes(tag)} onClick={() => suggest(tag)}>{tag}</Chip>)}
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
    <p className="m-0 text-xs text-muted-foreground">Cleared by {item.clearedBy} on {when(item.clearedAt)} · {item.contentType} · {megabytes(item.bytes)}</p>

    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    <div className="mt-auto flex flex-wrap items-center gap-2">
      {item.status !== 'approved' && <Button disabled={busy || attitudes.length === 0} onClick={() => void save('approved')} title={attitudes.length === 0 ? 'Choose an attitude first' : undefined}><CheckIcon className="size-4" aria-hidden="true" />Approve</Button>}
      {item.status !== 'hidden' && <Button variant="secondary" disabled={busy} onClick={() => void save('hidden')}><EyeOffIcon className="size-4" aria-hidden="true" />Hide</Button>}
      <Button variant="secondary" disabled={busy || !dirty} onClick={() => void save()}>Save changes</Button>
      <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" disabled={busy} onClick={() => void remove()}><Trash2Icon className="size-4" aria-hidden="true" />Delete</Button>
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
  const [attitude, setAttitude] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

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
  const shown = items.filter(item => (status === 'all' || item.status === status) && (!attitude || item.attitudes.includes(attitude)));
  const count = (value: StatusFilter) => value === 'all' ? items.length : items.filter(item => item.status === value).length;
  const open = items.find(item => item.id === openId) ?? null;

  return <div className="mx-auto flex max-w-6xl flex-col gap-6">
    <header><h1 className="m-0 text-2xl font-semibold">Library</h1>
      <p className="m-0 mt-1 text-sm text-muted-foreground">Cleared photos, videos and GIFs the templates may use. Only approved items are ever used.</p></header>
    <Uploader onAdded={item => { setLibrary(current => current && { ...current, items: [item, ...current.items] }); setOpenId(item.id); onChanged(); }} />
    {library && <Tags tags={library.tags} onChange={replace} />}
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}

    <div className="flex flex-wrap items-center gap-2">
      {(['all', 'pending', 'approved', 'hidden'] as const).map(value => <Chip key={value} on={status === value} onClick={() => setStatus(value)}>
        {value === 'all' ? 'All' : STATUS_LABEL[value]} {count(value)}</Chip>)}
      <select aria-label="Filter by attitude" value={attitude} onChange={event => setAttitude(event.target.value)}
        className="ml-auto rounded-[var(--radius-control)] bg-card px-3 py-1.5 text-sm shadow-sm outline-ring focus-visible:outline-2">
        <option value="">Every attitude</option>
        {ATTITUDES.map(code => <option key={code} value={code}>{cap(code)} ({items.filter(item => item.attitudes.includes(code)).length})</option>)}
      </select>
    </div>

    {!library ? <p className="m-0 text-sm text-muted-foreground">Loading…</p>
      : shown.length === 0 ? <p className="m-0 rounded-[var(--radius-panel)] bg-card p-10 text-center text-sm text-muted-foreground">
        {items.length === 0 ? 'Nothing here yet. Add your first cleared file above.' : 'Nothing matches these filters.'}</p>
      : <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {shown.map(item => <Card key={item.id} item={item} selected={item.id === openId} onSelect={() => setOpenId(item.id)} />)}
      </div>}

    {open && library && <Panel item={open} pool={library.tags} onClose={() => setOpenId(null)}
      onSaved={(saved, tags) => { setLibrary(current => current && { items: current.items.map(item => item.id === saved.id ? saved : item), tags }); onChanged(); }}
      onDeleted={next => { setOpenId(null); replace(next); }} />}
  </div>;
}
