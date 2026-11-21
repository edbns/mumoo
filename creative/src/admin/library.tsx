import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CheckIcon, EyeOffIcon, FilmIcon, ImageIcon, PlayIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { GENRES } from '../genres';
import { BOARDS, BOARD_MIN } from '../boards';
import { themesFor } from '../genre-guide';
import {
  changeItem, deleteItem, deleteTag, loadLibrary, uploadFile,
  type Change, type Library, type LibraryItem, type LibraryStatus, type TagCount,
} from './api';

/** The most the server allows; the page stops short of them so a person is never told off after the fact. */
const MAX_TAGS = 15;
const MAX_TAGS_IN_POOL = 200;
/** Tags are optional now (the boards and the vision model do their job), so they stay folded away until opened. */
const TAGS_SUMMARY = 'cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-muted-foreground';
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
const boardName = (id: string) => BOARDS.find(board => board.id === id)?.name ?? id;
const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** `some`: on for only part of a selection (shown half-on, `aria-pressed="mixed"`). */
function Chip({ on, some = false, children, ...props }: { on: boolean; some?: boolean } & React.ComponentProps<'button'>) {
  const look = on ? 'bg-foreground text-background' : some ? 'bg-secondary text-foreground ring-1 ring-inset ring-foreground/40' : 'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground';
  return <button type="button" aria-pressed={on ? true : some ? 'mixed' : false} {...props}
    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${look} disabled:cursor-not-allowed disabled:opacity-40`}>{children}</button>;
}

/**
 * A card's picture: a photo, or a video's still with its light copy over it while `live` (hovered). The copy is only made then, so it
 * starts from its first frame each time and a page of cards never downloads hundreds of videos. Before a video is prepared, its upload.
 */
function Media({ item, live = false }: { item: LibraryItem; live?: boolean }) {
  const still = item.kind === 'photo' ? item.url : item.poster;
  return <>
    {still ? <img src={still} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      : <video src={item.url} muted playsInline preload={item.problem ? 'none' : 'metadata'} className="size-full object-cover" />}
    {live && item.preview && <video src={item.preview} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />}
  </>;
}

/** Opens the player: on a card, over the middle of its picture. */
function PlayButton({ item, onPlay }: { item: LibraryItem; onPlay: () => void }) {
  return <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[3/4]">
    <button type="button" aria-label={`Play the whole ${item.kind === 'gif' ? 'GIF' : item.kind}`} onClick={onPlay}
      className="pointer-events-auto absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-black/60 p-0 text-white opacity-0 outline-ring transition-[opacity,background-color] hover:bg-black/80 focus-visible:opacity-100 focus-visible:outline-2 group-hover/card:opacity-100">
      <PlayIcon className="ml-0.5 size-5 fill-current" aria-hidden="true" />
    </button>
  </div>;
}

/**
 * The file as it was uploaded, whole and with sound, to check it before deciding. A browser that cannot play the upload (often a MOV)
 * gets our prepared copy instead (the whole video, no sound), and the original stays a click away.
 */
function Player({ item, onClose }: { item: LibraryItem | null; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item?.id]);
  const source = item && (failed ? item.preview : item.url);
  const frame = 'max-h-[calc(100vh-11rem)] w-full rounded-[var(--radius)] bg-black object-contain';
  return <Modal open={item !== null} onClose={onClose} bare maxWidth={520} maxHeight="calc(100vh - 3rem)"
    title={item ? `${item.kind === 'gif' ? 'GIF' : cap(item.kind)}, ${STATUS_LABEL[item.status]}` : ''}>
    {item && <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-muted p-3 shadow-[0_28px_56px_-24px_#000]">
      {item.kind !== 'video' ? <img src={item.url} alt="" className={frame} />
        : source ? <video key={source} src={source} controls autoPlay playsInline poster={item.poster ?? undefined} onError={() => setFailed(true)} className={frame} />
        : <p className="m-0 p-6 text-center text-sm text-muted-foreground">This browser cannot play this {item.contentType} file and it is not prepared yet. Open the original to check it.</p>}
      {failed && source && <p className="m-0 px-1 text-xs text-muted-foreground">This browser cannot play the uploaded {item.contentType} file, so this is our prepared copy: the whole video, without sound.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
        <span>{item.contentType} · {megabytes(item.bytes)}{item.width && item.height ? ` · ${item.width}×${item.height}` : ''}</span>
        <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-4 hover:underline">Open the original</a>
      </div>
    </div>}
  </Modal>;
}

type Sending = { name: string; state: 'sending' | 'done' | 'failed'; reason?: string };

/**
 * Drop files in, say once that you cleared them, and they join the library as "Waiting", in the tray, until they are filed on a board
 * (which approves them). Files dropped with a board chosen are filed, and so approved, at once.
 */
function Uploader({ onAdded }: { onAdded: (item: LibraryItem) => void }) {
  const [rights, setRights] = useState(false);
  const [note, setNote] = useState('');
  /** Files dropped while a board is chosen go straight into it. */
  const [board, setBoard] = useState('');
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
        const sent = await uploadFile(file, note);
        onAdded(board ? (await changeItem(sent.id, { boards: [board], status: 'approved' })).item : sent);
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
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Mood board (optional)
          <select value={board} onChange={event => setBoard(event.target.value)}
            className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm font-normal text-foreground outline-ring focus-visible:outline-2">
            <option value="">Let our models suggest one</option>
            {BOARDS.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
          {board && <span className="font-normal">Look for: {BOARDS.find(entry => entry.id === board)?.hunt}</span>}
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
function Card({ item, selected, ticked, onSelect, onTick, onPlay }: {
  item: LibraryItem; selected: boolean; ticked: boolean; onSelect: () => void; onTick: (range: boolean) => void; onPlay: () => void;
}) {
  const boards = BOARDS.filter(board => item.boards.includes(board.id)).map(board => board.name);
  const [hover, setHover] = useState(false);
  return <div className="group/card relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
  <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${item.kind}, ${STATUS_LABEL[item.status]}${boards.length ? `, ${boards.join(', ')}` : ', no board yet'}`}
    className={`group flex w-full flex-col overflow-hidden rounded-[var(--radius-panel)] bg-card p-0 text-left shadow-sm outline-ring transition-shadow focus-visible:outline-2 ${selected || ticked ? 'ring-2 ring-foreground' : 'hover:shadow-md'}`}>
    <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
      <Media item={item} live={hover} />
      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      {!item.ready && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-xs font-medium ${item.problem ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{item.problem ? 'Cannot be used' : 'Preparing…'}</span>}
      {item.ready && item.warning && <span className="absolute bottom-2 left-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Low resolution</span>}
      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {item.kind === 'video' ? <FilmIcon className="size-3" aria-hidden="true" /> : <ImageIcon className="size-3" aria-hidden="true" />}{item.kind === 'gif' ? 'GIF' : cap(item.kind)}
      </span>
    </div>
    <div className="flex min-h-14 flex-wrap content-start gap-1 p-3">
      {boards.length === 0 && <span className="text-xs text-amber-700">No board yet</span>}
      {boards.map(name => <span key={name} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{name}</span>)}
    </div>
  </button>
  {item.kind !== 'photo' && <PlayButton item={item} onPlay={onPlay} />}
  <button type="button" role="checkbox" aria-checked={ticked} aria-label={ticked ? 'Unselect' : 'Select'} onClick={event => onTick(event.shiftKey)}
    className={`absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border-2 p-0 shadow-sm outline-ring transition-colors focus-visible:outline-2 ${ticked ? 'border-foreground bg-foreground text-background' : 'border-white bg-black/40 text-transparent hover:bg-black/60'}`}>
    <CheckIcon className="size-4" aria-hidden="true" />
  </button>
  </div>;
}

/** Tags worth offering that the list does not have yet: the chosen genre's looks, then the common words. */
const suggestionsFor = (genre: string, subGenre: string, poolNames: readonly string[]) =>
  [...new Set([...(genre ? themesFor(genre, subGenre) : []), ...COMMON_TAGS])].filter(tag => !poolNames.includes(tag));

/** The side panel for one item: what is in it (tags), a genre it is kept for, where it came from, and approve, hide or delete. It closes once saved. */
function Panel({ item, pool, onClose, onPlay, onSaved, onDeleted }: {
  item: LibraryItem; pool: TagCount[]; onClose: () => void; onPlay: () => void;
  onSaved: (item: LibraryItem, tags: TagCount[]) => void; onDeleted: (library: Library) => void;
}) {
  const [tags, setTags] = useState(item.tags);
  const [genre, setGenre] = useState(item.genre ?? '');
  const [subGenre, setSubGenre] = useState(item.subGenre ?? '');
  const [boards, setBoards] = useState(item.boards);
  const [note, setNote] = useState(item.note);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Another item was chosen: start from its values.
  useEffect(() => {
    setTags(item.tags); setGenre(item.genre ?? ''); setSubGenre(item.subGenre ?? ''); setBoards(item.boards); setNote(item.note); setNewTag(''); setError('');
  }, [item.id]);

  const same = (a: string[], b: string[]) => a.length === b.length && a.every(value => b.includes(value));
  const dirty = !same(tags, item.tags) || !same(boards, item.boards) || genre !== (item.genre ?? '') || subGenre !== (item.subGenre ?? '') || note !== item.note;
  const toggle = (list: string[], value: string, limit: number) => list.includes(value) ? list.filter(entry => entry !== value) : list.length < limit ? [...list, value] : list;
  const group = GENRES.find(entry => entry.name === genre);
  const poolNames = pool.map(entry => entry.name);
  const shownTags = [...poolNames, ...tags.filter(tag => !poolNames.includes(tag))];

  // One click gives the item a tag the brain looks for; it then shows among the item's tags.
  const seen = item.seen.filter(tag => !tags.includes(tag));
  const suggested = suggestionsFor(genre, subGenre, [...poolNames, ...tags, ...seen]);
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
    const change: Change = { tags, genre, subGenre: genre ? subGenre : '', boards, note, ...(status && { status }) };
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
    <div className="relative aspect-[3/4] max-h-80 self-center overflow-hidden rounded-[var(--radius-panel)] bg-muted"><Media item={item} live /></div>
    {item.kind !== 'photo' && <Button variant="secondary" className="self-center" onClick={onPlay}><PlayIcon className="size-4" aria-hidden="true" />Play the whole file</Button>}
    {(item.seenAs || item.suggestion) && <div className="flex flex-col gap-1 rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm">
      {item.seenAs && <span>{item.seenAs}</span>}
      {item.suggestion && <span className="text-xs text-muted-foreground">
        Suggested: {item.suggestion.boards.map(boardName).join(' or ')}{item.suggestion.sure ? '' : ' (not sure)'}</span>}
      {item.also.length > 0 && <span className="text-xs text-muted-foreground">Would also fit: {item.also.map(boardName).join(', ')}</span>}
    </div>}
    {item.colours && <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Colours · matched to each song's genre</span>
      <div className="flex h-5 overflow-hidden rounded-[var(--radius-control)]" role="img" aria-label={`Colours: ${item.colours.map(colour => colour.hex).join(', ')}`}>
        {item.colours.map(colour => <span key={colour.hex} style={{ background: colour.hex, flexGrow: colour.share }} title={`${colour.hex} · ${Math.round(colour.share * 100)}%`} />)}
      </div>
    </div>}

    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mood boards · the scenes it belongs to</legend>
      <div className="flex flex-wrap gap-1.5">
        {BOARDS.map(board => <Chip key={board.id} on={boards.includes(board.id)} title={board.hunt}
          onClick={() => setBoards(list => list.includes(board.id) ? list.filter(id => id !== board.id) : [...list, board.id])}>
          {board.name}{!boards.includes(board.id) && (boards.length ? item.also : item.suggestion?.boards ?? []).includes(board.id) ? ' · suggested' : ''}</Chip>)}
      </div>
    </fieldset>

    <details className="group">
    <summary className={TAGS_SUMMARY}>Tags (optional) · our vision model already sees what is in it</summary>
    <fieldset className="m-0 mt-2 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">Tags (up to {MAX_TAGS})</legend>
      <div className="flex flex-wrap gap-1.5">
        {shownTags.map(tag => <Chip key={tag} on={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= MAX_TAGS}
          onClick={() => setTags(list => toggle(list, tag, MAX_TAGS))}>{tag}{!poolNames.includes(tag) && ' (new)'}</Chip>)}
        {shownTags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet. Add the first one below.</span>}
      </div>
      {seen.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Seen in it:</span>
        {seen.map(tag => <Chip key={tag} on={false} onClick={() => suggest(tag)}>{tag}</Chip>)}
      </div>}
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
    </details>

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
/** How a tag (or, with `of`, a board) stands across the selection, once the edit is applied: on all, on some, or on none. */
function standing(code: string, items: readonly LibraryItem[], edit: Edit, of: (item: LibraryItem) => readonly string[] = item => item.tags): 'all' | 'some' | 'none' {
  if (edit.add.includes(code)) return 'all';
  if (edit.drop.includes(code)) return 'none';
  const having = items.filter(item => of(item).includes(code)).length;
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

/** The selection, while cards are being ticked: how many, and the way to edit them (the panel would hide half the cards). */
function SelectionBar({ count, shown, onClear, onEdit }: { count: number; shown: boolean; onClear: () => void; onEdit: () => void }) {
  return <div role="region" aria-label="Selection" aria-hidden={!shown}
    className={`fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground py-2 pl-5 pr-2 text-background shadow-2xl transition-transform duration-300 ease-out ${shown ? 'translate-y-0' : 'pointer-events-none translate-y-[200%]'}`}>
    <span className="text-sm font-medium tabular-nums">{count} selected</span>
    <Button variant="ghost" size="sm" tabIndex={shown ? 0 : -1} className="text-background hover:bg-background/15 hover:text-background" onClick={onClear}>Clear</Button>
    <Button size="sm" tabIndex={shown ? 0 : -1} className="bg-background text-foreground hover:bg-background/90" onClick={onEdit}>Edit {count}</Button>
  </div>;
}

/**
 * The side panel for several items at once: tags put on or taken off all of them, one genre for all, and approve, hide or delete them
 * together. Once every one is saved, the selection is let go (`onDone`).
 */
function BulkPanel({ items, pool, onClose, onDone, onSaved, onDeleted }: {
  items: LibraryItem[]; pool: TagCount[]; onClose: () => void; onDone: () => void;
  onSaved: (items: LibraryItem[], tags: TagCount[] | null) => void; onDeleted: (library: Library | null, gone: string[]) => void;
}) {
  const [tags, setTags] = useState<Edit>(NO_EDIT);
  const [boards, setBoards] = useState<Edit>(NO_EDIT);
  /** Each item also takes the tags our vision model saw in it (its own, not the others'). */
  const [withSeen, setWithSeen] = useState(false);
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
  const seenCount = items.filter(item => item.seen.length).length;
  const dirty = tags.add.length + tags.drop.length + boards.add.length + boards.drop.length > 0 || withSeen || genre !== LEAVE;

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
      const own = withSeen ? { ...tags, add: [...tags.add, ...item.seen.filter(tag => !tags.drop.includes(tag))] } : tags;
      const nextTags = edited(item.tags, own, MAX_TAGS);
      unfit += nextTags.left;
      const change: Change = {};
      if (!sameList(nextTags.list, item.tags)) change.tags = nextTags.list;
      const nextBoards = edited(item.boards, boards, BOARDS.length).list;
      if (!sameList(nextBoards, item.boards)) change.boards = nextBoards;
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
    setBusy(false);
    if (!failed) onDone();
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
    <p className="m-0 text-xs text-muted-foreground">Click a board to put all of them on it; click again to take them all off. Half-filled means some are on it; leave it and each stays as it is.</p>

    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className={label}>Mood boards · for all of them</legend>
      <div className="flex flex-wrap gap-1.5">
        {BOARDS.map(board => {
          const state = standing(board.id, items, boards, item => item.boards);
          return <Chip key={board.id} on={state === 'all'} some={state === 'some'} title={board.hunt} onClick={() => setBoards(edit => flip(edit, board.id, state === 'all'))}>{board.name}</Chip>;
        })}
      </div>
    </fieldset>

    <details className="group">
    <summary className={TAGS_SUMMARY}>Tags (optional) · our vision model already sees what is in them</summary>
    <fieldset className="m-0 mt-2 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">Tags (up to {MAX_TAGS} each)</legend>
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
      {seenCount > 0 && <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={withSeen} onChange={event => setWithSeen(event.target.checked)} />
        Also give each one the tags the system saw in it ({seenCount} have some)
      </label>}
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); addNewTag(newTag); }}>
        <input value={newTag} onChange={event => setNewTag(event.target.value)} maxLength={24} placeholder="New tag for all, like beach" aria-label="New tag for all"
          className="min-w-0 flex-1 rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm outline-ring focus-visible:outline-2" />
        <Button variant="secondary" type="submit" disabled={!newTag.trim()}>Add</Button>
      </form>
    </fieldset>
    </details>

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
  return <details aria-label="Tags" className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-card p-5 shadow-sm">
    <summary className={TAGS_SUMMARY}>Tag list (optional) · {tags.length} of {MAX_TAGS_IN_POOL}. Boards and our vision model do this job now.</summary>
    <div className="mt-3 flex flex-col gap-3">
    <div className="flex flex-wrap gap-1.5">
      {tags.length === 0 && <span className="text-xs text-muted-foreground">None yet.</span>}
      {tags.map(tag => <span key={tag.name} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-xs">
        {tag.name} <span className="text-muted-foreground">{tag.items}</span>
        <button type="button" aria-label={`Remove tag ${tag.name}`} onClick={() => void remove(tag)} className="flex size-5 items-center justify-center rounded-full bg-transparent p-0 text-muted-foreground hover:bg-secondary hover:text-foreground"><XIcon className="size-3" aria-hidden="true" /></button>
      </span>)}
    </div>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    </div>
  </details>;
}

