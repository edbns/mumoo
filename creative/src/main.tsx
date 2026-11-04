import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { readWavMetadata, type SourceMetadata } from './source-metadata';
import { decodeWav, hashWav } from './audio';
import { DURATION_MS, FPS, FRAMES, HEIGHT, WIDTH, evaluate, lyricText, playheadFrame, validate, type Composition } from './composition';
import { NO_ANALYSIS, acceptsAnalysis, analysisForClip, sameClip, type ClipIdentity, type CreativeProfileV1, type MusicAnalysisState } from './creative-profile';
import { orbitPlan, horizonPlan, timelineFor } from './assembly';
import { draw, loadFont } from './render';
import { MusicDiagnostics } from './music-diagnostics';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';
import { LyricSync } from './lyric-sync';
import { LyricReview } from './lyric-review';
import { Waveform } from './waveform';
import './style.css';
const PixiPreview = lazy(() => import('./pixi-proof/Preview').then(module => ({ default: module.PixiPreview })));

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

const GENRES = [
  'Amapiano', 'Afro House', 'Brazilian Funk', 'Brazilian Funk Mandelão',
  'Brazilian Funk Automotivo', 'Classical', 'Country', 'Deep House', 'Electronic',
  'Funk', 'G-House', 'Hip-Hop', 'House', 'Indie', 'Jazz', 'Latin', 'Latin House',
  'Melodic Techno', 'Montagem', 'Organic House', 'Pop', 'R&B', 'Reggaeton',
  'Rock', 'Slap House', 'Soul', 'Techno', 'Tribal House', 'Other / custom',
];

