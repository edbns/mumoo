import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ACCEPTED_AUDIO } from '../audio-format';
import { Button } from '../components/ui/button';
import { ProgressiveFluxLoader, type ProgressiveFluxPhase } from '../components/ui/progressive-flux-loader';
import '@fontsource-variable/inter';
import '../styles/index.css';
import { friendlyError } from '../friendly-error';
import { MIN_SONG_MS } from '../composition';

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
    text: 'Pick the song from your phone. A video with the song playing works too (saved TikTok/Reel or screen recording).',
    button: 'Choose song or video',
    accept: `${ACCEPTED_AUDIO},video/*`,
  },
  picture: {
    title: 'Send your photos or videos',
    text: `Pick up to ${MAX_PICTURES} photos, videos (up to 60 seconds) or GIFs. By sending them you confirm you own the rights.`,
    button: 'Choose photos or videos',
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/*,video/mp4,video/quicktime,video/webm,video/*',
  },
} as const;

type State = { step: 'choose' } | { step: 'sending'; percent: number; count: number }
  | { step: 'sent'; count: number; skipped: string[] } | { step: 'failed'; error: string };

const SEND_PHASES: ProgressiveFluxPhase[] = [
  { at: 0, label: 'Getting ready' },
  { at: 1, label: 'Sending' },
  { at: 90, label: 'Almost there' },
];

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
    if (file.size > MAX_SONG_BYTES) return 'This file is bigger than 200 MB. Pick a shorter one.';
    if (length !== null && length > MAX_SONG_SECONDS) return `This is ${Math.round(length / 60)} minutes long. Songs can be up to 10 minutes.`;
    if (length !== null && length < (MIN_SONG_MS - 500) / 1000) return `This is ${Math.floor(length * 10) / 10} seconds long. Needs to be at least ${MIN_SONG_MS / 1000} seconds.`;
    return '';
  }
  const limit = PICTURE_LIMITS[file.type];
  if (!limit) return 'Use a JPEG, PNG or WebP photo, an MP4, MOV or WebM video, or a GIF.';
  if (file.size > limit.bytes) return `This ${limit.label} is bigger than ${Math.round(limit.bytes / MB)} MB.`;
  if (limit.label === 'video' && length !== null && length > MAX_VIDEO_SECONDS) return `Videos can be up to ${MAX_VIDEO_SECONDS} seconds. This one is ${Math.round(length)}.`;
  return '';
}

function put(url: string, file: Blob, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    // Stored with the file, so the computer knows what arrived.
    if (file.type) request.setRequestHeader('Content-Type', file.type);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('Upload was refused. Try again.')));
    request.onerror = () => reject(new Error('Connection dropped. Try again.'));
    request.send(file);
  });
}

function Phone() {
  const token = location.hash.slice(1);
  const kindName: 'song' | 'picture' = token.split('.')[2] === 'picture' ? 'picture' : 'song';
  const kind = KINDS[kindName];
  const expired = () => Number(token.split('.')[1]) * 1000 < Date.now();
  const [state, setState] = useState<State>(() => !TOKEN.test(token)
    ? { step: 'failed', error: 'This link isn’t complete. Scan the QR code on your computer again.' }
    : expired() ? { step: 'failed', error: 'This QR code expired. Make a new one on your computer.' } : { step: 'choose' });
  const input = useRef<HTMLInputElement>(null);

  /**
   * The bar shows the moment files are picked; they are checked against the computer's limits behind it. The song step takes
   * exactly one file (a refused one says why); of several pictures the good ones go, and the rest are named once they are sent.
   */
  async function pick(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, kindName === 'song' ? 1 : MAX_PICTURES);
    const dropped = (list?.length ?? 0) - files.length;
    if (input.current) input.current.value = '';
    if (!files.length) return;
    setState({ step: 'sending', percent: 0, count: files.length });
    const checked = await Promise.all(files.map(async file => {
      const url = URL.createObjectURL(file);
      try { return { file, problem: await problemWith(kindName, file, url) }; } finally { URL.revokeObjectURL(url); }
    }));
    const good = checked.filter(item => !item.problem).map(item => item.file);
    if (!good.length) return setState({ step: 'failed', error: checked[0].problem });
    const skipped = checked.filter(item => item.problem).map(item => `${item.file.name}: ${item.problem}`);
    if (dropped > 0 && kindName === 'picture') skipped.push(`Only the first ${MAX_PICTURES} get sent.`);
    await send(good, skipped);
  }

  async function send(files: File[], skipped: string[]) {
    const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
    setState({ step: 'sending', percent: 0, count: files.length });
    try {
      const response = await fetch('/api/phone-handoff?step=phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, files: files.map(file => ({ type: file.type, bytes: file.size })) }),
      });
      const body = await response.json().catch(() => null) as { putUrls?: string[]; doneUrl?: string; error?: string } | null;
      if (!response.ok || body?.putUrls?.length !== files.length || !body.doneUrl) throw new Error(body?.error ?? 'Sending didn’t start. Try again.');
      let sent = 0;
      for (const [index, file] of files.entries()) {
        await put(body.putUrls[index], file, percent => setState({ step: 'sending', percent: Math.max(1, Math.round(((sent + (file.size * percent) / 100) / total) * 100)), count: files.length }));
        sent += file.size;
      }
      // Only now does the computer collect them, so it never takes half of them.
      await put(body.doneUrl, new Blob([]), () => {});
      setState({ step: 'sent', count: files.length, skipped });
    } catch (cause) {
      setState({ step: 'failed', error: friendlyError(cause, 'Something went wrong. Try again.') });
    }
  }

  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
    <img src="/brand/favicon.png" alt="mumoo" className="size-12" />
    {state.step === 'choose' && <>
      <h1 className="m-0 text-2xl font-semibold">{kind.title}</h1>
      <p className="m-0 text-muted-foreground">{kind.text}</p>
      <Button className="h-12 w-full text-base" onClick={() => input.current?.click()}>{kind.button}</Button>
    </>}
    <input ref={input} type="file" accept={kind.accept} multiple={kindName === 'picture'} hidden aria-label={kind.button} onChange={event => void pick(event.target.files)} />
    {state.step === 'sending' && <>
      <ProgressiveFluxLoader value={state.percent} phases={SEND_PHASES} className="gap-5 [--flux-from:var(--primary)] [--flux-to:var(--foreground)]"
        textClassName="text-2xl font-semibold text-foreground" barClassName="h-3" />
      <p className="m-0 text-muted-foreground">
        {state.count > 1 ? `${state.count} files · ` : ''}{state.percent}%<br />
        <strong className="font-medium text-foreground">Don’t close your browser or this window.</strong>
      </p>
    </>}
    {state.step === 'sent' && <>
      <h1 className="m-0 text-2xl font-semibold">Sent</h1>
      <p className="m-0 text-muted-foreground">{state.count > 1 ? 'They are' : 'It is'} on {state.count > 1 ? 'their' : 'its'} way to your computer. Keep going there — you can close this page.</p>
      {state.skipped.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-destructive">
        {state.skipped.map(reason => <li key={reason}>{reason}</li>)}
      </ul>}
    </>}
    {state.step === 'failed' && <>
      <h1 className="m-0 text-2xl font-semibold">That didn’t work</h1>
      <p className="m-0 text-muted-foreground" role="alert">{state.error}</p>
      {TOKEN.test(token) && !expired() && <Button className="h-12 w-full text-base" onClick={() => setState({ step: 'choose' })}>Try again</Button>}
    </>}
  </main>;
}

// Scanning a new code reuses an open tab and changes only the #fragment: start again on the new link.
window.addEventListener('hashchange', () => location.reload());
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

createRoot(document.getElementById('root')!).render(<Phone />);
