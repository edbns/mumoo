import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { readWavMetadata, type SourceMetadata } from './source-metadata';
import { decodeWav, hashWav } from './audio';
import { DURATION_MS, FPS, evaluate, lyricText, playheadFrame, validate, type Composition } from './composition';
import { NO_ANALYSIS, acceptsAnalysis, analysisForClip, sameClip, type ClipIdentity, type CreativeProfileV1, type MusicAnalysisState } from './creative-profile';
import { loadFont } from './render';
import { MusicAnalysisRunner } from './music-analysis-runner';
import { MediaStudio } from './media-studio';
import { HumanMagnetStudio } from './human-magnet-studio';
import { VisualCuriosityStudio } from './visual-curiosity-studio';
import { DailyScreensStudio } from './daily-screens-studio';
import { LyricImpactStudio } from './lyric-impact-studio';
import { MediaAdmin } from './media-admin';
import { CatalogResearch } from './catalog-research';
import { StagingAccess } from './staging-access';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';
import { LyricSync } from './lyric-sync';
import { LyricReview } from './lyric-review';
import { Waveform } from './waveform';
import './style.css';

const INITIAL: Extract<Composition, { version: 2 }> = {
  version: 2, template: 'scribble', sourceSha256: '', clipStartMs: 0, cues: [],
};


const GENRES = [
  'Acoustic / Singer-songwriter', 'Alternative Rock', 'Ambient', 'Blues', 'Chill-out', 'Christian', 'Classical', 'Country',
  'Dance', 'Drum and Bass', 'EDM', 'Electronic', 'Emo', 'Funk', 'Hardcore Punk', 'House', 'Indie Folk', 'Indie Pop',
  'Indie Rock', 'Jazz', 'Latin', 'Lo-fi', 'Metal', 'Metalcore', 'Pop', 'Pop Punk', 'Punk Rock', 'R&B',
  'Rap / Hip-hop', 'Reggae', 'Rock', 'Techno', 'Trap', 'World', 'Other / Not sure',
];

