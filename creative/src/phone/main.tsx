import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ACCEPTED_AUDIO } from '../audio-format';
import { Button } from '../components/ui/button';
import '../styles/index.css';

/**
 * The page a phone opens from a QR code on the computer: the song step's (a song or a video with it) or the creatives'
 * (their own photo, video or GIF). It sends one file straight to private storage; the computer that showed the code
 * picks it up. The link (in the #fragment) is the only key: no sign-in on the phone.
 */
const TOKEN = /^[0-9a-f-]{36}\.\d{10}\.(song|picture)\.[a-f0-9]{64}$/;

/** `video/*` and `image/*` make phones offer the photo library, where saved TikToks, screen recordings and photos are. */
const KINDS = {
  song: {
    title: 'Send your song',
    text: 'Pick the song from your phone. A video with the song playing works too: a saved TikTok or Reel, or a screen recording.',
    button: 'Choose song or video',
    accept: `${ACCEPTED_AUDIO},video/*`,
  },
  picture: {
    title: 'Send your photo or video',
    text: 'Pick a photo, a video (up to 60 seconds) or a GIF for your creatives. By sending it you confirm you own the rights to it.',
    button: 'Choose photo or video',
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/*,video/mp4,video/quicktime,video/webm,video/*',
  },
} as const;

type State = { step: 'choose' } | { step: 'chosen'; file: File; preview: string; problem: string }
  | { step: 'sending'; percent: number } | { step: 'sent' } | { step: 'failed'; error: string };

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

function send(url: string, file: File, onProgress: (percent: number) => void) {
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

  /** A file picked is shown first, checked against the computer's limits; it is only sent when the person says so. */
  async function pick(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (state.step === 'chosen') URL.revokeObjectURL(state.preview);
    const preview = URL.createObjectURL(file);
    setState({ step: 'chosen', file, preview, problem: await problemWith(kindName, file, preview) });
  }

  async function choose(file: File) {
    setState({ step: 'sending', percent: 0 });
    try {
      const response = await fetch('/api/phone-handoff?step=phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type: file.type, bytes: file.size }),
      });
      const body = await response.json().catch(() => null) as { putUrl?: string; error?: string } | null;
      if (!response.ok || !body?.putUrl) throw new Error(body?.error ?? 'Sending did not start. Try again.');
      await send(body.putUrl, file, percent => setState({ step: 'sending', percent }));
      setState({ step: 'sent' });
    } catch (cause) {
      setState({ step: 'failed', error: cause instanceof Error ? cause.message : 'Something went wrong. Try again.' });
    }
  }

  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 p-6 text-center">
    <img src="/brand/favicon.png" alt="MUMOO" className="size-12" />
    {state.step === 'choose' && <>
      <h1 className="m-0 text-2xl font-semibold">{kind.title}</h1>
      <p className="m-0 text-muted-foreground">{kind.text}</p>
      <Button className="h-12 w-full text-base" onClick={() => input.current?.click()}>{kind.button}</Button>
    </>}
    <input ref={input} type="file" accept={kind.accept} hidden aria-label={kind.button} onChange={event => void pick(event.target.files?.[0])} />
    {state.step === 'chosen' && <>
      {state.file.type.startsWith('image/') && <img src={state.preview} alt="" className="max-h-72 w-full rounded-md object-contain" />}
      {state.file.type.startsWith('video/') && <video src={state.preview} className="max-h-72 w-full rounded-md" controls playsInline muted />}
      {state.file.type.startsWith('audio/') && <audio src={state.preview} className="w-full" controls />}
      <p className="m-0 break-all text-sm text-muted-foreground">{state.file.name} · {size(state.file.size)}</p>
      {state.problem && <p className="m-0 text-sm text-destructive" role="alert">{state.problem}</p>}
      <Button className="h-12 w-full text-base" disabled={Boolean(state.problem)} onClick={() => void choose(state.file)}>Send to my computer</Button>
      <Button variant="secondary" className="h-12 w-full text-base" onClick={() => input.current?.click()}>Choose another</Button>
    </>}
    {state.step === 'sending' && <>
      <h1 className="m-0 text-2xl font-semibold">Sending…</h1>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={state.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${state.percent}%` }} />
      </div>
      <p className="m-0 text-muted-foreground">{state.percent}% · keep this page open</p>
    </>}
    {state.step === 'sent' && <>
      <h1 className="m-0 text-2xl font-semibold">Sent</h1>
      <p className="m-0 text-muted-foreground">It is on its way to your computer. Carry on there; you can close this page.</p>
    </>}
    {state.step === 'failed' && <>
      <h1 className="m-0 text-2xl font-semibold">That did not work</h1>
      <p className="m-0 text-muted-foreground" role="alert">{state.error}</p>
      {TOKEN.test(token) && !expired() && <Button className="h-12 w-full text-base" onClick={() => setState({ step: 'choose' })}>Try again</Button>}
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Phone />);
