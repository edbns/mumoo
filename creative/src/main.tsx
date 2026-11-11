import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CrashGuard, reportUncaughtErrors } from './crash-guard';
import { Music2Icon } from 'lucide-react';
import { decodeAudio, hashAudio, probeDurationMs } from './audio';
import { ACCEPTED_AUDIO, ACCEPTED_LABEL, readSongCover, readSongTags, sniffAudioFormat, type SongTags } from './audio-format';
import { describeCover, type CoverRead } from './cover-palette';
import { DURATION_MS, validate, type Composition } from './composition';
import { findGenre, findSubGenre, GENRES, toOptions } from './genres';
import { NO_ANALYSIS, acceptsAnalysis, analysisForClip, sameClip, type ClipIdentity, type CreativeProfileV1, type MusicAnalysisState } from './creative-profile';
import { MusicAnalysisRunner } from './music-analysis-runner';
import { useLyricMeaning } from './lyric-meaning-cloud';
import { useSingerVoice } from './singer-voice-cloud';
import { CreativesPackStudio } from './creatives-pack-studio';
import { SHELF_ROWS } from './creatives-pack';
import { useCart, songKeyOf } from './cart';
import { CartButton, CartPanel, DownloadNotice, type CartAction, type CartLine } from './cart-panel';
import { useCartDownload } from './use-cart-download';
import { useUploads } from './use-uploads';
import { forgetSession } from './forget-session';
import type { LyricWord } from './lyrics-cloud';
import { StagingAccess } from './staging-access';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';
import { LyricsStudio } from './lyrics-studio';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { AnalyzingScreen, type PaintProgress } from './analyzing-screen';
import { StepNav, type StepNumber } from './step-nav';
import { ArrowLeftIcon } from 'lucide-react';
import type { AccountPage } from './account-pages';
import { ProfileNav, type ProfileTab } from './profile-nav';
import { ClipPicker } from './clip-picker';
import './styles/index.css';

// Sign-in pulls in the auth client; it loads beside the page instead of in front of it.
const AccountBar = lazy(() => import('./account').then(module => ({ default: module.AccountBar })));
const loadProfilePage = () => import('./profile-page');
const ProfilePage = lazy(loadProfilePage);

/** How long the window must rest before the music inside it plays. */
const AUDITION_PAUSE_MS = 200;
const INITIAL: Composition = { sourceSha256: '', clipStartMs: 0, cues: [] };


const GENRE_OPTIONS = toOptions(GENRES.map(group => group.name));
const cuesOf = (words: readonly LyricWord[]) => words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));

