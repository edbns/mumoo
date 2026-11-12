import { SmartphoneIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { encode } from 'uqr';
import { Button } from './components/ui/button';
import { withAccess } from './staging-token';

/**
 * "Send from your phone": a QR code that opens /phone, where the person picks the file on their phone. The site does not
 * work on phones, but music, photos and videos are often kept on them. When the file arrives it goes on exactly as if it
 * had been chosen here (`onFile`), and is removed from storage (see netlify/lib/handoff.mjs).
 */
const POLL_MS = 2000;
const API = '/api/phone-handoff';

export type PhoneKind = 'song' | 'picture';
const COPY: Record<PhoneKind, { ask: string; name: string }> = {
  song: { ask: 'pick your song or a video with it playing', name: 'Song from your phone' },
  picture: { ask: 'pick a photo, a video or a GIF', name: 'Picture from your phone' },
};
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav',
};

type Handoff = { id: string; phoneUrl: string; expiresAt: number };
type State = { step: 'idle' } | { step: 'starting' } | { step: 'waiting'; handoff: Handoff } | { step: 'receiving' } | { step: 'expired' } | { step: 'failed'; error: string };

function QrCode({ text }: { text: string }) {
  const { path, size } = useMemo(() => {
    const { data, size } = encode(text, { border: 2 });
    return { size, path: data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join('') };
  }, [text]);
  return <svg viewBox={`0 0 ${size} ${size}`} className="size-44 rounded-md bg-white" shapeRendering="crispEdges" role="img" aria-label="QR code to open on your phone">
    <path d={path} fill="#000" />
  </svg>;
}

const remove = (token: string, id: string) =>
  void withAccess(token, access => fetch(`${API}?id=${id}`, { method: 'DELETE', headers: { 'x-mumoo-brain-access': access } })).catch(() => {});

export function PhoneUpload({ token, kind, onFile }: { token: string; kind: PhoneKind; onFile: (file: File) => void }) {
  const [state, setState] = useState<State>({ step: 'idle' });

  async function start() {
    setState({ step: 'starting' });
    try {
      const response = await withAccess(token, access => fetch(`${API}?kind=${kind}`, { method: 'POST', headers: { 'x-mumoo-brain-access': access } }));
      const body = await response.json().catch(() => null) as (Handoff & { error?: string }) | null;
      if (!response.ok || !body?.id) throw new Error(body?.error ?? 'The QR code could not be made. Try again.');
      setState({ step: 'waiting', handoff: body });
    } catch (cause) {
      setState({ step: 'failed', error: cause instanceof Error ? cause.message : 'The QR code could not be made. Try again.' });
    }
  }

  const deliver = useRef(onFile);
  deliver.current = onFile;
  /** Leaving the page stops a delivery; the panel moving on from "waiting" (to "receiving") must not. */
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const waiting = state.step === 'waiting' ? state.handoff : null;
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let received = false;
    let timer: ReturnType<typeof setTimeout>;
    const receive = async (url: string) => {
      received = true;
      setState({ step: 'receiving' });
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error();
        const blob = await response.blob();
        if (mounted.current) deliver.current(new File([blob], COPY[kind].name + (EXTENSIONS[blob.type] ?? ''), { type: blob.type }));
        setState({ step: 'idle' });
      } catch {
        setState({ step: 'failed', error: 'It arrived but could not be opened here. Send it again.' });
      } finally {
        remove(token, waiting.id);
      }
    };
    const check = async () => {
      if (stopped) return;
      if (Date.now() > waiting.expiresAt) { setState({ step: 'expired' }); return; }
      try {
        const response = await withAccess(token, access => fetch(`${API}?id=${waiting.id}`, { headers: { 'x-mumoo-brain-access': access } }));
        if (response.status === 200) return void receive((await response.json() as { url: string }).url);
      } catch { /* a dropped poll is tried again */ }
      timer = setTimeout(check, POLL_MS);
    };
    timer = setTimeout(check, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      // Closed or expired before the song came: nothing may stay behind.
      if (!received) remove(token, waiting.id);
    };
  }, [waiting, token, kind]);

  if (state.step === 'idle' || state.step === 'starting') {
    return <Button variant="secondary" disabled={state.step === 'starting'} onClick={() => void start()}>
      <SmartphoneIcon aria-hidden="true" className="size-4" /> Send from your phone
    </Button>;
  }
  return <div className="flex flex-col items-center gap-3 rounded-[var(--radius-control)] bg-secondary p-4 text-center">
    {state.step === 'waiting' && <>
      <QrCode text={state.handoff.phoneUrl} />
      <p className="m-0 text-sm">Scan with your phone's camera, then {COPY[kind].ask}. It opens here.</p>
      <p className="m-0 text-xs text-muted-foreground">The code works for 15 minutes. Waiting for your phone…</p>
    </>}
    {state.step === 'receiving' && <p className="m-0 text-sm" role="status">It arrived. Opening it…</p>}
    {state.step === 'expired' && <p className="m-0 text-sm">The code expired. Make a new one to try again.</p>}
    {state.step === 'failed' && <p className="m-0 text-sm" role="alert">{state.error}</p>}
    <div className="flex gap-2">
      {(state.step === 'expired' || state.step === 'failed') && <Button onClick={() => void start()}>New code</Button>}
      {state.step !== 'receiving' && <Button variant="ghost" onClick={() => setState({ step: 'idle' })}>Close</Button>}
    </div>
  </div>;
}