/**
 * How full each mood board is. A board reaches the creatives once it has `BOARD_MIN` approved, ready items; until then the
 * brain picks from the whole library. Clicking a board shows only its items.
 */
function Boards({ items, chosen, onChoose }: { items: readonly LibraryItem[]; chosen: string; onChoose: (board: string) => void }) {
  const usable = (id: string) => items.filter(item => item.boards.includes(id) && item.status === 'approved' && item.ready).length;
  return <section aria-label="Mood boards" className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-card p-5 shadow-sm">
    <div>
      <h2 className="m-0 text-sm font-medium">Mood boards</h2>
      <p className="m-0 text-xs text-muted-foreground">Each board is one scene. The brain picks the boards for a song; a board is used once it has {BOARD_MIN} approved, ready items. Keep each board’s light and colours alike.
        Below are only the items not on a board yet; click a board to see what is on it.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {BOARDS.map(board => {
        const ready = usable(board.id);
        const filed = items.filter(item => item.boards.includes(board.id)).length;
        const could = items.filter(item => item.also.includes(board.id)).length;
        return <button key={board.id} type="button" aria-pressed={chosen === board.id} onClick={() => onChoose(chosen === board.id ? NO_BOARD : board.id)}
          className={`flex flex-col gap-1 rounded-[var(--radius-control)] p-3 text-left outline-ring transition-colors focus-visible:outline-2 ${chosen === board.id ? 'bg-foreground text-background' : 'bg-muted hover:bg-secondary'}`}>
          <span className="flex items-center justify-between gap-2 text-sm font-medium">{board.name}
            <span className={`rounded-full px-2 py-0.5 text-xs ${ready >= BOARD_MIN ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {ready >= BOARD_MIN ? `In use · ${ready}` : `${ready} of ${BOARD_MIN}`}</span>
          </span>
          <span className={`text-xs ${chosen === board.id ? 'text-background/80' : 'text-muted-foreground'}`}>{board.hunt}</span>
          <BoardGenres board={board} className={chosen === board.id ? 'text-background' : 'text-foreground'} />
          {filed > ready && <span className={`text-xs ${chosen === board.id ? 'text-background/80' : 'text-muted-foreground'}`}>{filed - ready} more waiting, hidden or preparing</span>}
          {could > 0 && <span className={`text-xs font-medium ${chosen === board.id ? 'text-background' : 'text-foreground'}`}>+{could} from other boards would fit</span>}
        </button>;
      })}
    </div>
  </section>;
}

/** The songs a board serves (the genre map in `boards.ts`): the brain sends songs of these genres to it. */
function BoardGenres({ board, className = 'text-foreground' }: { board: (typeof BOARDS)[number]; className?: string }) {
  return <span className={`flex flex-col text-xs ${className}`}>
    <span><span className="font-medium">Genres:</span> {board.primary.join(', ')}</span>
    <span className="opacity-75"><span className="font-medium">When the words fit:</span> {board.secondary.join(', ')}</span>
  </span>;
}

/** A small card in the tray: opens the item; its × (when given) takes it out of a group our models were sure of. */
function Thumb({ item, onOpen, onDoubt }: { item: LibraryItem; onOpen: () => void; onDoubt?: () => void }) {
  const [hover, setHover] = useState(false);
  return <div className="relative aspect-[3/4] overflow-hidden rounded-[var(--radius-control)] bg-muted" title={item.seenAs ?? undefined}
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    <button type="button" onClick={onOpen} aria-label={item.seenAs ?? `Open this ${item.kind}`} className="relative size-full bg-transparent p-0"><Media item={item} live={hover} /></button>
    {onDoubt && <button type="button" aria-label="Not this board" onClick={onDoubt}
      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 p-0 text-white hover:bg-black/80"><XIcon className="size-3.5" aria-hidden="true" /></button>}
  </div>;
}

/**
 * What still needs a board, as our models sorted it: the groups they are sure of, each filed (and approved) with one click; the ones they
 * are not sure of, each with its suggested boards as buttons; and what they are still looking at. Every board the admin chooses teaches them.
 */
function SortTray({ items, filed, onFiled, onOpen }: { items: LibraryItem[]; filed: number; onFiled: (saved: LibraryItem[]) => void; onOpen: (id: string) => void }) {
  const [doubted, setDoubted] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const waiting = items.filter(item => item.looking && !item.suggestion);
  const sure = items.filter(item => !waiting.includes(item) && item.suggestion?.sure && !doubted.includes(item.id));
  const check = items.filter(item => !waiting.includes(item) && !sure.includes(item));
  const groups = BOARDS.map(board => ({ board, group: sure.filter(item => item.suggestion?.boards[0] === board.id) })).filter(entry => entry.group.length);

  async function file(list: LibraryItem[], boardsOf: (item: LibraryItem) => string[], key: string) {
    setBusy(key); setError('');
    const results = await inTurns(list.map(item => () => changeItem(item.id, { boards: boardsOf(item), ...(item.status === 'approved' ? {} : { status: 'approved' as const }) })));
    const saved = results.flatMap(result => (result.status === 'fulfilled' ? [result.value.item] : []));
    if (saved.length < list.length) setError(`${list.length - saved.length} could not be filed. Try again.`);
    onFiled(saved);
    setBusy('');
  }

  if (!items.length) return <p className="m-0 rounded-[var(--radius-panel)] bg-card p-10 text-center text-sm text-muted-foreground">Everything is on a board. Click a board above to see its items.</p>;
  const panel = 'flex flex-col gap-3 rounded-[var(--radius-panel)] bg-card p-4 shadow-sm';
  return <section aria-label="To sort" className="flex flex-col gap-4">
    <div>
      <h2 className="m-0 text-base font-semibold">To sort <span className="font-normal text-muted-foreground">· {items.length}</span></h2>
      <p className="m-0 text-xs text-muted-foreground">Our models suggest a board for every new item and learn from the {filed} you have filed. Filing approves it too. Take out (×) any that do not belong: they move to “Check these”.</p>
    </div>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}

    {groups.map(({ board, group }) => <div key={board.id} className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-medium">{board.name} <span className="text-muted-foreground">· {group.length}</span></h3>
          <p className="m-0 text-xs text-muted-foreground">{board.hunt}</p>
          <BoardGenres board={board} />
        </div>
        <Button size="sm" disabled={Boolean(busy)} onClick={() => void file(group, item => item.suggestion?.boards ?? [board.id], board.id)}>
          <CheckIcon className="size-4" aria-hidden="true" />{busy === board.id ? 'Filing…' : `File ${group.length} on ${board.name}`}</Button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {group.map(item => <Thumb key={item.id} item={item} onOpen={() => onOpen(item.id)} onDoubt={() => setDoubted(list => [...list, item.id])} />)}
      </div>
    </div>)}

    {check.length > 0 && <div className={panel}>
      <div>
        <h3 className="m-0 text-sm font-medium">Check these <span className="text-muted-foreground">· {check.length}</span></h3>
        <p className="m-0 text-xs text-muted-foreground">Our models are not sure about these. Click the board it belongs on, or open it to choose another.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {check.map(item => <div key={item.id} className="flex gap-3 rounded-[var(--radius-control)] bg-muted p-2">
          <div className="w-20 shrink-0"><Thumb item={item} onOpen={() => onOpen(item.id)} /></div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className={`m-0 line-clamp-3 text-xs ${item.problem ? 'text-destructive' : ''}`}>{item.problem ?? item.seenAs ?? 'Our models could not describe this one.'}</p>
            <div className="flex flex-wrap gap-1">
              {(item.suggestion?.boards ?? []).map(id => <Chip key={id} on={false} disabled={Boolean(busy)} onClick={() => void file([item], () => [id], item.id)}>{boardName(id)}</Chip>)}
              <Chip on={false} onClick={() => onOpen(item.id)}>Other…</Chip>
            </div>
          </div>
        </div>)}
      </div>
    </div>}

    {waiting.length > 0 && <div className={panel}>
      <div>
        <h3 className="m-0 text-sm font-medium">Looking <span className="text-muted-foreground">· {waiting.length}</span></h3>
        <p className="m-0 text-xs text-muted-foreground">Our models are looking at these. Their suggestions come in a minute or two; this page updates by itself.</p>
      </div>
      <div className="grid grid-cols-4 gap-2 opacity-60 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {waiting.map(item => <Thumb key={item.id} item={item} onOpen={() => onOpen(item.id)} />)}
      </div>
    </div>}
  </section>;
}

/**
 * Filed items our models say would also fit another board, grouped by that board (or only `only`'s group): a picture on several boards
 * serves more songs, and fills the empty boards. Adding puts the group on the board too; × says one does not fit, and our models offer
 * its look-alikes less.
 */
function AlsoTray({ items, only, onSaved, onOpen }: { items: LibraryItem[]; only?: string; onSaved: (saved: LibraryItem[]) => void; onOpen: (id: string) => void }) {
  const [error, setError] = useState('');
  /** `board:id` of the answers already given: they leave the tray at once, while they are saved. */
  const [gone, setGone] = useState<string[]>([]);
  // Saves go one after another, each from the item as last saved: two answers on one item never overwrite each other's boards.
  const queue = useRef(Promise.resolve());
  const latest = useRef(new Map<string, LibraryItem>());
  const groups = BOARDS.filter(board => !only || board.id === only)
    .map(board => ({ board, group: items.filter(item => item.also.includes(board.id) && !gone.includes(`${board.id}:${item.id}`)) }))
    .filter(entry => entry.group.length);
  if (!groups.length) return null;

  function answer(list: LibraryItem[], board: string, fits: boolean) {
    const keys = list.map(item => `${board}:${item.id}`);
    setGone(current => [...current, ...keys]);
    setError('');
    queue.current = queue.current.then(async () => {
      const results = await inTurns(list.map(item => () => {
        const now = latest.current.get(item.id) ?? item;
        return changeItem(item.id, fits ? { boards: [...new Set([...now.boards, board])] } : { notBoards: [...new Set([...now.notBoards, board])] });
      }));
      const saved = results.flatMap(result => (result.status === 'fulfilled' ? [result.value.item] : []));
      for (const item of saved) latest.current.set(item.id, item);
      const failed = keys.filter((_, at) => results[at].status === 'rejected');
      if (failed.length) {
        setGone(current => current.filter(key => !failed.includes(key)));
        setError(`${failed.length} could not be saved. Try again.`);
      }
      onSaved(saved);
    });
  }

  const panel = 'flex flex-col gap-3 rounded-[var(--radius-panel)] bg-card p-4 shadow-sm';
  return <section aria-label="Also fits" className="flex flex-col gap-4">
    <div>
      <h2 className="m-0 text-base font-semibold">Also fits <span className="font-normal text-muted-foreground">· {groups.reduce((sum, entry) => sum + entry.group.length, 0)}</span></h2>
      <p className="m-0 text-xs text-muted-foreground">Items already on a board that our models say would also fit another one. One picture on more boards serves more songs.
        Take out (×) any that do not fit: they are not offered for that board again, and our models offer their look-alikes less.</p>
    </div>
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
    {groups.map(({ board, group }) => <div key={board.id} className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-medium">{board.name} <span className="text-muted-foreground">· {group.length}</span></h3>
          <p className="m-0 text-xs text-muted-foreground">{board.hunt}</p>
          <BoardGenres board={board} />
        </div>
        <Button size="sm" onClick={() => answer(group, board.id, true)}>
          <CheckIcon className="size-4" aria-hidden="true" />Add {group.length} to {board.name}</Button>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {group.map(item => <Thumb key={item.id} item={item} onOpen={() => onOpen(item.id)} onDoubt={() => answer([item], board.id, false)} />)}
      </div>
    </div>)}
  </section>;
}

const NO_BOARD = '__none__';

/** An item's link works for 15 minutes: within this, a card keeps the one it shows, so asking the library again does not reload every picture. */
const KEEP_LINKS_MS = 10 * 60 * 1000;
/** The library is asked again this long after the last change (what our models offer depends on every answer), once. */
const SETTLE_MS = 2500;

/** The links a card already shows, kept; those it did not have yet (a video prepared since), taken from `next`. */
const linksOf = (shown: LibraryItem, next: LibraryItem) => ({ url: shown.url, poster: shown.poster ?? next.poster, preview: shown.preview ?? next.preview });

/** What the server answered for a change, on the card: it keeps its link, and our models' suggestions until the library is asked again. */
const withSaved = (item: LibraryItem, saved: LibraryItem): LibraryItem => ({
  ...saved,
  ...linksOf(item, saved),
  also: item.also.filter(board => !saved.boards.includes(board) && !saved.notBoards.includes(board)),
  suggestion: saved.boards.length ? null : item.suggestion,
});

type StatusFilter = 'all' | LibraryStatus;

export function LibraryView({ onChanged }: { onChanged: () => void }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  /** What still needs a board is shown first; an item filed on one is found under its board. */
  const [board, setBoard] = useState(NO_BOARD);
  const [openId, setOpenId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  /** The ticked cards are being edited (the panel is open); until then only the selection bar shows. */
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!picked.length) setEditing(false); }, [picked.length]);
  const anchor = useRef<string | null>(null);

  const linksAt = useRef(0);
  /** The library as the server sent it, with the links the cards already show while those still work. */
  function take(next: Library) {
    const fresh = Date.now() - linksAt.current > KEEP_LINKS_MS;
    if (fresh) linksAt.current = Date.now();
    setLibrary(current => {
      if (!current || fresh) return next;
      const shown = new Map(current.items.map(item => [item.id, item]));
      return { ...next, items: next.items.map(item => { const old = shown.get(item.id); return old ? { ...item, ...linksOf(old, item) } : item; }) };
    });
  }
  const refresh = () => loadLibrary().then(take, () => undefined);
  const settle = useRef<number | undefined>(undefined);
  function refreshSoon() {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => void refresh(), SETTLE_MS);
  }
  useEffect(() => () => window.clearTimeout(settle.current), []);

  useEffect(() => { loadLibrary().then(take, (cause: Error) => setError(cause.message)); }, []);
  // Our worker is preparing or our models are looking at something: look again until they are done (or have said why they cannot be).
  const waiting = Boolean(library?.items.some(item => item.looking));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refresh(), 6000);
    return () => clearInterval(timer);
  }, [waiting]);

  const replace = (next: Library) => { setLibrary(next); onChanged(); };
  const items = library?.items ?? [];
  /** Not on a board and not hidden: what the tray sorts. A hidden item without a board is found under "Every item". */
  const unsorted = items.filter(item => !item.boards.length && item.status !== 'hidden');
  const sorting = board === NO_BOARD;
  const boardFits = (item: LibraryItem) => !board || item.boards.includes(board);
  const shown = items.filter(item => (status === 'all' || item.status === status) && boardFits(item));
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
  /** Saved items on their cards; the library is asked again once the admin pauses, since one answer changes what our models offer for others. */
  function merge(saved: LibraryItem[], tags?: TagCount[]) {
    setLibrary(current => current && {
      items: current.items.map(item => { const entry = saved.find(one => one.id === item.id); return entry ? withSaved(item, entry) : item; }),
      tags: tags ?? current.tags,
    });
    onChanged();
    refreshSoon();
  }

  return <div className={`mx-auto flex max-w-6xl flex-col gap-6 ${chosen.length ? 'pb-24' : ''}`}>
    <header><h1 className="m-0 text-2xl font-semibold">Library</h1>
      <p className="m-0 mt-1 text-sm text-muted-foreground">Cleared photos, videos and GIFs the templates may use. Only approved items are ever used.</p></header>
    <Uploader onAdded={item => { setLibrary(current => current && { ...current, items: [item, ...current.items] }); onChanged(); }} />
    {library && <Boards items={items} chosen={board} onChoose={setBoard} />}
    {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}

    <div className="flex flex-wrap items-center gap-2">
      {sorting ? <span className="text-sm text-muted-foreground">New items, sorted by our models. Click a board above to see what is on it.</span>
        : (['all', 'pending', 'approved', 'hidden'] as const).map(value => <Chip key={value} on={status === value} onClick={() => setStatus(value)}>
          {value === 'all' ? 'All' : STATUS_LABEL[value]} {count(value)}</Chip>)}
      <select aria-label="Filter by board" value={board} onChange={event => setBoard(event.target.value)}
        className="ml-auto rounded-[var(--radius-control)] bg-card px-3 py-1.5 text-sm shadow-sm outline-ring focus-visible:outline-2">
        <option value={NO_BOARD}>To sort ({unsorted.length})</option>
        <option value="">Every item ({items.length})</option>
        {BOARDS.map(entry => <option key={entry.id} value={entry.id}>{entry.name} ({items.filter(item => item.boards.includes(entry.id)).length})</option>)}
      </select>
    </div>
    {library && board && board !== NO_BOARD && <AlsoTray items={items} only={board} onOpen={setOpenId} onSaved={merge} />}
    {sorting && library ? <>
      <SortTray items={unsorted} filed={items.length - items.filter(item => !item.boards.length).length} onOpen={setOpenId} onFiled={merge} />
      <AlsoTray items={items} onOpen={setOpenId} onSaved={merge} />
    </>
    : <>
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
          onSelect={() => (picked.length ? tick(item.id, false) : setOpenId(item.id))} onTick={range => tick(item.id, range)}
          onPlay={() => { if (!picked.length) setOpenId(item.id); setPlayingId(item.id); }} />)}
      </div>}
    </>}
    {library && <Tags tags={library.tags} onChange={replace} />}

    <SelectionBar count={chosen.length} shown={chosen.length > 0 && !editing} onClear={() => setPicked([])} onEdit={() => setEditing(true)} />
    {chosen.length > 0 && editing && library && <BulkPanel items={chosen} pool={library.tags} onClose={() => setEditing(false)} onDone={() => setPicked([])}
      onSaved={(saved, tags) => merge(saved, tags ?? undefined)}
      onDeleted={(next, gone) => { setPicked(list => list.filter(id => !gone.includes(id))); if (next) replace(next); else void refresh(); }} />}
    {!chosen.length && open && library && <Panel item={open} pool={library.tags} onClose={() => setOpenId(null)} onPlay={() => setPlayingId(open.id)}
      onSaved={(saved, tags) => { merge([saved], tags); setOpenId(null); }}
      onDeleted={next => { setOpenId(null); replace(next); }} />}
    <Player item={items.find(item => item.id === playingId) ?? null} onClose={() => setPlayingId(null)} />
  </div>;
}
