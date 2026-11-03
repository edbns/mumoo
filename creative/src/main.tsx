import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeWav, hashWav } from './audio';
import { DURATION_MS, FPS, FRAMES, HEIGHT, PRESETS, WIDTH, evaluate, lyricText, playheadFrame, validate, type Composition } from './composition';
import { draw, loadFont } from './render';
import { LyricSync } from './lyric-sync';
import { LyricReview } from './lyric-review';
import { Waveform } from './waveform';
import './style.css';

const INITIAL: Extract<Composition, { version: 2 }> = {
  version: 2, template: 'scribble', sourceSha256: '', clipStartMs: 0, cues: [],
};

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function App() {
  const [exportFrame, setExportFrame] = useState<number>();
  const [exportError, setExportError] = useState('');
  const exporting = useRef(false);
  const [editingVisual, setEditingVisual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [composition, setComposition] = useState(INITIAL);
  const text = lyricText(composition);
  const [buffer, setBuffer] = useState<AudioBuffer>();
  const [selectedCue, setSelectedCue] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [fontText, setFontText] = useState<string>();
  const [fontError, setFontError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const animation = useRef(0);
  const upload = useRef(0);
  const playback = useRef(0);

  const clipValid = Boolean(buffer && Number.isSafeInteger(composition.clipStartMs) &&
    composition.clipStartMs >= 0 && composition.clipStartMs <= buffer.duration * 1000 - DURATION_MS);
  const valid = (() => {
    if (!buffer) return false;
    try {
      validate(composition, buffer.duration * 1000);
      return true;
    } catch {
      return false;
    }
  })();

  function stop() {
    playback.current++;
    cancelAnimationFrame(animation.current);
    source.current?.stop();
    source.current = null;
    setPlaying(false);
  }

  async function choose(file?: File) {
    const request = ++upload.current;
    stop();
    setBuffer(undefined);
    setEditingVisual(false);
    setLoading(Boolean(file));
    setPosition(0);
    setError('');
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();
      const sourceSha256 = await hashWav(bytes);
      const audio = await decodeWav(bytes);
      validate({ ...INITIAL, sourceSha256 }, audio.duration * 1000);
      if (request !== upload.current) return;
      setComposition(current => ({ ...current, sourceSha256, clipStartMs: 0, cues: [] }));
      setBuffer(audio);
    } catch (cause) {
      if (request === upload.current) setError((cause as Error).message);
    } finally {
      if (request === upload.current) setLoading(false);
    }
  }

  async function play(fromStart = false) {
    if (!buffer || !clipValid || (editingVisual && (!valid || fontText !== text))) return;
    const request = ++playback.current;
    try {
      const audio = context.current ??= new AudioContext();
      await audio.resume();
      if (request !== playback.current) return;
      const node = audio.createBufferSource();
      node.buffer = buffer;
      node.connect(audio.destination);
      const from = fromStart || position >= DURATION_MS ? 0 : position;
      const start = audio.currentTime;
      node.start(start, (composition.clipStartMs + from) / 1000, (DURATION_MS - from) / 1000);
      source.current = node;
      setPlaying(true);
      function tick() {
        const next = Math.min(DURATION_MS, from + (audio.currentTime - start) * 1000);
        setPosition(next);
        if (next < DURATION_MS) animation.current = requestAnimationFrame(tick);
        else {
          source.current = null;
          setPlaying(false);
        }
      }
      tick();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  function edit(next: typeof INITIAL) {
    stop();
    setComposition(next);
  }

  function selectClip(clipStartMs: number) {
    stop();
    setPosition(0);
    setComposition(current => ({ ...current, clipStartMs, cues: current.clipStartMs === clipStartMs ? current.cues : [] }));
  }

  function openStage(visual: boolean) {
    stop();
    setPosition(0);
    setEditingVisual(visual);
  }

  useEffect(() => {
    let active = true;
    setFontError('');
    loadFont(text).then(
      () => { if (active) setFontText(text); },
      (cause: Error) => { if (active) setFontError(cause.message); },
    );
    return () => { active = false; };
  }, [text]);

  useEffect(() => {
    if (canvas.current && fontText === text) {
      draw(canvas.current, composition, playheadFrame(position));
    }
  }, [composition, editingVisual, fontText, position]);

  async function exportVideo() {
    if (!buffer || !valid || exporting.current) return;
    exporting.current = true;
    stop();
    setExportError('');
    setExportFrame(0);
    try {
      const { renderMp4 } = await import('./browser-export');
      const video = await renderMp4(composition, buffer, setExportFrame);
      download(video, 'mumoo.mp4');
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'MP4 export failed.');
    } finally {
      exporting.current = false;
      setExportFrame(undefined);
    }
  }

  return <>
    <header className="masthead"><img src="/brand/mumoo-logo.png" alt="mumoo" width="144" height="36" /><span>Creative Studio</span></header>
    {!editingVisual ? <main className="desktop trim">
      <section>
        <p className="eyebrow">01 / MUSIC</p>
        <h1>Choose your 15 seconds</h1>
        <p className="intro">Open a WAV, then drag the highlighted window to the part you want.</p>
        <label>Source WAV<input type="file" accept=".wav,audio/wav,audio/x-wav" onChange={event => void choose(event.target.files?.[0])} /></label>
        {loading && <p role="status">Opening your music…</p>}
        {buffer && <>
          <Waveform audio={buffer} start={composition.clipStartMs} position={position} onSelect={selectClip} />
          <label className="clip-number">Clip start (ms)<input type="number" min="0" max={Math.floor(buffer.duration * 1000 - DURATION_MS)} step="1"
            value={Number.isNaN(composition.clipStartMs) ? '' : composition.clipStartMs}
            onChange={event => selectClip(event.target.valueAsNumber)} /></label>
          {clipValid && <p role="status">Selected · {(composition.clipStartMs / 1000).toFixed(3)}–{((composition.clipStartMs + DURATION_MS) / 1000).toFixed(3)} s</p>}
          <div className="trim-actions">
            <button disabled={!clipValid} onClick={() => playing ? stop() : void play()}>{playing ? 'Pause audition' : 'Audition selection'}</button>
          </div>
          <label>Seek within selection
            <input type="range" min={0} max={DURATION_MS} step={1} value={Math.floor(position)}
              disabled={!clipValid} onChange={event => { stop(); setPosition(event.target.valueAsNumber); }} />
          </label>
          <p>Playhead · {(position / 1000).toFixed(2)} s</p>
          <p className="lyric-monitor">Current lyric: {evaluate(composition, playheadFrame(position)).text || '—'}</p>
          {clipValid && <LyricSync key={composition.clipStartMs} audio={buffer} clipStartMs={composition.clipStartMs}
            onChange={cues => setComposition(current => ({ ...current, cues }))} />}
          {composition.cues.length > 0 && <section className="timing-review" aria-label="Review lyric timing">
            <div className="review-transport">
              <h2>Review timing</h2>
              <button type="button" onClick={() => playing ? stop() : void play(true)}>
                {playing ? 'Pause clip' : 'Play 15-second clip'}
              </button>
              <label>Review playhead
                <input type="range" min={0} max={DURATION_MS} step={1} value={Math.floor(position)}
                  onChange={event => { stop(); setPosition(event.target.valueAsNumber); }} />
              </label>
              <output>{(position / 1000).toFixed(2)} s</output>
            </div>
            <p className="hint">Select a word to jump to it and adjust its timing.</p>
            <div className="timed-words">
              {composition.cues.map((cue, index) => {
                const frame = playheadFrame(position);
                const active = frame >= Math.ceil(cue.startMs * FPS / 1000) && frame < Math.ceil(cue.endMs * FPS / 1000);
                return <button type="button" key={index} aria-current={active ? 'true' : undefined}
                  disabled={!Number.isFinite(cue.startMs) || cue.startMs < 0 || cue.startMs >= DURATION_MS}
                  onClick={() => { stop(); setSelectedCue(index); setPosition(Math.ceil(Math.ceil(cue.startMs * FPS / 1000) * 1000 / FPS)); }}>
                  {cue.text || 'Untitled cue'}
                </button>;
              })}
            </div>
            {(() => {
              const index = Math.min(selectedCue, composition.cues.length - 1);
              const cue = composition.cues[index];
              return <div className="word-adjust">
                <strong>Adjust “{cue.text || 'Untitled cue'}”</strong>
                {(['startMs', 'endMs'] as const).map(field => {
                  const label = field === 'startMs' ? 'In' : 'Out';
                  const min = field === 'startMs' ? composition.cues[index - 1]?.endMs ?? 0 : cue.startMs + 1;
                  const max = field === 'startMs' ? cue.endMs - 1 : composition.cues[index + 1]?.startMs ?? DURATION_MS;
                  function adjust(value: number) {
                    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min > max) return;
                    const ms = Math.min(max, Math.max(min, Math.round(value)));
                    edit({ ...composition, cues: composition.cues.map((item, i) => i === index ? { ...item, [field]: ms } : item) });
                  }
                  return <div className="boundary-controls" key={field}>
                    <span>{label} · {(cue[field] / 1000).toFixed(3)} s</span>
                    <button type="button" aria-label={`Move ${label.toLowerCase()} earlier`} onClick={() => adjust(cue[field] - 20)}>−20 ms</button>
                    <button type="button" aria-label={`Move ${label.toLowerCase()} later`} onClick={() => adjust(cue[field] + 20)}>+20 ms</button>
                    <button type="button" onClick={() => adjust(position)}>Set {label.toLowerCase()} to playhead</button>
                  </div>;
                })}
              </div>;
            })()}
          </section>}
          <details className="hint">
            <summary>Advanced manual timing</summary>
            <LyricReview cues={composition.cues} position={position}
              onChange={cues => setComposition(current => ({ ...current, cues }))} />
          </details>
          {clipValid && !valid && <p role="alert">Fill in each lyric and use non-overlapping times in order within the 15-second clip.</p>}
          <div className="trim-actions">
            <button disabled={!valid} onClick={() => openStage(true)}>{composition.cues.length ? 'Approve lyrics and choose visual' : 'Continue without lyrics'}</button>
          </div>
        </>}
        {(error || (buffer && !clipValid)) && <p role="alert">{error || 'Choose a valid 15-second range inside the song.'}</p>}
      </section>
    </main> : <main className="desktop">
      <section>
        <p className="eyebrow">02 / PLAIN COLORS</p>
        <h1>Make a music visual</h1>
        <p className="intro">Choose how your approved lyrics move.</p>
        <button className="back-to-trim" onClick={() => openStage(false)}>Edit music and lyrics</button>
        <fieldset className="preset-picker" disabled={exportFrame !== undefined}>
          <legend>Motion preset</legend>
          {PRESETS.map(preset => <label className="preset" key={preset.id}>
            <input type="radio" name="motion-preset" value={preset.id} checked={composition.template === preset.id}
              onChange={() => edit({ ...composition, template: preset.id })} />
            <span className={`preset-sample ${preset.id}`} aria-hidden="true">Aa</span>
            <strong>{preset.name}</strong>
            <small>{preset.description}</small>
          </label>)}
        </fieldset>
        <p className="hint">{composition.cues.length ? `${composition.cues.length} approved lyric cues` : 'Instrumental · no lyrics'}</p>
        {(error || fontError || (buffer && !valid)) && <p role="alert">{error || fontError || 'Check the 15-second clip range and lyric timing.'}</p>}
        <p className="hint" role="status">{buffer && valid
          ? `Clip ready · ${(composition.clipStartMs / 1000).toFixed(3)}–${((composition.clipStartMs + DURATION_MS) / 1000).toFixed(3)} s`
          : 'To enable preview, choose a WAV and a valid 15-second range.'}</p>
        <button disabled={!valid || exportFrame !== undefined} onClick={() => void exportVideo()}>Export MP4</button>
        {exportFrame !== undefined && <p role="status">Rendering MP4 · {Math.floor(exportFrame / FRAMES * 100)}%</p>}
        {exportError && <p role="alert">{exportError}</p>}
        <details className="hint">
          <summary>Local export fallback</summary>
          <button disabled={!valid} onClick={() => download(
            new Blob([JSON.stringify(composition, null, 2)], { type: 'application/json' }),
            'composition.json',
          )}>Download composition JSON</button>
          <p>The fallback downloads your edit settings as <code>composition.json</code>. To render the video, run this command from the local <code>creative</code> directory with the original WAV:</p>
          <code>npm run export -- composition.json song.wav output.mp4</code>
        </details>
      </section>
      <section className="preview" aria-label="Preview">
        <div className="preview-heading"><strong>Preview</strong><span>9:16 · 15 seconds</span></div>
        <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Visual composition" />
        <div className="transport">
          <button disabled={!valid || fontText !== text} onClick={() => playing ? stop() : void play()}>{playing ? 'Pause' : 'Play'}</button>
          <input aria-label="Seek within clip" type="range" min="0" max={DURATION_MS} step="1" value={Math.floor(position)} disabled={!valid} onChange={event => { stop(); setPosition(event.target.valueAsNumber); }} />
          <output>{(position / 1000).toFixed(2)} s</output>
        </div>
      </section>
    </main>}
    <main className="mobile"><h1>Open MUMOO on desktop</h1><p>Use a desktop browser to time lyrics and preview your music visual.</p></main>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
