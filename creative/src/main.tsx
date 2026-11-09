import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodeAudio, hashAudio, probeDurationMs } from './audio';
import { ACCEPTED_AUDIO, ACCEPTED_LABEL, readSongCover, readSongTags, sniffAudioFormat, type SongTags } from './audio-format';
import { describeCover, type CoverRead } from './cover-palette';
import { DURATION_MS, validate, type Composition } from './composition';
import { NO_ANALYSIS, acceptsAnalysis, analysisForClip, sameClip, type ClipIdentity, type CreativeProfileV1, type MusicAnalysisState } from './creative-profile';
import { MusicAnalysisRunner } from './music-analysis-runner';
import { useLyricMeaning } from './lyric-meaning-cloud';
import { CreativesPackStudio } from './creatives-pack-studio';
import { SHELF_ROWS } from './creatives-pack';
import { useCart, songKeyOf } from './cart';
import { CartButton, CartPanel, DownloadNotice, type CartAction, type CartLine } from './cart-panel';
import { useCartDownload } from './use-cart-download';
import { useUploads } from './use-uploads';
import { SESSION_KEY, clearSong, loadSong, readSession, saveSong, writeSession, type Session } from './session';
import type { LyricWord } from './lyrics-cloud';
import { StagingAccess } from './staging-access';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';
import { LyricsStudio } from './lyrics-studio';
import { Waveform } from './waveform';
import './style.css';

// Sign-in pulls in the auth client; it loads beside the page instead of in front of it.
const AccountBar = lazy(() => import('./account').then(module => ({ default: module.AccountBar })));

/** How long the window must rest before the music inside it plays. */
const AUDITION_PAUSE_MS = 200;
const INITIAL: Composition = { sourceSha256: '', clipStartMs: 0, cues: [] };


const GENRES = [
  'Acoustic / Singer-songwriter', 'Alternative Rock', 'Ambient', 'Blues', 'Chill-out', 'Christian', 'Classical', 'Country',
  'Dance', 'Drum and Bass', 'EDM', 'Electronic', 'Emo', 'Funk', 'Hardcore Punk', 'House', 'Indie Folk', 'Indie Pop',
  'Indie Rock', 'Jazz', 'Latin', 'Lo-fi', 'Metal', 'Metalcore', 'Pop', 'Pop Punk', 'Punk Rock', 'R&B',
  'Rap / Hip-hop', 'Reggae', 'Rock', 'Techno', 'Trap', 'World', 'Other / Not sure',
];

const cuesOf = (words: readonly LyricWord[]) => words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

