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

type State = { step: 'choose' } | { step: 'sending'; percent: number } | { step: 'sent' } | { step: 'failed'; error: string };

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
  const kind = KINDS[(token.split('.')[2] as keyof typeof KINDS)] ?? KINDS.song;
  const expired = () => Number(token.split('.')[1]) * 1000 < Date.now();
  const [state, setState] = useState<State>(() => !TOKEN.test(token)
    ? { step: 'failed', error: 'This link is not complete. Scan the QR code on your computer again.' }
    : expired() ? { step: 'failed', error: 'This QR code has expired. Make a new one on your computer.' } : { step: 'choose' });
  const input = useRef<HTMLInputElement>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
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
      <input ref={input} type="file" accept={kind.accept} hidden aria-label={kind.button} onChange={event => void choose(event.target.files?.[0])} />
      <Button className="h-12 w-full text-base" onClick={() => input.current?.click()}>{kind.button}</Button>
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
