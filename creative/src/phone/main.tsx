import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ACCEPTED_AUDIO } from '../audio-format';
import { Button } from '../components/ui/button';
import '../styles/index.css';

/**
 * The page a phone opens from a QR code on the computer: the song step's (a song or a video with it) or the creatives'
 * (up to ten of their own photos, videos or GIFs). It sends them straight to private storage; the computer that showed the code
 * picks it up. The link (in the #fragment) is the only key: no sign-in on the phone.
 */
const TOKEN = /^[0-9a-f-]{36}\.\d{10}\.(song|picture)\.[a-f0-9]{64}$/;
/** As many as the creatives keep of a person's own pictures. */
const MAX_PICTURES = 10;

/** `video/*` and `image/*` make phones offer the photo library, where saved TikToks, screen recordings and photos are. */
const KINDS = {
  song: {
    title: 'Send your song',
    text: 'Pick the song from your phone. A video with the song playing works too: a saved TikTok or Reel, or a screen recording.',
    button: 'Choose song or video',
    accept: `${ACCEPTED_AUDIO},video/*`,
  },
  picture: {
    title: 'Send your photos or videos',
    text: `Pick up to ${MAX_PICTURES} photos, videos (up to 60 seconds each) or GIFs for your creatives, all at once. By sending them you confirm you own the rights to them.`,
    button: 'Choose photos or videos',
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/*,video/mp4,video/quicktime,video/webm,video/*',
  },
} as const;

type Chosen = { file: File; preview: string; problem: string };
type State = { step: 'choose' } | { step: 'chosen'; chosen: Chosen[]; dropped: number }
  | { step: 'sending'; percent: number; count: number } | { step: 'sent'; count: number } | { step: 'failed'; error: string };

/** The computer's own limits (src/uploads.ts, src/audio.ts), checked here so nothing is sent that it would refuse. */
const MB = 1e6;
const PICTURE_LIMITS: Record<string, { bytes: number; label: string }> = {
  'image/jpeg': { bytes: 25 * 1024 * 1024, label: 'photo' }, 'image/png': { bytes: 25 * 1024 * 1024, label: 'photo' },
  'image/webp': { bytes: 25 * 1024 * 1024, label: 'photo' }, 'image/gif': { bytes: 25 * MB, label: 'GIF' },
  'video/mp4': { bytes: 150 * MB, label: 'video' }, 'video/quicktime': { bytes: 150 * MB, label: 'video' }, 'video/webm': { bytes: 150 * MB, label: 'video' },
};
const MAX_VIDEO_SECONDS = 60;
const MAX_SONG_BYTES = 200 * 1024 * 1024;
const MAX_SONG_SECONDS = 10 * 60;

/** How long a video or song plays, when the phone can tell. */
function seconds(file: File, url: string): Promise<number | null> {
  if (!/^(audio|video)\//.test(file.type)) return Promise.resolve(null);
  return new Promise(resolve => {
    const media = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
    const timer = setTimeout(() => resolve(null), 4000);
    media.preload = 'metadata';
    media.onloadedmetadata = () => { clearTimeout(timer); resolve(Number.isFinite(media.duration) ? media.duration : null); };
    media.onerror = () => { clearTimeout(timer); resolve(null); };
    media.src = url;
  });
}

/** Why the computer would refuse this file, in words; empty when it is fine. */
async function problemWith(kind: 'song' | 'picture', file: File, url: string): Promise<string> {
  const length = await seconds(file, url);
  if (kind === 'song') {
    if (file.size > MAX_SONG_BYTES) return 'This file is larger than 200 MB. Choose a shorter one.';
    if (length !== null && length > MAX_SONG_SECONDS) return `This is ${Math.round(length / 60)} minutes long. Songs can be up to 10 minutes.`;
    if (length !== null && length < 14.5) return `This is ${Math.floor(length * 10) / 10} seconds long. Choose one at least 15 seconds long.`;
    return '';
  }
  const limit = PICTURE_LIMITS[file.type];
  if (!limit) return 'Choose a JPEG, PNG or WebP photo, an MP4, MOV or WebM video, or a GIF.';
  if (file.size > limit.bytes) return `This ${limit.label} is larger than ${Math.round(limit.bytes / MB)} MB.`;
  if (limit.label === 'video' && length !== null && length > MAX_VIDEO_SECONDS) return `Videos can be up to ${MAX_VIDEO_SECONDS} seconds long. This one is ${Math.round(length)}.`;
  return '';
}

const size = (bytes: number) => bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;

function send(url: string, file: Blob, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    // Stored with the file, so the computer knows what arrived.
    if (file.type) request.setRequestHeader('Content-Type', file.type);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('The upload was refused. Try again.')));
    request.onerror = () => reject(new Error('The connection dropped. Try again.'));
    request.send(file);
  });
}

