import { useEffect, useRef, useState } from 'react';
import { DURATION_MS, type LyricCue } from './composition';
import { matchWords, MAX_WORDS, type RecognizedWord } from './lyrics-match';

type Reply = { status: string } | { words: RecognizedWord[] } | { error: string };

export function LyricSync({ audio, clipStartMs, onChange }: {
  audio: AudioBuffer;
  clipStartMs: number;
  onChange: (cues: LyricCue[]) => void;
}) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const worker = useRef<Worker | null>(null);
  const run = useRef(0);
  useEffect(() => () => { run.current++; worker.current?.terminate(); }, []);

  function cancel() {
    run.current++;
    worker.current?.terminate();
    worker.current = null;
    setStatus('');
  }

  async function sync() {
    const words = text.trim().split(/\s+/u);
    if (!text.trim() || words.length > MAX_WORDS || words.some(word => [...word].length > 48)) {
      setError('Paste up to 120 words from this section, with up to 48 characters per word.');
      return;
    }
    const id = ++run.current;
    setError('');
    setUnmatched([]);
    onChange([]);
    setStatus('Preparing the selected audio…');
    try {
      const rate = 16_000;
      const context = new OfflineAudioContext(1, DURATION_MS * rate / 1000, rate);
      const source = context.createBufferSource();
      source.buffer = audio;
      source.connect(context.destination);
      source.start(0, clipStartMs / 1000);
      const samples = (await context.startRendering()).getChannelData(0);
      if (id !== run.current) return;
      const active = new Worker(new URL('./lyrics-worker.ts', import.meta.url), { type: 'module' });
      worker.current = active;
      active.onerror = () => {
        if (id !== run.current) return;
        setError('The local speech model could not start. Reload and try again.');
        cancel();
      };
      active.onmessage = ({ data }: MessageEvent<Reply>) => {
        if (id !== run.current) return;
        if ('status' in data) {
          setStatus(data.status);
          return;
        }
        cancel();
        if ('error' in data) {
          setError(`Could not sync lyrics. ${data.error}`);
          return;
        }
        const matched = matchWords(words, data.words);
        setUnmatched(matched.unmatched);
        if (matched.unmatched.length === 0) onChange(matched.cues);
      };
      active.postMessage(samples, [samples.buffer]);
    } catch (cause) {
      if (id !== run.current) return;
      setError(cause instanceof Error ? cause.message : 'Could not prepare the selected audio.');
      cancel();
    }
  }

  return <fieldset className="lyric-review">
    <legend>Paste lyrics &amp; sync</legend>
    <label>Lyrics for this section
      <textarea rows={4} maxLength={6000} value={text} disabled={Boolean(status)} onChange={event => {
        setText(event.target.value);
        setError('');
        setUnmatched([]);
        onChange([]);
      }} />
    </label>
    <button disabled={!text.trim() || Boolean(status)} onClick={() => void sync()}>Sync lyrics</button>
    {status && <> <button onClick={cancel}>Cancel sync</button><p role="status">{status}</p></>}
    {error && <p role="alert">{error}</p>}
    {unmatched.length > 0 && <p role="alert">Couldn’t match: {unmatched.join(' · ')}. Check that the text matches this exact clip and try again.</p>}
    <p className="hint">The first sync downloads a speech model. Your audio stays on this device.</p>
  </fieldset>;
}