function App() {
  const [accessToken, setAccessToken] = useState('');
  const [inCreatives, setInCreatives] = useState(false);
  /** The page being shown: making creatives, or a page of the person's account (the work underneath is kept as it was). */
  const [page, setPage] = useState<AccountPage>('create');
  const [profileTab, setProfileTab] = useState<ProfileTab>('creatives');
  /** The creatives are shown only after the song is analysed and every poster is painted. */
  const [stage, setStage] = useState<'analyzing' | 'prepared' | 'revealed'>('analyzing');
  const [paint, setPaint] = useState<PaintProgress | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  // Nothing is kept between visits except the cart: a refresh starts over, so what an earlier version left in this browser goes.
  useEffect(() => { forgetSession(); }, []);
  // The account pages are fetched in the background, so opening one never waits on a blank moment.
  useEffect(() => { void loadProfilePage(); }, []);
  const [songName, setSongName] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const downloadRef = useRef<(() => void) | null>(null);
  const [genre, setGenre] = useState('');
  const [subGenre, setSubGenre] = useState('');
  const [loading, setLoading] = useState(false);
  const [composition, setComposition] = useState(INITIAL);
  const [musicAnalysis, setMusicAnalysis] = useState<MusicAnalysisState>(NO_ANALYSIS);
  const currentClip = useRef<ClipIdentity | null>(null);
  const selectedGenre = findGenre(genre);
  const selectedSubGenre = findSubGenre(selectedGenre, subGenre);
  const genreValid = Boolean(selectedSubGenre);
  const [songTags, setSongTags] = useState<SongTags>();
  const [songCover, setSongCover] = useState<CoverRead | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer>();
  const [lyricsState, setLyricsState] = useState({ busy: false, dirty: false });
  const [lyricsInfo, setLyricsInfo] = useState<{ language?: string; origin: 'transcribed' | 'typed' }>({ origin: 'transcribed' });
  /** The same words as `composition.cues`, with the line breaks and timing marks the lyrics editor needs to open on them again. */
  const [lyricWords, setLyricWords] = useState<LyricWord[]>([]);
  /** The creator said the song has no words (instrumental, or only sounds): nothing is transcribed or read. */
  const [noLyrics, setNoLyrics] = useState(false);
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
  // Who sings is heard once the window is settled (the same moment the music is read), and only ever refines the Doodle row.
  const singerVoice = useSingerVoice(accessToken, buffer, composition.clipStartMs, `${composition.sourceSha256}:${composition.clipStartMs}`,
    IS_ALIGNMENT_STAGING && clipValid && (composition.cues.length > 0 || noLyrics || inCreatives));
    const profile: CreativeProfileV1 | null = clipValid && genreValid ? {
    version: 1,
    clip,
    creator: {
      primaryGenre: { value: selectedGenre!.name, source: 'creator' },
      subGenre: { value: selectedSubGenre!, source: 'creator' },
      ...(songTags?.title && { title: { value: songTags.title, source: 'embedded_metadata' as const } }),
      ...(songTags?.artist && { artist: { value: songTags.artist, source: 'embedded_metadata' as const } }),
      ...(songCover && { cover: { value: songCover, source: 'embedded_metadata' as const } }),
      ...(singerVoice?.status === 'ready' && singerVoice.value && { voice: { value: singerVoice.value, source: 'detected' as const } }),
    },
    musicAnalysis: analysisForClip(musicAnalysis, clip),
    ...(lyricMeaning && { lyricMeaning }),
    ...(noLyrics && { noLyrics: true as const }),
    ...(inCreatives && !noLyrics && { approvedLyrics: { cues: composition.cues, source: 'creator_reviewed' as const, ...lyricsInfo } }),
  } : null;
  const analysisSettled = profile !== null && profile.musicAnalysis.status !== 'pending' && profile.lyricMeaning?.status !== 'pending';
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

  /** Opens the song the person just picked, or (with none) clears the page. */
  async function choose(file?: File) {
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
    setNoLyrics(false);
    setLoading(Boolean(file));
    seekTo(0);
    setError('');
    if (!file) {
      setMusicAnalysis(NO_ANALYSIS);
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
      if (request !== upload.current) return;
      const nextClip: ClipIdentity = { sourceSha256, offsetMs: 0, durationMs: DURATION_MS };
      const unchanged = sameClip(previousClip, nextClip);
      if (!unchanged) setMusicAnalysis(NO_ANALYSIS);
      setComposition(current => ({ ...current, sourceSha256, clipStartMs: 0, cues: unchanged ? current.cues : [] }));
      setLyricWords(current => unchanged ? current : []);
      currentClip.current = nextClip;
      setBuffer(audio);
      setSongTags(tags);
      setSongCover(cover);
    } catch (cause) {
      if (request === upload.current) {
        setMusicAnalysis(NO_ANALYSIS);
        setError((cause as Error).message);
      }
    } finally {
      if (request === upload.current) setLoading(false);
    }
  }

  /** A sub-genre belongs to one genre, so changing the genre clears it. */
  function chooseGenre(value: string) {
    if (findGenre(value)?.name !== selectedGenre?.name) setSubGenre('');
    setGenre(value);
  }

  /** The song has no words: any lyrics work (even a transcription in progress) is dropped. Turned off, the lyrics step starts again. */
  function chooseNoLyrics(on: boolean) {
    if (on) {
      stop();
      setLyricWords([]);
      setLyricsInfo({ origin: 'transcribed' });
      setComposition(current => ({ ...current, cues: [] }));
      setLyricsState({ busy: false, dirty: false });
    }
    setNoLyrics(on);
  }

  function startOver() {
    if (!window.confirm('Start over with another song? Your song, lyrics and pictures are cleared. Your cart is kept.')) return;
    void choose(undefined);
    void uploads.clear();
    setGenre('');
    setSubGenre('');
    setComposition(INITIAL);
    setLyricWords([]);
    setCartOpen(false);
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
    setStage('analyzing');
    setPaint(null);
    setInCreatives(open);
  }

  const currentStep: StepNumber = inCreatives ? (stage === 'revealed' ? 4 : 3) : step;
  /** The notch only goes back: each step before this one is already done. */
  function goToStep(target: StepNumber) {
    if (target >= currentStep) return;
    if (inCreatives) openCreatives(false); else stop();
    if (target === 1) setStep(1);
  }

  const canContinue = valid && clipValid && genreValid && (noLyrics || composition.cues.length > 0) && !lyricsState.busy && !lyricsState.dirty;
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
        reason: !genreValid ? 'Choose your genre and sub-genre to reach your creatives.'
          : !noLyrics && composition.cues.length === 0 ? 'Add and sync your lyrics, or say the song has no lyrics, to reach your creatives.'
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
    <header className="masthead">
      {page === 'create'
        ? <img className="masthead-logo" src="/brand/mumoo-logo.png" alt="MUMOO" />
        : <button type="button" className="masthead-logo" aria-label="Back to Create" onClick={() => setPage('create')}><img src="/brand/mumoo-logo.png" alt="" /></button>}
      {page === 'create' && <StepNav current={currentStep} onSelect={goToStep} />}
      {page === 'history' && <ProfileNav current={profileTab} onSelect={setProfileTab} />}
      <div className="masthead-actions">
        {page === 'create' && buffer && <button type="button" className="link-button" onClick={startOver}>Start over</button>}
        {page !== 'create' && <Button variant="secondary" onClick={() => setPage('create')}><ArrowLeftIcon aria-hidden="true" className="size-4" />Create</Button>}
        <CartButton count={cart.items.length} progress={download.progress} onOpen={() => setCartOpen(true)} />
        <Suspense fallback={null}><AccountBar page={page} onNavigate={setPage} /></Suspense>
      </div>
    </header>
    {cartOpen && <CartPanel lines={lines} progress={download.progress} action={cartAction} onClose={() => setCartOpen(false)} onRemove={cart.remove} />}
    {download.message && <DownloadNotice message={download.message} onDismiss={download.dismiss} />}
    {IS_ALIGNMENT_STAGING && !accessToken && <StagingAccess onAccess={setAccessToken} />}
    {page !== 'create' && <Suspense fallback={null}><ProfilePage page={page} tab={profileTab} /></Suspense>}
    {/* The work stays exactly as it was while a page of the account is open: hidden, but still laid out, so its drawings are not cleared and redrawn. */}
    <div className={page === 'create' ? 'contents' : 'invisible fixed inset-0 overflow-hidden'} inert={page !== 'create'}>
    {!inCreatives ? <main className={step === 1 ? 'desktop trim flex-1 grid-cols-[minmax(320px,900px)] content-center' : 'desktop trim'}>
      <section>
        <p className="eyebrow mb-6">0{step} / {step === 1 ? 'MUSIC' : 'YOUR CLIP'}</p>
        {step === 2 && <h1>Choose your 15 seconds</h1>}
        {step === 1 && <>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-background p-5">
            <FileDropzone accept={ACCEPTED_AUDIO} icon={Music2Icon} title="Drop your song here" hint={ACCEPTED_LABEL} buttonLabel="Select song" inputLabel="Song file" removeLabel="Remove song" fileName={songName || undefined}
              onSelect={file => void choose(file)} onRemove={() => void choose(undefined)} />
            {!loading && !buffer && <p className="hint">Choose a song at least 15 seconds long ({ACCEPTED_LABEL}) to continue.</p>}
          </div>
          <div className="flex flex-col gap-5 rounded-[var(--radius-panel)] bg-background p-5">
            <Combobox label="Genre" placeholder="Search genres" options={GENRE_OPTIONS} value={genre} onValueChange={chooseGenre} />
            <Combobox label="Sub-genre" placeholder={selectedGenre ? 'Search sub-genres' : 'Choose a genre first'} disabled={!selectedGenre}
              options={toOptions(selectedGenre?.subGenres ?? [])} value={subGenre} onValueChange={setSubGenre} />
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="mt-6 flex justify-end">
          <Button disabled={!buffer || !genreValid || loading} onClick={() => setStep(2)}>Continue</Button>
        </div></>}
        {buffer && step === 2 && <>
          <ClipPicker audio={buffer} start={composition.clipStartMs} valid={clipValid} position={position}
            playing={playing} onPlay={() => playing ? stop() : void play(true)} onSelect={selectClip} />
          {clipValid && noLyrics && <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] bg-background p-5">
            <p className="m-0 flex-1">Changed your mind?</p>
            <Button variant="secondary" onClick={() => chooseNoLyrics(false)}>Add lyrics instead</Button>
          </div>}
          {clipValid && !noLyrics && <LyricsStudio key={composition.clipStartMs} audio={buffer} clipStartMs={composition.clipStartMs}
            token={accessToken} position={position} playing={playing}
            initial={lyricWords.length ? { words: lyricWords, ...lyricsInfo } : undefined}
            onPlay={() => playing ? stop() : void play(true)}
            onSeek={ms => { stop(); seekTo(ms); }}
            onLyrics={({ words, ...info }) => { setLyricsInfo(info); setLyricWords(words); setComposition(current => ({ ...current, cues: cuesOf(words) })); }}
            onState={setLyricsState} />}
          <div className="step-actions mt-6 flex items-center gap-3">
            <Button variant="secondary" onClick={() => { stop(); setStep(1); }}>Back</Button>
            {lyricsState.dirty && <span className="hint">Sync your edits first.</span>}
            {!noLyrics && <Button variant="secondary" className="ml-auto" onClick={() => chooseNoLyrics(true)}>My song has no lyrics</Button>}
            <Button className={noLyrics ? 'ml-auto' : undefined} disabled={!canContinue} onClick={() => openCreatives(true)}>Continue</Button>
          </div>
        </>}
        {step === 2 && (error || (buffer && !clipValid)) && <p role="alert">{error || 'Choose a valid 15-second range inside the song.'}</p>}
      </section>
    </main> : profile && buffer && (
      <div className="relative flex flex-1 flex-col">
        {stage !== 'revealed' && <AnalyzingScreen profile={profile} progress={paint} ready={stage === 'prepared'} onDone={() => setStage('revealed')} />}
        {/* The posters are painted from the final analysis, so the studio starts only once the song has been read. It stays out of sight until they are done. */}
        {analysisSettled && (
          <div className={stage === 'revealed' ? 'contents' : 'invisible absolute inset-0 overflow-hidden'} inert={stage !== 'revealed'}>
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
              onProgress={(done, total) => {
                setPaint({ done, total });
                if (done === total) setStage(current => (current === 'analyzing' ? 'prepared' : current));
              }}
            />
          </div>
        )}
      </div>
    )}
    </div>
    {buffer && clipValid && IS_ALIGNMENT_STAGING && (composition.cues.length > 0 || noLyrics || inCreatives) && <MusicAnalysisRunner key={composition.sourceSha256 + ':' + composition.clipStartMs}
      audio={buffer} clip={clip} analysis={analysisForClip(musicAnalysis, clip)} accessToken={accessToken} onChange={state => { if (acceptsAnalysis(currentClip.current, state)) setMusicAnalysis(state); }} />}

    <main className="mobile"><h1>Open MUMOO on desktop</h1><p>Use a desktop browser to time lyrics and preview your music visual.</p></main>
  </>;
}

reportUncaughtErrors();
createRoot(document.getElementById('root')!).render(<CrashGuard><App /></CrashGuard>);