function App() {
  const [exportFrame, setExportFrame] = useState<number>();
  const [exportError, setExportError] = useState('');
  const exporting = useRef(false);
  const [editingVisual, setEditingVisual] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [genre, setGenre] = useState('');
  const [customGenre, setCustomGenre] = useState('');
  const [influence, setInfluence] = useState('');
  const [videoType, setVideoType] = useState<'lyric' | 'visual' | null>(null);
  const [loading, setLoading] = useState(false);
  const [composition, setComposition] = useState(INITIAL);
  const horizonVariation = 0;
  const pixiVariation = 0;
  const [footageUrl, setFootageUrl] = useState<string>();
  const proofMode = IS_ALIGNMENT_STAGING;
  const [mediaError, setMediaError] = useState('');
  const [musicAnalysis, setMusicAnalysis] = useState<MusicAnalysisState>(NO_ANALYSIS);
  useEffect(() => () => { if (footageUrl) URL.revokeObjectURL(footageUrl); }, [footageUrl]);
  const currentClip = useRef<ClipIdentity | null>(null);
  const selectedGenre = GENRES.find(item => item.toLowerCase() === genre.trim().toLowerCase());
  const genreValid = Boolean(selectedGenre && (selectedGenre !== 'Other / custom' || customGenre.trim()));
  const [sourceMetadata, setSourceMetadata] = useState<SourceMetadata>();
  const [buffer, setBuffer] = useState<AudioBuffer>();
  const [missingWord, setMissingWord] = useState('');
  const [inlineCue, setInlineCue] = useState<number>();
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
  const clip: ClipIdentity = { sourceSha256: composition.sourceSha256, offsetMs: composition.clipStartMs, durationMs: DURATION_MS };
  const proofTimeline = useMemo(() => timelineFor({ sourceSha256: composition.sourceSha256, offsetMs: composition.clipStartMs, durationMs: DURATION_MS }, analysisForClip(musicAnalysis, { sourceSha256: composition.sourceSha256, offsetMs: composition.clipStartMs, durationMs: DURATION_MS })), [composition.sourceSha256, composition.clipStartMs, musicAnalysis]);
  const activeComposition = {
    ...composition,
    cues: videoType === 'visual' ? [] : composition.cues,
    ...(composition.template === 'orbit' ? { assembly: orbitPlan(clip, analysisForClip(musicAnalysis, clip), videoType === 'lyric') } : composition.template === 'horizon' ? { assembly: horizonPlan(clip, analysisForClip(musicAnalysis, clip), videoType === 'lyric', horizonVariation) } : {}),
  };
  const text = lyricText(activeComposition);
  const profile: CreativeProfileV1 | null = clipValid && genreValid && videoType ? {
    version: 1,
    clip,
    creator: {
      primaryGenre: { value: selectedGenre === 'Other / custom' ? customGenre.trim() : selectedGenre!, source: 'creator' },
      ...(influence.trim() && { influence: { value: influence.trim(), source: 'creator' as const } }),
      ...(sourceMetadata?.title && { title: { value: sourceMetadata.title, source: 'embedded_metadata' as const } }),
      ...(sourceMetadata?.artist && { artist: { value: sourceMetadata.artist, source: 'embedded_metadata' as const } }),
    },
    videoType,
    musicAnalysis: analysisForClip(musicAnalysis, clip),
    ...(videoType === 'lyric' && editingVisual && { approvedLyrics: { cues: composition.cues, source: 'creator_reviewed' as const } }),
  } : null;
  const valid = (() => {
    if (!buffer) return false;
    try {
      validate(activeComposition, buffer.duration * 1000);
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
    const previousClip = currentClip.current;
    currentClip.current = null;
    setMusicAnalysis(current => current.status === 'pending' ? NO_ANALYSIS : current);
    stop();
    setBuffer(undefined);
    setSourceMetadata(undefined);
    setEditingVisual(false);
    setStep(1);
    setVideoType(null);
    setLoading(Boolean(file));
    setPosition(0);
    setError('');
    if (!file) { setMusicAnalysis(NO_ANALYSIS); return; }
    try {
      const bytes = await file.arrayBuffer();
      const sourceSha256 = await hashWav(bytes);
      const metadata = readWavMetadata(bytes);
      const audio = await decodeWav(bytes);
      validate({ ...INITIAL, sourceSha256 }, audio.duration * 1000);
      if (request !== upload.current) return;
      const nextClip: ClipIdentity = { sourceSha256, offsetMs: 0, durationMs: DURATION_MS };
      const unchanged = sameClip(previousClip, nextClip);
      if (!unchanged) setMusicAnalysis(NO_ANALYSIS);
      setComposition(current => ({ ...current, sourceSha256, clipStartMs: 0, cues: unchanged ? current.cues : [] }));
      currentClip.current = nextClip;
      setBuffer(audio);
      setSourceMetadata(metadata);
    } catch (cause) {
      if (request === upload.current) { setMusicAnalysis(NO_ANALYSIS); setError((cause as Error).message); }
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

  function insertWord(text: string) {
    const startMs = Math.floor(position);
    const cues = [...composition.cues];
    const index = cues.filter(cue => cue.startMs < startMs).length;
    const endMs = Math.min(startMs + 250, cues[index]?.startMs ?? DURATION_MS);
    if (!text.trim() || [...text.trim()].length > 48 || cues.length >= 120 ||
        startMs < (cues[index - 1]?.endMs ?? 0) || endMs - startMs < Math.ceil(1000 / FPS)) return false;
    cues.splice(index, 0, { text: text.trim(), startMs, endMs });
    edit({ ...composition, cues });
    setSelectedCue(index);
    setInlineCue(undefined);
    setMissingWord('');
    return true;
  }

  function edit(next: typeof INITIAL) {
    stop();
    setComposition(next);
  }

  function selectClip(clipStartMs: number) {
    stop();
    setPosition(0);
    const next: ClipIdentity = { sourceSha256: composition.sourceSha256, offsetMs: clipStartMs, durationMs: DURATION_MS };
    if (!sameClip(currentClip.current, next)) {
      currentClip.current = next;
      setMusicAnalysis(NO_ANALYSIS);
    }
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
    if (!proofMode && canvas.current && fontText === text) {
      draw(canvas.current, activeComposition, playheadFrame(position));
    }
  }, [composition, videoType, editingVisual, fontText, position, musicAnalysis, horizonVariation, proofMode]);

  async function exportVideo() {
    if (!buffer || !valid || exporting.current) return;
    exporting.current = true;
    stop();
    setExportError('');
    setExportFrame(0);
    let proofScene: Awaited<ReturnType<typeof import('./pixi-proof/scene').createEditorialScene>> | undefined;
    try {
      const { renderMp4 } = await import('./browser-export');
      const video = await renderMp4(activeComposition, buffer, setExportFrame, proofMode ? async (target, frame) => {
        if (!proofScene) {
          const { createEditorialScene } = await import('./pixi-proof/scene');
          proofScene = await createEditorialScene(target, proofTimeline, pixiVariation, true, activeComposition, footageUrl);
        }
        await proofScene.render(frame);
      } : undefined);
      download(video, 'mumoo.mp4');
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'MP4 export failed.');
    } finally {
      proofScene?.destroy();
      exporting.current = false;
      setExportFrame(undefined);
    }
  }

  const addWordForm = <details className="hint">
            <summary>Add a missed word</summary>
            <p>Move the playhead into a gap, then add the word. You can adjust its boundaries in Review timing.</p>
            <form onSubmit={event => {
              event.preventDefault();
              setError(insertWord(missingWord) ? '' : 'Choose a gap at least one frame long and enter the missed word.');
            }}>
              <label>Missed word<input maxLength={48} value={missingWord} onChange={event => setMissingWord(event.target.value)} /></label>
              <button type="submit" disabled={!missingWord.trim()}>Add at playhead</button>
            </form>
          </details>;

  return <>
    <header className="masthead"><img src="/brand/mumoo-logo.png" alt="mumoo" width="144" height="36" /><span>Creative Studio</span></header>
    {!editingVisual ? <main className="desktop trim">
      <section>
        <p className="eyebrow">0{step} / {step === 1 ? 'MUSIC' : step === 2 ? 'YOUR CLIP' : step === 3 ? 'VIDEO TYPE' : 'PREPARE'}</p>
        <h1>{step === 1 ? 'Upload your song' : step === 2 ? 'Choose your 15 seconds' : step === 3 ? 'Choose your video type' : videoType === 'lyric' ? 'Sync your lyrics' : 'Prepare your visual'}</h1>
        {step === 1 && <><p className="intro">Upload a WAV and tell us its genre.</p>
        <label>Source WAV<input type="file" accept=".wav,audio/wav,audio/x-wav" onChange={event => void choose(event.target.files?.[0])} /></label>
        {sourceMetadata && <details className="hint">
          <summary>Source file details</summary>
          <dl>
            {sourceMetadata.title && <><dt>Title</dt><dd>{sourceMetadata.title}</dd></>}
            {sourceMetadata.artist && <><dt>Artist</dt><dd>{sourceMetadata.artist}</dd></>}
            {sourceMetadata.codec && <><dt>Codec</dt><dd>{sourceMetadata.codec}</dd></>}
            {sourceMetadata.sampleRateHz && <><dt>Sample rate</dt><dd>{sourceMetadata.sampleRateHz} Hz</dd></>}
            {sourceMetadata.channels && <><dt>Channels</dt><dd>{sourceMetadata.channels}</dd></>}
            {sourceMetadata.durationMs !== undefined && <><dt>Duration</dt><dd>{(sourceMetadata.durationMs / 1000).toFixed(3)} s</dd></>}
          </dl>
        </details>}
        {loading && <p role="status">Opening your music…</p>}
        <label>Primary genre
          <input list="genre-options" value={genre} onChange={event => setGenre(event.target.value)} placeholder="Search genres" />
        </label>
        <datalist id="genre-options">{GENRES.map(item => <option key={item} value={item} />)}</datalist>
        {selectedGenre === 'Other / custom' && <label>Custom genre<input maxLength={100} value={customGenre}
          onChange={event => setCustomGenre(event.target.value)} placeholder="Enter your genre" /></label>}
        <label>Secondary genre or influence <span className="hint">(optional)</span>
          <input maxLength={100} value={influence} onChange={event => setInfluence(event.target.value)} placeholder="Add an influence" />
        </label>
        <button disabled={!buffer || !genreValid || loading} onClick={() => setStep(2)}>Continue to clip</button></>}
        {buffer && <>
          <div hidden={step !== 2}>
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
          <div className="trim-actions"><button onClick={() => { stop(); setStep(1); }}>Back to song</button>
            <button disabled={!clipValid || !genreValid} onClick={() => { stop(); setStep(3); }}>Continue to video type</button></div>
          </div>
          {step === 3 && <><p className="intro">Choose whether your video includes lyrics.</p>
            <fieldset className="video-type-picker"><legend>Video type</legend>
              <label><input type="radio" name="video-type" checked={videoType === 'lyric'} onChange={() => setVideoType('lyric')} /> Lyric Video</label>
              <label><input type="radio" name="video-type" checked={videoType === 'visual'} onChange={() => setVideoType('visual')} /> Visual</label>
            </fieldset>
            <div className="trim-actions"><button onClick={() => setStep(2)}>Back to clip</button>
              <button disabled={!videoType || !clipValid || !genreValid} onClick={() => setStep(4)}>Continue</button></div>
          </>}
          <div hidden={step !== 4}>
          {step === 4 && <><button onClick={() => { stop(); setStep(3); }}>Back to video type</button>
          {videoType === 'lyric' && <p className="lyric-monitor">Current lyric: {evaluate(composition, playheadFrame(position)).text || '—'}</p>}</>}
          {step === 4 && videoType === 'lyric' && <><label>Lyric playhead
            <input type="range" min={0} max={DURATION_MS} step={1} value={Math.floor(position)}
              onChange={event => { stop(); setPosition(event.target.valueAsNumber); }} /></label>
          <button onClick={() => playing ? stop() : void play()}>{playing ? 'Pause audition' : 'Audition selection'}</button>
          {clipValid && <LyricSync key={composition.clipStartMs} audio={buffer} clipStartMs={composition.clipStartMs}
            onChange={cues => setComposition(current => ({ ...current, cues }))} onInsertWord={insertWord} />}
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
            <p className="hint">Click a word to edit it in place. Press Enter to finish.</p>
            <div className="timed-words">
              {composition.cues.map((cue, index) => {
                const frame = playheadFrame(position);
                const active = frame >= Math.ceil(cue.startMs * FPS / 1000) && frame < Math.ceil(cue.endMs * FPS / 1000);
                if (inlineCue === index) return <input key={index} className="inline-lyric" aria-label="Edit lyric word"
                  autoFocus maxLength={48} value={cue.text} style={{ width: `${Math.max(6, Math.min(40, cue.text.length + 2))}ch` }}
                  onFocus={event => event.currentTarget.select()}
                  onBlur={() => setInlineCue(undefined)}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  onChange={event => {
                    const text = event.target.value;
                    edit({ ...composition, cues: composition.cues.map((item, i) => i === index ? { ...item, text } : item) });
                  }} />;
                return <button type="button" key={index} aria-current={active ? 'true' : undefined}
                  disabled={!Number.isFinite(cue.startMs) || cue.startMs < 0 || cue.startMs >= DURATION_MS}
                  onClick={() => { stop(); setSelectedCue(index); setInlineCue(index); setPosition(Math.ceil(Math.ceil(cue.startMs * FPS / 1000) * 1000 / FPS)); }}>
                  {cue.text || 'Untitled cue'}
                </button>;
              })}
            </div>
            {addWordForm}
            {(() => {
              const index = Math.min(selectedCue, composition.cues.length - 1);
              const cue = composition.cues[index];
              return <div className="word-adjust">
                <strong>Timing for “{cue.text || 'Untitled cue'}”</strong>
                <div><button type="button" onClick={() => {
                  edit({ ...composition, cues: composition.cues.filter((_, i) => i !== index) });
                  setSelectedCue(Math.max(0, index - 1));
                }}>Remove selected cue</button></div>
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
          {composition.cues.length === 0 && addWordForm}
          <details className="hint">
            <summary>Advanced manual timing</summary>
            <LyricReview cues={composition.cues} position={position}
              onChange={cues => setComposition(current => ({ ...current, cues }))} />
          </details>
          {clipValid && !valid && <p role="alert">Fill in each lyric and use non-overlapping times in order within the 15-second clip.</p>}
          </>}
          {step === 4 && <div className="trim-actions">
            <button disabled={!valid || (videoType === 'lyric' && composition.cues.length === 0)}
              onClick={() => openStage(true)}>{videoType === 'lyric' ? 'Approve lyrics and choose visual' : 'Continue without lyrics'}</button>
          </div>}
          </div>
        </>}
        {(error || (buffer && !clipValid)) && <p role="alert">{error || 'Choose a valid 15-second range inside the song.'}</p>}
      </section>
    </main> : <main className="desktop">
      <section>
        <p className="eyebrow">YOUR VIDEO</p>
        <h1>Create your music visual</h1>
        <p className="intro">Use our visual, or make your own video the star.</p>
        <p className="hint">Genre · {profile?.creator.primaryGenre.value}{profile?.creator.influence && ` · ${profile.creator.influence.value}`}</p>
        <button className="back-to-trim" onClick={() => openStage(false)}>Edit music and lyrics</button>
        {proofMode && <>
          <label>Add your video <input type="file" accept="video/mp4,video/webm" disabled={exportFrame !== undefined} onChange={event => {
            stop();
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size === 0 || file.size > 250 * 1024 * 1024 || !['video/mp4', 'video/webm'].includes(file.type)) {
              setMediaError('Choose an MP4 or WebM video under 250 MB.');
              event.target.value = '';
              return;
            }
            setMediaError('');
            setFootageUrl(URL.createObjectURL(file));
            event.target.value = '';
          }} /></label>
          <p className="hint">One MP4 or WebM video, up to 250 MB. Your video stays on this device. MUMOO fits it to the screen automatically; shorter videos repeat.</p>
          {footageUrl && <button disabled={exportFrame !== undefined} onClick={() => { stop(); setFootageUrl(undefined); setMediaError(''); }}>Use MUMOO visual instead</button>}
          {mediaError && <p role="alert">{mediaError}</p>}
        </>}
        <p className="hint">{activeComposition.cues.length ? `${activeComposition.cues.length} approved lyric cues` : 'Instrumental · no lyrics'}</p>
        {(error || fontError || (buffer && !valid)) && <p role="alert">{error || fontError || 'Check the 15-second clip range and lyric timing.'}</p>}
        <p className="hint" role="status">{buffer && valid
          ? `Clip ready · ${(composition.clipStartMs / 1000).toFixed(3)}–${((composition.clipStartMs + DURATION_MS) / 1000).toFixed(3)} s`
          : 'To enable preview, choose a WAV and a valid 15-second range.'}</p>
        <button disabled={!valid || exportFrame !== undefined} onClick={() => void exportVideo()}>Export MP4</button>
        {exportFrame !== undefined && <p role="status">Rendering MP4 · {Math.floor(exportFrame / FRAMES * 100)}%</p>}
        {exportError && <p role="alert">{exportError}</p>}
      </section>
      <section className="preview" aria-label="Preview">
        <div className="preview-heading"><strong>Preview</strong><span>9:16 · 15 seconds</span></div>
        {proofMode && IS_ALIGNMENT_STAGING ? fontText === text ? <Suspense fallback={<p>Loading visual…</p>}><PixiPreview position={position} timeline={proofTimeline} composition={activeComposition} seed={pixiVariation} footageUrl={footageUrl} /></Suspense> : <p>Loading visual…</p> : <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Visual composition" />}
        <div className="transport">
          <button disabled={!valid || fontText !== text} onClick={() => playing ? stop() : void play()}>{playing ? 'Pause' : 'Play'}</button>
          <input aria-label="Seek within clip" type="range" min="0" max={DURATION_MS} step="1" value={Math.floor(position)} disabled={!valid} onChange={event => { stop(); setPosition(event.target.valueAsNumber); }} />
          <output>{(position / 1000).toFixed(2)} s</output>
        </div>
      </section>
    </main>}
    {buffer && clipValid && IS_ALIGNMENT_STAGING && <div className="desktop music-analysis" style={{ display: !editingVisual && step === 4 ? undefined : 'none' }}>
      <section><MusicDiagnostics key={composition.sourceSha256 + ':' + composition.clipStartMs}
        audio={buffer} clip={clip} analysis={profile?.musicAnalysis ?? analysisForClip(musicAnalysis, clip)}
        onChange={state => {
          if (acceptsAnalysis(currentClip.current, state)) setMusicAnalysis(state);
        }} /></section>
    </div>}
    <main className="mobile"><h1>Open MUMOO on desktop</h1><p>Use a desktop browser to time lyrics and preview your music visual.</p></main>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
