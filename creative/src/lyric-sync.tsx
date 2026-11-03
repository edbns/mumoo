import { useEffect, useRef, useState } from 'react';
import { DURATION_MS, type LyricCue } from './composition';
import { IS_ALIGNMENT_STAGING, syncStagingLyrics } from './staging-alignment';
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
  const [review, setReview] = useState<{ cues: LyricCue[]; unmatched: string[]; heard: string }>();
  const worker = useRef<Worker | null>(null);
  const run = useRef(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => {
    run.current++;
    worker.current?.terminate();
    request.current?.abort();
  }, []);

  function cancel() {
    run.current++;
    worker.current?.terminate();
    worker.current = null;
    request.current?.abort();
    request.current = null;
    setStatus('');
  }

  async function sync() {
    const words = text.trim().split(/\s+/u);
    if (!text.trim() || (IS_ALIGNMENT_STAGING && text.length > 2000) || words.length > MAX_WORDS || words.some(word => [...word].length > 48)) {
      setError('Paste up to 120 words from this section, with up to 48 characters per word.');
      return;
    }
    const id = ++run.current;
    setError('');
    setReview(undefined);
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
      if (IS_ALIGNMENT_STAGING) {
        const controller = new AbortController();
        request.current = controller;
        setStatus('WhisperX is timing your words…');
        const matched = await syncStagingLyrics(samples, rate, text, controller.signal);
        if (id !== run.current) return;
        setReview({ ...matched, heard: '' });
        onChange(matched.cues);
        cancel();
        return;
      }
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
        setReview({ ...matched, heard: data.words.map(word => word.text.trim()).filter(Boolean).join(' ') });
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
    <legend>{IS_ALIGNMENT_STAGING ? 'Paste lyrics & sync · WhisperX (English)' : 'Paste lyrics & sync'}</legend>
    <label>Lyrics for this section
      <textarea rows={4} maxLength={IS_ALIGNMENT_STAGING ? 2000 : 6000} value={text} disabled={Boolean(status)} onChange={event => {
        setText(event.target.value);
        setError('');
        setReview(undefined);
        onChange([]);
      }} />
    </label>
    <button disabled={!text.trim() || Boolean(status)} onClick={() => void sync()}>Sync lyrics</button>
    {status && <> <button onClick={cancel}>Cancel sync</button><p role="status">{status}</p></>}
    {error && <p role="alert">{error}</p>}
    {review && (review.unmatched.length === 0
      ? <p role="status">Synced {review.cues.length} words. Audition the selection to check their timing.</p>
      : <>
        {IS_ALIGNMENT_STAGING
          ? <p role="alert">WhisperX timed {review.cues.length} of {review.cues.length + review.unmatched.length} words. Review the timed words or edit and sync again. Approving keeps the timed words only.</p>
          : <><p role="alert">The speech model timed {review.cues.length} of {review.cues.length + review.unmatched.length} words. It can miss sung words even when your lyrics are correct.</p>
        <p><strong>Model heard:</strong> {review.heard || 'No words detected.'}</p></>}
        <p><strong>Missing timings:</strong> {review.unmatched.join(' · ')}</p>
      </>)}
    <p className="hint">{IS_ALIGNMENT_STAGING
      ? 'Sync sends only this 15-second clip and the pasted lyrics to the staging worker. Your full song stays on this device.'
      : 'The first sync downloads a speech model. Your audio stays on this device.'}</p>
  </fieldset>;
}