function App() {
  const [accessToken, setAccessToken] = useState('');
  const [inCreatives, setInCreatives] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  // A saved session is put back before anything is shown, so a refresh never flashes the first page.
  const [restoring, setRestoring] = useState(() => readSession(localStorage.getItem(SESSION_KEY)) !== null);
  const [restoreNote, setRestoreNote] = useState('');
  /** True once the song file is safe in this browser, which is what makes a refresh resumable. */
  const [kept, setKept] = useState(false);
  const [keepFailed, setKeepFailed] = useState(false);
  const [songName, setSongName] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const downloadRef = useRef<(() => void) | null>(null);
  const [genre, setGenre] = useState('');
  const [influence, setInfluence] = useState('');
  const [loading, setLoading] = useState(false);
  const [composition, setComposition] = useState(INITIAL);
  const [musicAnalysis, setMusicAnalysis] = useState<MusicAnalysisState>(NO_ANALYSIS);
  const currentClip = useRef<ClipIdentity | null>(null);
  const selectedGenre = GENRES.find(item => item.toLowerCase() === genre.trim().toLowerCase());
  const genreValid = Boolean(selectedGenre);
  const [songTags, setSongTags] = useState<SongTags>();
  const [songCover, setSongCover] = useState<CoverRead | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer>();
  const [lyricsState, setLyricsState] = useState({ busy: false, dirty: false });
  const [lyricsInfo, setLyricsInfo] = useState<{ language?: string; origin: 'transcribed' | 'typed' }>({ origin: 'transcribed' });
  /** The same words as `composition.cues`, with the line breaks and timing marks the lyrics editor needs to open on them again. */
  const [lyricWords, setLyricWords] = useState<LyricWord[]>([]);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const animation = useRef(0);
  const upload = useRef(0);
  const playback = useRef(0);
  // Moving the window plays what is inside it once the hand pauses, so the choice is made by ear.
  const audition = useRef(0);
  // Keep a live playhead for canvas preview loops so heavy React paints cannot lag lyrics behind audio.
  const positionRef = useRef(0);
  const positionUiAt = useRef(0);
  function seekTo(ms: number, forceUi = true) {
    positionRef.current = ms;
    if (forceUi) {
      positionUiAt.current = performance.now();
      setPosition(ms);
    }
  }

  const clipValid = Boolean(buffer && Number.isSafeInteger(composition.clipStartMs) &&
    composition.clipStartMs >= 0 && composition.clipStartMs <= buffer.duration * 1000 - DURATION_MS);
  const clip: ClipIdentity = { sourceSha256: composition.sourceSha256, offsetMs: composition.clipStartMs, durationMs: DURATION_MS };
  // The cart belongs to the song and clip being worked on, and is the same on every page.
  const cart = useCart(clipValid ? songKeyOf(composition.sourceSha256, composition.clipStartMs) : '');
  const uploads = useUploads();
  const download = useCartDownload({ token: accessToken, cart, onDelivered: () => setCartOpen(false) });
  // The words are read the moment they are final (synced and not being edited), so the answer is ready by the creatives screen.
  const lyricMeaning = useLyricMeaning(accessToken, composition.cues, lyricsInfo.language,
    IS_ALIGNMENT_STAGING && clipValid && !lyricsState.busy && !lyricsState.dirty);
    const profile: CreativeProfileV1 | null = clipValid && genreValid ? {
    version: 1,
    clip,
    creator: {
      primaryGenre: { value: selectedGenre!, source: 'creator' },
      ...(influence.trim() && { influence: { value: influence.trim(), source: 'creator' as const } }),
      ...(songTags?.title && { title: { value: songTags.title, source: 'embedded_metadata' as const } }),
      ...(songTags?.artist && { artist: { value: songTags.artist, source: 'embedded_metadata' as const } }),
      ...(songCover && { cover: { value: songCover, source: 'embedded_metadata' as const } }),
    },
    musicAnalysis: analysisForClip(musicAnalysis, clip),
    ...(lyricMeaning && { lyricMeaning }),
    ...(inCreatives && { approvedLyrics: { cues: composition.cues, source: 'creator_reviewed' as const, ...lyricsInfo } }),
  } : null;
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
    clearTimeout(audition.current);
    playback.current++;
    cancelAnimationFrame(animation.current);
    source.current?.stop();
    source.current = null;
    setPlaying(false);
  }

  /** Starts over from the state left behind by a failed or abandoned restore: the saved session is gone and the person is told why. */
  function startFresh(reason: string) {
    localStorage.removeItem(SESSION_KEY);
    void clearSong().catch(() => undefined);
    setKept(false);
    setRestoreNote(`We could not restore your last session (${reason}). Choose your song again to start fresh.`);
    setRestoring(false);
  }

  /** Opens a song: the one the person just picked, or (with `resume`) the saved one, through the same steps. */
  async function choose(file?: File, resume?: Session) {
    const request = ++upload.current;
    const previousClip = currentClip.current;
    currentClip.current = null;
    setMusicAnalysis(current => current.status === 'pending' ? NO_ANALYSIS : current);
    stop();
    setBuffer(undefined);
    setSongTags(undefined);
    setSongCover(null);
    setSongName(file?.name ?? '');
    setInCreatives(false);
    setStep(1);
    setLyricsState({ busy: false, dirty: false });
    setLyricsInfo({ origin: 'transcribed' });
    setLoading(Boolean(file));
    setKept(false);
    setKeepFailed(false);
    setRestoreNote('');
    seekTo(0);
    setError('');
    // A restore keeps what was saved until it has worked; a new song or an empty choice ends the old session.
    if (!resume) localStorage.removeItem(SESSION_KEY);
    if (!file) {
      setMusicAnalysis(NO_ANALYSIS);
      void clearSong().catch(() => undefined);
      return;
    }
    try {
      const probedMs = await probeDurationMs(file);
      const bytes = await file.arrayBuffer();
      const sourceSha256 = await hashAudio(bytes);
      // Tags and format are read from the original bytes before decoding detaches the buffer.
      const format = sniffAudioFormat(bytes);
      const tags = readSongTags(bytes, format);
      const cover = await describeCover(readSongCover(bytes, format));
      const audio = await decodeAudio(bytes, probedMs);
      validate({ ...INITIAL, sourceSha256 }, audio.duration * 1000);
      if (resume) {
        if (resume.sourceSha256 !== sourceSha256) throw new Error('the saved song is not the one you were working on');
        validate({ sourceSha256, clipStartMs: resume.clipStartMs, cues: cuesOf(resume.words) }, audio.duration * 1000);
      }
      if (request !== upload.current) return;
      const nextClip: ClipIdentity = { sourceSha256, offsetMs: resume?.clipStartMs ?? 0, durationMs: DURATION_MS };
      const unchanged = !resume && sameClip(previousClip, nextClip);
      if (!unchanged) setMusicAnalysis(NO_ANALYSIS);
      setComposition(current => resume
        ? { sourceSha256, clipStartMs: resume.clipStartMs, cues: cuesOf(resume.words) }
        : { ...current, sourceSha256, clipStartMs: 0, cues: unchanged ? current.cues : [] });
      setLyricWords(current => resume ? resume.words : unchanged ? current : []);
      currentClip.current = nextClip;
      setBuffer(audio);
      setSongTags(tags);
      setSongCover(cover);
      if (resume) {
        const genreOk = GENRES.some(item => item.toLowerCase() === resume.genre.trim().toLowerCase());
        setGenre(resume.genre);
        setInfluence(resume.influence);
        setLyricsInfo({ origin: resume.lyricsOrigin, ...(resume.lyricsLanguage && { language: resume.lyricsLanguage }) });
        setStep(genreOk ? resume.step : 1);
        setInCreatives(genreOk && resume.inCreatives);
        setKept(true);
      } else {
        saveSong(file).then(
          () => { if (request === upload.current) setKept(true); },
          () => { if (request === upload.current) setKeepFailed(true); },
        );
      }
    } catch (cause) {
      if (request === upload.current) {
        setMusicAnalysis(NO_ANALYSIS);
        if (resume) startFresh((cause as Error).message);
        else setError((cause as Error).message);
      }
    } finally {
      if (request === upload.current) { setLoading(false); setRestoring(false); }
    }
  }

  // After a refresh the saved session is opened again, through `choose`, before anything is shown.
  useEffect(() => {
    const session = readSession(localStorage.getItem(SESSION_KEY));
    if (!session) return;
    loadSong().then(song => {
      if (song) return choose(song, session);
      startFresh('this browser no longer has your song');
    }, (cause: Error) => startFresh(cause.message));
  }, []);

  // What the person has done so far is kept as it changes; only what a restore needs, and only once the song itself is kept.
  useEffect(() => {
    if (!kept) return;
    try {
      localStorage.setItem(SESSION_KEY, writeSession({
        sourceSha256: composition.sourceSha256, genre, influence, step, clipStartMs: composition.clipStartMs,
        words: lyricWords, lyricsOrigin: lyricsInfo.origin, ...(lyricsInfo.language && { lyricsLanguage: lyricsInfo.language }), inCreatives,
      }));
    } catch {
      setKeepFailed(true);
    }
  }, [kept, genre, influence, step, composition, lyricWords, lyricsInfo, inCreatives]);

  function startOver() {
    if (!window.confirm('Start over with another song? Your song and lyrics are cleared from this browser. Your cart is kept.')) return;
    void choose(undefined);
    setGenre('');
    setInfluence('');
    setComposition(INITIAL);
    setLyricWords([]);
    setCartOpen(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function play(fromStart = false) {
    if (!buffer || !clipValid) return;
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
        // Always advance the live playhead; throttle React seek-bar updates so canvas
        // studios can paint on audio time without waiting on heavy re-renders.
        const now = performance.now();
        seekTo(next, next >= DURATION_MS || now - positionUiAt.current >= 50);
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

  function selectClip(clipStartMs: number) {
    stop();
    seekTo(0);
    const next: ClipIdentity = { sourceSha256: composition.sourceSha256, offsetMs: clipStartMs, durationMs: DURATION_MS };
    if (!sameClip(currentClip.current, next)) {
      currentClip.current = next;
      setMusicAnalysis(NO_ANALYSIS);
    }
    setComposition(current => ({ ...current, clipStartMs, cues: current.clipStartMs === clipStartMs ? current.cues : [] }));
    if (composition.clipStartMs !== clipStartMs) setLyricWords([]);
    // The audio output is unlocked here, inside the person's own gesture; the music itself starts after the pause.
    void (context.current ??= new AudioContext()).resume();
    audition.current = window.setTimeout(() => void playLatest.current(true), AUDITION_PAUSE_MS);
  }

  // The pause calls the newest `play`, which knows the clip that was just chosen.
  const playLatest = useRef(play);
  playLatest.current = play;

  function openCreatives(open: boolean) {
    stop();
    seekTo(0);
    setInCreatives(open);
  }

  const canContinue = valid && clipValid && genreValid && composition.cues.length > 0 && !lyricsState.busy && !lyricsState.dirty;
  const checkingPictures = cart.items.some(item => item.uploadId !== null) && (uploads.pending || (uploads.signedIn && uploads.list === null));
  const lines: CartLine[] = cart.items.map(item => ({
    item,
    title: `${SHELF_ROWS.find(row => row.id === item.row)?.title ?? ''} · ${item.uploadId === null ? item.slot.label : 'Your picture'}`,
    available: item.uploadId === null || checkingPictures
      || (uploads.list ?? []).some(candidate => candidate.id === item.uploadId && candidate.status === 'ready' && candidate.url),
  }));
  // Videos are made from the creatives page, which has the music analysis and the pictures; elsewhere the cart leads there.
  const cartAction: CartAction = (() => {
    if (!inCreatives) {
      if (canContinue) return { kind: 'go', run: () => { setCartOpen(false); openCreatives(true); } };
      return {
        kind: 'blocked',
        reason: !genreValid ? 'Choose your genre to reach your creatives.'
          : composition.cues.length === 0 ? 'Add and sync your lyrics to reach your creatives.'
          : 'Finish syncing your lyrics to reach your creatives.',
      };
    }
    if (profile?.musicAnalysis.status === 'pending' || profile?.lyricMeaning?.status === 'pending') {
      return { kind: 'blocked', reason: 'Finishing the analysis of your music and lyrics. Downloading is possible in a moment.' };
    }
    if (checkingPictures) return { kind: 'blocked', reason: 'Checking your pictures…' };
    return { kind: 'download', run: () => downloadRef.current?.() };
  })();

  return <>
    <header className="masthead"><img src="/brand/mumoo-logo.png" alt="mumoo" width="144" height="36" /><span>Creative Studio</span>
      {buffer && <button type="button" className="link-button" onClick={startOver}>Start over</button>}
      <div id="masthead-cart"><CartButton count={cart.items.length} progress={download.progress} onOpen={() => setCartOpen(true)} /></div>
      <Suspense fallback={null}><AccountBar /></Suspense></header>
    {cartOpen && <CartPanel lines={lines} progress={download.progress} action={cartAction} onClose={() => setCartOpen(false)} onRemove={cart.remove} />}
    {download.message && <DownloadNotice message={download.message} onDismiss={download.dismiss} />}
    {IS_ALIGNMENT_STAGING && !accessToken && <div className="staging-gate"><StagingAccess onAccess={setAccessToken} /></div>}
    {restoring ? <main className="desktop trim"><section><p role="status">Restoring your session…</p></section></main>
    : !inCreatives ? <main className="desktop trim">
      <section>
        <p className="eyebrow">0{step} / {step === 1 ? 'MUSIC' : 'YOUR CLIP'}</p>
        <h1>{step === 1 ? 'Upload your song' : 'Choose your 15 seconds'}</h1>
        {step === 1 && <><p className="intro">Upload your song and tell us its genre.</p>
        {restoreNote && <p role="alert">{restoreNote}</p>}
        <label>Song file ({ACCEPTED_LABEL})<input ref={fileInput} type="file" accept={ACCEPTED_AUDIO} onChange={event => void choose(event.target.files?.[0])} /></label>
        {loading && <p role="status">Opening your music…</p>}
        {buffer && songName && <p className="hint">Your song: {songName}</p>}
        {keepFailed && <p className="hint">This browser cannot keep your work between visits, so refreshing the page would start over.</p>}
        <label>Primary genre
          <input list="genre-options" value={genre} onChange={event => setGenre(event.target.value)} placeholder="Search genres" />
        </label>
        <datalist id="genre-options">{GENRES.map(item => <option key={item} value={item} />)}</datalist>
        <label>Secondary genre or influence <span className="hint">(optional)</span>
          <input maxLength={100} value={influence} onChange={event => setInfluence(event.target.value)} placeholder="Add an influence" />
        </label>
        {IS_ALIGNMENT_STAGING && accessToken && <p className="hint">Staging access enabled.</p>}
        {!loading && !buffer && <p className="hint">Choose a song at least 15 seconds long ({ACCEPTED_LABEL}) to continue.</p>}
        {genre.trim() && !selectedGenre && <p role="status">Choose a genre from the suggestions, or select “Other / Not sure”.</p>}
        {error && <p role="alert">{error}</p>}
        <button className="primary-accent" disabled={!buffer || !genreValid || loading || (IS_ALIGNMENT_STAGING && !accessToken)} onClick={() => setStep(2)}>Continue</button></>}
        {buffer && step === 2 && <>
          <Waveform audio={buffer} start={composition.clipStartMs} position={position} onSelect={selectClip} />
          {clipValid && <p className="clip-range">
            <strong>{clock(composition.clipStartMs)} – {clock(composition.clipStartMs + DURATION_MS)}</strong>
            <span>15 seconds of your {clock(buffer.duration * 1000)} song</span>
          </p>}
          {clipValid && <LyricsStudio key={composition.clipStartMs} audio={buffer} clipStartMs={composition.clipStartMs}
            token={accessToken} position={position} playing={playing}
            initial={lyricWords.length ? { words: lyricWords, ...lyricsInfo } : undefined}
            onPlay={() => playing ? stop() : void play(true)}
            onSeek={ms => { stop(); seekTo(ms); }}
            onLyrics={({ words, ...info }) => { setLyricsInfo(info); setLyricWords(words); setComposition(current => ({ ...current, cues: cuesOf(words) })); }}
            onState={setLyricsState} />}
          <div className="trim-actions step-actions">
            <button className="secondary" onClick={() => { stop(); setStep(1); }}>Back</button>
            <button className="primary-accent" disabled={!canContinue} onClick={() => openCreatives(true)}>Continue</button>
            {lyricsState.dirty && <span className="hint">Sync your edits first.</span>}
          </div>
        </>}
        {step === 2 && (error || (buffer && !clipValid)) && <p role="alert">{error || 'Choose a valid 15-second range inside the song.'}</p>}
      </section>
    </main> : profile && buffer && (
      <CreativesPackStudio
        profile={profile}
        composition={composition}
        audio={buffer}
        token={accessToken}
        position={position}
        getPosition={() => positionRef.current}
        playing={playing}
        playbackError={error}
        cart={cart}
        download={download}
        uploads={uploads}
        downloadRef={downloadRef}
        onPlay={() => void play()}
        onStop={stop}
        onBack={() => openCreatives(false)}
      />
    )}
    {buffer && clipValid && IS_ALIGNMENT_STAGING && (composition.cues.length > 0 || inCreatives) && <MusicAnalysisRunner key={composition.sourceSha256 + ':' + composition.clipStartMs}
      audio={buffer} clip={clip} analysis={analysisForClip(musicAnalysis, clip)} accessToken={accessToken} onChange={state => { if (acceptsAnalysis(currentClip.current, state)) setMusicAnalysis(state); }} />}

    <main className="mobile"><h1>Open MUMOO on desktop</h1><p>Use a desktop browser to time lyrics and preview your music visual.</p></main>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