function Phone() {
  const token = location.hash.slice(1);
  const kindName: 'song' | 'picture' = token.split('.')[2] === 'picture' ? 'picture' : 'song';
  const kind = KINDS[kindName];
  const expired = () => Number(token.split('.')[1]) * 1000 < Date.now();
  const [state, setState] = useState<State>(() => !TOKEN.test(token)
    ? { step: 'failed', error: 'This link is not complete. Scan the QR code on your computer again.' }
    : expired() ? { step: 'failed', error: 'This QR code has expired. Make a new one on your computer.' } : { step: 'choose' });
  const input = useRef<HTMLInputElement>(null);

  const forget = () => { if (state.step === 'chosen') state.chosen.forEach(item => URL.revokeObjectURL(item.preview)); };

  /**
   * The song step takes exactly one file: a good one goes at once, a refused one says why. Pictures are picked together and
   * shown, each checked against the computer's limits, and the good ones go together when the person says so.
   */
  async function pick(list: FileList | null) {
    const files = [...(list ?? [])];
    if (input.current) input.current.value = '';
    if (!files.length) return;
    forget();
    if (kindName === 'song') {
      const preview = URL.createObjectURL(files[0]);
      const problem = await problemWith('song', files[0], preview);
      URL.revokeObjectURL(preview);
      return problem ? setState({ step: 'failed', error: problem }) : void choose([files[0]]);
    }
    const chosen = await Promise.all(files.slice(0, MAX_PICTURES).map(async file => {
      const preview = URL.createObjectURL(file);
      return { file, preview, problem: await problemWith('picture', file, preview) };
    }));
    setState({ step: 'chosen', chosen, dropped: Math.max(0, files.length - MAX_PICTURES) });
  }

  async function choose(files: File[]) {
    forget();
    const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
    setState({ step: 'sending', percent: 0, count: files.length });
    try {
      const response = await fetch('/api/phone-handoff?step=phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, files: files.map(file => ({ type: file.type, bytes: file.size })) }),
      });
      const body = await response.json().catch(() => null) as { putUrls?: string[]; doneUrl?: string; error?: string } | null;
      if (!response.ok || body?.putUrls?.length !== files.length || !body.doneUrl) throw new Error(body?.error ?? 'Sending did not start. Try again.');
      let sent = 0;
      for (const [index, file] of files.entries()) {
        await send(body.putUrls[index], file, percent => setState({ step: 'sending', percent: Math.round(((sent + (file.size * percent) / 100) / total) * 100), count: files.length }));
        sent += file.size;
      }
      // Only now does the computer collect them, so it never takes half of them.
      await send(body.doneUrl, new Blob([]), () => {});
      setState({ step: 'sent', count: files.length });
    } catch (cause) {
      setState({ step: 'failed', error: cause instanceof Error ? cause.message : 'Something went wrong. Try again.' });
    }
  }

  const good = state.step === 'chosen' ? state.chosen.filter(item => !item.problem).map(item => item.file) : [];

  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
    <img src="/brand/favicon.png" alt="MUMOO" className="size-12" />
    {state.step === 'choose' && <>
      <h1 className="m-0 text-2xl font-semibold">{kind.title}</h1>
      <p className="m-0 text-muted-foreground">{kind.text}</p>
      <Button className="h-12 w-full text-base" onClick={() => input.current?.click()}>{kind.button}</Button>
    </>}
    <input ref={input} type="file" accept={kind.accept} multiple={kindName === 'picture'} hidden aria-label={kind.button} onChange={event => void pick(event.target.files)} />
    {state.step === 'chosen' && <>
      <ul className="m-0 grid w-full list-none grid-cols-3 gap-2 p-0">
        {state.chosen.map(item => <li key={item.preview} className="flex flex-col gap-1">
          {item.file.type.startsWith('video/')
            ? <video src={`${item.preview}#t=0.1`} className={`aspect-square w-full rounded-md bg-secondary object-cover ${item.problem ? 'opacity-40' : ''}`} playsInline muted preload="metadata" />
            : <img src={item.preview} alt="" className={`aspect-square w-full rounded-md bg-secondary object-cover ${item.problem ? 'opacity-40' : ''}`} />}
          <span className={`text-xs ${item.problem ? 'text-destructive' : 'text-muted-foreground'}`}>{item.problem || size(item.file.size)}</span>
        </li>)}
      </ul>
      {state.dropped > 0 && <p className="m-0 text-sm text-muted-foreground">Only the first {MAX_PICTURES} are sent.</p>}
      <Button className="h-12 w-full text-base" disabled={!good.length} onClick={() => void choose(good)}>
        {good.length > 1 ? `Send ${good.length} to my computer` : 'Send to my computer'}
      </Button>
      <Button variant="secondary" className="h-12 w-full text-base" onClick={() => input.current?.click()}>Choose again</Button>
    </>}
    {state.step === 'sending' && <>
      <h1 className="m-0 text-2xl font-semibold">{state.count > 1 ? `Sending ${state.count} files…` : 'Sending…'}</h1>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={state.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${state.percent}%` }} />
      </div>
      <p className="m-0 text-muted-foreground">{state.percent}% · keep this page open</p>
    </>}
    {state.step === 'sent' && <>
      <h1 className="m-0 text-2xl font-semibold">Sent</h1>
      <p className="m-0 text-muted-foreground">{state.count > 1 ? 'They are' : 'It is'} on {state.count > 1 ? 'their' : 'its'} way to your computer. Carry on there; you can close this page.</p>
    </>}
    {state.step === 'failed' && <>
      <h1 className="m-0 text-2xl font-semibold">That did not work</h1>
      <p className="m-0 text-muted-foreground" role="alert">{state.error}</p>
      {TOKEN.test(token) && !expired() && <Button className="h-12 w-full text-base" onClick={() => setState({ step: 'choose' })}>Try again</Button>}
    </>}
  </main>;
}

// Scanning a new code reuses an open tab and changes only the #fragment: start again on the new link.
window.addEventListener('hashchange', () => location.reload());
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

createRoot(document.getElementById('root')!).render(<Phone />);
