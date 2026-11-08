import { useEffect, useMemo, useRef, useState } from 'react';
import type { LyricCue } from './composition';
import {
  LYRIC_LANGUAGES, MAX_LYRIC_WORDS, clipToWav16k, groupLines, languageName,
  runLyricsJob, wordsToText, type LyricWord, type LyricsResult,
} from './lyrics-cloud';
import { tokenizeLyrics } from './lyric-text';

type Phase = 'start' | 'working' | 'edit';

const clock = (ms: number) => `0:${String(Math.floor(Math.max(0, ms) / 1000)).padStart(2, '0')}`;

/**
 * Lyrics for the chosen 15 seconds: find them from the audio in any language, or sync your own text.
 * One text box is the whole editor — fix words, add missing ones, press Sync again.
 */
export function LyricsStudio({
  audio, clipStartMs, token, position, playing, onPlay, onSeek, onLyrics, onState,
}: {
  audio: AudioBuffer;
  clipStartMs: number;
  token: string;
  /** Playhead inside the clip, ms. */
  position: number;
  playing: boolean;
  onPlay: () => void;
  onSeek: (ms: number) => void;
  onLyrics: (lyrics: { cues: LyricCue[]; language?: string; origin: 'transcribed' | 'typed' }) => void;
  /** Tells the page whether lyrics are being worked on / edited and not yet synced. */
  onState: (state: { busy: boolean; dirty: boolean }) => void;
}) {
  const [phase, setPhase] = useState<Phase>('start');
  const [language, setLanguage] = useState('auto');
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [syncedText, setSyncedText] = useState('');
  const [words, setWords] = useState<LyricWord[]>([]);
  const [detected, setDetected] = useState<LyricsResult>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [mode, setMode] = useState<'transcribe' | 'sync'>('transcribe');
  const run = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const wav = useRef<Promise<Uint8Array> | null>(null);

  const dirty = phase === 'edit' && text.trim() !== syncedText.trim();

  useEffect(() => { onState({ busy: phase === 'working', dirty }); }, [phase, dirty, onState]);
  useEffect(() => () => { run.current++; abort.current?.abort(); }, []);
  useEffect(() => {
    if (phase !== 'working') return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  function cancel() {
    run.current++;
    abort.current?.abort();
    setPhase(words.length ? 'edit' : 'start');
  }

  function apply(result: LyricsResult, wasMode: 'transcribe' | 'sync') {
    setWords(result.words);
    const heardLanguage = wasMode === 'transcribe' ? result.language : detected?.language ?? result.language;
    onLyrics({
      cues: result.words.map(({ text: word, startMs, endMs }) => ({ text: word, startMs, endMs })),
      language: language !== 'auto' ? language : heardLanguage,
      origin: wasMode === 'transcribe' || detected ? 'transcribed' : 'typed',
    });
    if (wasMode === 'transcribe') {
      const heard = wordsToText(result.words);
      setText(heard);
      setSyncedText(heard);
      setDetected(result);
    } else {
      setSyncedText(text);
    }
    setPhase('edit');
  }

  async function start(wasMode: 'transcribe' | 'sync') {
    let lines: string[][] | undefined;
    if (wasMode === 'sync') {
      lines = tokenizeLyrics(text);
      const count = lines.reduce((n, line) => n + line.length, 0);
      if (!count) { setError('Type or paste the words you hear first.'); return; }
      if (count > MAX_LYRIC_WORDS) { setError(`That is ${count} words. A 15-second clip fits up to ${MAX_LYRIC_WORDS}. Keep only what is sung in these 15 seconds.`); return; }
    }
    const id = ++run.current;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setError('');
    setNotice('');
    setMode(wasMode);
    setPhase('working');
    try {
      wav.current ??= clipToWav16k(audio, clipStartMs);
      const clip = await wav.current;
      const result = await runLyricsJob({
        token, wav: clip, lines, signal: controller.signal,
        language: language === 'auto' ? undefined : language,
      });
      if (id !== run.current) return;
      if (!result.words.length) {
        setPhase(words.length ? 'edit' : 'start');
        setPasting(true);
        setNotice(wasMode === 'transcribe'
          ? 'We could not hear clear words in these 15 seconds. Try a part with singing, or type the words yourself.'
          : 'We could not place those words. Check they match what is sung here.');
        return;
      }
      apply(result, wasMode);
      if (wasMode === 'sync' && result.words.some(word => word.estimated)) {
        setNotice('A few words could not be matched to the sound, so their timing is estimated (dotted).');
      }
    } catch (cause) {
      if (id !== run.current || (cause as Error).name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Try again.');
      setPhase(words.length ? 'edit' : 'start');
    }
  }

  const label = mode === 'sync'
    ? 'Timing every word…'
    : elapsed < 8 ? 'Listening to your clip…' : elapsed < 22 ? 'Writing out the words…' : 'Timing every word…';

  const lines = useMemo(() => groupLines(words), [words]);
  const active = words.reduce((found, word, i) => (position >= word.startMs && position < word.endMs + 300 ? i : found), -1);
  const languageSelect = <label className="lang-pick">Language
    <select value={language} onChange={event => setLanguage(event.target.value)}>
      <option value="auto">Detect automatically</option>
      {LYRIC_LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
    </select>
  </label>;

  return <section className="lyrics-panel" aria-labelledby="lyrics-title">
    <div className="lyrics-head">
      <h2 id="lyrics-title">Lyrics</h2>
      {detected?.language && phase === 'edit' && <span className="lang-chip">{languageName(detected.language)}</span>}
    </div>

    {phase === 'start' && <div className="lyrics-start">
      <p>We listen to your 15 seconds and write out the words, in any language.</p>
      <div className="lyrics-actions">
        <button className="primary-accent" onClick={() => void start('transcribe')}>Find the lyrics for me</button>
        <button className="link-button" onClick={() => setPasting(open => !open)} aria-expanded={pasting}>I'll type them myself</button>
      </div>
      {languageSelect}
      {pasting && <>
        <label>The words sung in these 15 seconds
          <textarea className="lyrics-editor" rows={5} value={text} placeholder={'One line per sung line'}
            onChange={event => { setText(event.target.value); setError(''); }} />
        </label>
        <button disabled={!text.trim()} onClick={() => void start('sync')}>Sync my lyrics</button>
      </>}
    </div>}

    {phase === 'working' && <div className="lyrics-working" role="status">
      <span className="spinner" aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <small>{elapsed > 25 ? 'Warming up — the first run takes a little longer.' : 'Usually about 15 seconds.'}</small>
      </div>
      <button className="link-button" onClick={cancel}>Cancel</button>
    </div>}

    {phase === 'edit' && <>
      <label className="lyrics-edit-label" htmlFor="lyrics-editor">Fix any wrong or missing words, then sync again.</label>
      <textarea id="lyrics-editor" className="lyrics-editor" rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
        value={text} onChange={event => { setText(event.target.value); setError(''); }} spellCheck={false} />
      <div className="lyrics-editor-bar">
        <span className={dirty ? 'dirty' : ''}>{dirty ? 'Edited — sync again to update the timing.' : `${words.length} words timed`}</span>
        <button className={dirty ? 'primary-accent' : 'secondary'} disabled={!dirty} onClick={() => void start('sync')}>Sync again</button>
      </div>
      <details className="lyrics-more">
        <summary>Wrong language?</summary>
        <div className="lyrics-more-body">
          {languageSelect}
          <button className="secondary" onClick={() => void start('transcribe')}>Listen again (replaces your edits)</button>
        </div>
      </details>

      <div className="lyrics-preview" aria-label="Lyrics timing preview">
        <div className="lyrics-preview-bar">
          <button className="round-play" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play the 15 seconds'}>{playing ? '❚❚' : '▶'}</button>
          <span>{clock(position)} / 0:15</span>
        </div>
        <div className={dirty ? 'lyrics-lines stale' : 'lyrics-lines'}>
          {lines.map((line, row) => <p key={row}>
            {line.map(({ word, index }) => <button key={index} type="button"
              className={`${index === active ? 'on' : ''} ${word.estimated ? 'estimated' : ''}`}
              title={word.estimated ? 'Timing estimated' : undefined}
              onClick={() => onSeek(word.startMs)}>{word.text}</button>)}
          </p>)}
        </div>
      </div>
    </>}

    {notice && <p className="lyrics-notice" role="status">{notice}</p>}
    {error && <p role="alert" className="lyrics-error">{error}</p>}
  </section>;
}