function App() {
  const [accessToken, setAccessToken] = useState('');
  const [editingVisual, setEditingVisual] = useState(false);
  const [dailyScreens, setDailyScreens] = useState(true);
  const [lyricImpact, setLyricImpact] = useState(false);
  const [humanMagnet, setHumanMagnet] = useState(false);
  const [visualCuriosity, setVisualCuriosity] = useState(false);
  const [rhythmicMontage, setRhythmicMontage] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [genre, setGenre] = useState('');
  const [influence, setInfluence] = useState('');
  const [videoType, setVideoType] = useState<'lyric' | 'visual' | null>(null);
  const [loading, setLoading] = useState(false);
  const [composition, setComposition] = useState(INITIAL);
  const [musicAnalysis, setMusicAnalysis] = useState<MusicAnalysisState>(NO_ANALYSIS);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const currentClip = useRef<ClipIdentity | null>(null);
  const selectedGenre = GENRES.find(item => item.toLowerCase() === genre.trim().toLowerCase());
  const genreValid = Boolean(selectedGenre);
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
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const animation = useRef(0);
  const upload = useRef(0);
  const playback = useRef(0);

  const clipValid = Boolean(buffer && Number.isSafeInteger(composition.clipStartMs) &&
    composition.clipStartMs >= 0 && composition.clipStartMs <= buffer.duration * 1000 - DURATION_MS);
  const clip: ClipIdentity = { sourceSha256: composition.sourceSha256, offsetMs: composition.clipStartMs, durationMs: DURATION_MS };
  const activeComposition = { ...composition, cues: videoType === 'visual' ? [] : composition.cues };
  const text = lyricText(activeComposition);
  const profile: CreativeProfileV1 | null = clipValid && genreValid && videoType ? {
    version: 1,
    clip,
    creator: {
      primaryGenre: { value: selectedGenre!, source: 'creator' },
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
    if (!buffer || !clipValid || (editingVisual && (!valid || (videoType === 'lyric' && fontText !== text)))) return;
    const request = ++playback.current;
    try {
      setError('');
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
    if (visual) { setDailyScreens(true); setLyricImpact(false); setHumanMagnet(videoType === 'visual'); setVisualCuriosity(videoType === 'visual'); setRhythmicMontage(false); }
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
        <label>Secondary genre or influence <span className="hint">(optional)</span>
          <input maxLength={100} value={influence} onChange={event => setInfluence(event.target.value)} placeholder="Add an influence" />
        </label>
        {IS_ALIGNMENT_STAGING && (!accessToken ? <StagingAccess onAccess={setAccessToken} /> : <p className="hint">Staging access enabled. <button className="secondary" onClick={() => setAccessToken('')}>Sign in again</button></p>)}
        {!loading && !buffer && <p className="hint">Choose a WAV file at least 15 seconds long to continue.</p>}
        {genre.trim() && !selectedGenre && <p role="status">Choose a genre from the suggestions, or select “Other / Not sure”.</p>}
        {error && <p role="alert">{error}</p>}
        <button disabled={!buffer || !genreValid || loading || (IS_ALIGNMENT_STAGING && !accessToken)} onClick={() => setStep(2)}>Continue to clip</button></>}
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
              <button disabled={!videoType || !clipValid || !genreValid} onClick={() => { setStep(4); if (videoType === 'visual') openStage(true); }}>Continue</button></div>
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
        {step !== 1 && (error || (buffer && !clipValid)) && <p role="alert">{error || 'Choose a valid 15-second range inside the song.'}</p>}
      </section>
    </main> : profile && buffer && (rhythmicMontage && IS_ALIGNMENT_STAGING ? <MediaStudio montage profile={profile} composition={activeComposition} audio={buffer} token={accessToken} position={position} playing={playing} playbackError={error} onPlay={() => void play()} onStop={stop} onBack={() => openStage(false)} onFamilies={() => { stop(); setRhythmicMontage(false); }} onSeek={ms => { stop(); setPosition(ms); }} onRetry={() => { setMusicAnalysis(NO_ANALYSIS); setAnalysisAttempt(n => n + 1); }} /> : visualCuriosity && IS_ALIGNMENT_STAGING ? <VisualCuriosityStudio profile={profile} composition={activeComposition} audio={buffer} position={position} playing={playing} playbackError={error} onPlay={() => void play()} onStop={stop} onSeek={ms => { stop(); setPosition(ms); }} onBack={() => openStage(false)} onOther={() => { stop(); setVisualCuriosity(false); if (videoType === 'lyric') setHumanMagnet(false); }} onMedia={() => { stop(); setVisualCuriosity(false); setHumanMagnet(false); }} onMontage={() => { stop(); setRhythmicMontage(true); }} /> : humanMagnet && IS_ALIGNMENT_STAGING ? <HumanMagnetStudio profile={profile} composition={activeComposition} audio={buffer} token={accessToken} position={position} playing={playing} playbackError={error} onPlay={() => void play()} onStop={stop} onBack={() => openStage(false)} onOther={() => { stop(); setHumanMagnet(false); }} onRetry={() => { setMusicAnalysis(NO_ANALYSIS); setAnalysisAttempt(n => n + 1); }} onCuriosity={() => { stop(); setVisualCuriosity(true); }} onMontage={() => { stop(); setRhythmicMontage(true); }} /> : IS_ALIGNMENT_STAGING && videoType === 'lyric' && dailyScreens ? lyricImpact ? <LyricImpactStudio profile={profile} composition={activeComposition} audio={buffer} token={accessToken} position={position} playing={playing} playbackError={error} onPlay={() => void play()} onStop={stop} onSeek={ms => { stop(); setPosition(ms); }} onBack={() => openStage(false)} onDaily={() => { stop(); setLyricImpact(false); }} onHuman={() => { stop(); setHumanMagnet(true); }} onCuriosity={() => { stop(); setVisualCuriosity(true); }} onMontage={() => { stop(); setRhythmicMontage(true); }} /> : <DailyScreensStudio profile={profile} composition={activeComposition} audio={buffer} token={accessToken} position={position} playing={playing} playbackError={error} onPlay={() => void play()} onStop={stop} onSeek={ms => { stop(); setPosition(ms); }} onBack={() => openStage(false)} onImpact={() => { stop(); setLyricImpact(true); }} onHuman={() => { stop(); setHumanMagnet(true); }} onCuriosity={() => { stop(); setVisualCuriosity(true); }} onMontage={() => { stop(); setRhythmicMontage(true); }} onOther={() => { stop(); setDailyScreens(false); }} /> : <MediaStudio profile={profile} composition={activeComposition} audio={buffer} token={accessToken} playbackError={error}
      position={position} playing={playing} onPlay={() => void play(true)} onStop={stop} onBack={() => openStage(false)} onRetry={() => { setMusicAnalysis(NO_ANALYSIS); setAnalysisAttempt(n => n + 1); }} />)}
    {buffer && clipValid && IS_ALIGNMENT_STAGING && (step === 4 || editingVisual) && <MusicAnalysisRunner key={composition.sourceSha256 + ':' + composition.clipStartMs + ':' + analysisAttempt}
      audio={buffer} clip={clip} analysis={analysisForClip(musicAnalysis, clip)} accessToken={accessToken} onChange={state => { if (acceptsAnalysis(currentClip.current, state)) setMusicAnalysis(state); }} />}

    {fontError && <p role="alert">{fontError}</p>}
    <main className="mobile"><h1>Open MUMOO on desktop</h1><p>Use a desktop browser to time lyrics and preview your music visual.</p></main>
  </>;
}

const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(IS_ALIGNMENT_STAGING && params.get('catalog-research') === '1' ? <CatalogResearch /> : IS_ALIGNMENT_STAGING && params.get('media-admin') === '1' ? <MediaAdmin /> : <App />);
