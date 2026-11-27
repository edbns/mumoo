import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CrashGuard, holdWork, reportUncaughtErrors } from './crash-guard';
import { Music2Icon } from '@/components/icons';
import { decodeAudio, hashAudio, probeDurationMs } from './audio';
import { ACCEPTED_AUDIO, ACCEPTED_LABEL, readSongCover, readSongTags, sniffAudioFormat, type SongTags } from './audio-format';
import { describeCover, type CoverRead } from './cover-palette';
import { FULL_CLIP_MS, MIN_SONG_MS, chosenClipMs, clipLengthMs, fitClipMs, validate, type Composition } from './composition';
import type { StyleMatch } from './style-search';
import { PhoneUpload } from './phone-upload';
import { NO_ANALYSIS, acceptsAnalysis, analysisForClip, sameClip, type ClipIdentity, type CreativeProfileV1, type MusicAnalysisState } from './creative-profile';
import { MusicAnalysisRunner } from './music-analysis-runner';
import { StylePrintRunner, useClipTempo, useStyleGuess } from './style-print-runner';
import { useLyricMeaning } from './lyric-meaning-cloud';
import { SHELF_ROWS } from './creatives-pack';
import { ownIdsOf, useCart, songKeyOf } from './cart';
import { CartPanel, ChooseFewer, ChosenBar, DownloadNotice, type CartAction, type CartLine, type ChosenLimit } from './cart-panel';
import { CREDITS_BOUGHT, TOO_MANY_CHOSEN, askToBuyCredits, type TooMany } from './credit-events';
import { handOverCheckout } from './purchase-credits';
import { useCartDownload } from './use-cart-download';
import { useUploads } from './use-uploads';
import { forgetSession } from './forget-session';
import { takeHandedSong, type HandedSong } from './song-handoff';
import type { LyricWord } from './lyrics-cloud';
import { StagingAccess } from './staging-access';
import { IS_ALIGNMENT_STAGING } from './staging-alignment';
import { LyricsStudio } from './lyrics-studio';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { AnalyzingScreen, type PaintProgress } from './analyzing-screen';
import { StepNav, type StepNumber } from './step-nav';
import { ArrowLeftIcon, CheckIcon, Link2Icon, RotateCcwIcon, XIcon } from '@/components/icons';
import { AccountPlaceholder, askSignIn } from './account-hint';
import { PAGE_PATHS, PAGE_TITLES, UPLOADS_PATH, pageAt, uploadsAt, type AccountPage } from './account-pages';
import { LinksNav, ProfileNav, type ProfileTab } from './profile-nav';
import { ClipPicker } from './clip-picker';
import { LegalCorner } from './legal-corner';
import { keepReferral } from './referral';
import { arrive } from './site-paths';
import { LinksSkeleton } from './links-skeleton';
import { useFreeVideo } from './use-free-video';
import { friendlyError } from './friendly-error';
import './styles/index.css';

// Sign-in pulls in the auth client; it loads beside the page instead of in front of it.
const DOWNLOAD_SIGN_IN = { title: 'Sign in to export', lead: 'Your first video is free—no watermark, saved straight to your Media.' };
const AccountBar = lazy(() => import('./account').then(module => ({ default: module.AccountBar })));
const loadProfilePage = () => import('./profile-page');
const ProfilePage = lazy(loadProfilePage);
// The shelf draws with Pixi, the largest code on the site: it is fetched once a song is in, while it is read, not with the first page.
const loadStudio = () => import('./creatives-pack-studio');
const CreativesPackStudio = lazy(() => loadStudio().then(module => ({ default: module.CreativesPackStudio })));

/** How long the window must rest before the music inside it plays. */
const AUDITION_PAUSE_MS = 200;
const INITIAL: Composition = { sourceSha256: '', clipStartMs: 0, cues: [] };

const styleOption = ({ label, family }: StyleMatch): ComboboxOption => ({ value: label, label, group: family });
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const cuesOf = (words: readonly LyricWord[]) => words.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));

function App() {
  const [accessToken, setAccessToken] = useState('');
  const [inCreatives, setInCreatives] = useState(false);
  /** The page being shown: making creatives, or a page of the person's account (the work underneath is kept as it was). */
  const [page, setPage] = useState<AccountPage>(() => pageAt(location.pathname));
  const [profileTab, setProfileTab] = useState<ProfileTab>(() => (uploadsAt(location.pathname) ? 'uploads' : 'creatives'));
  /** The address the page opened with keeps its query (a sign-in or checkout coming back reads it); a page moved to has none of another's (My Smart Links' ?link=). */
  const opened = useRef(true);
  useEffect(() => {
    const path = page === 'history' && profileTab === 'uploads' ? UPLOADS_PATH : PAGE_PATHS[page] ?? '/';
    if (location.pathname !== path) history.replaceState(history.state, '', opened.current ? path + location.search + location.hash : path);
    opened.current = false;
    document.title = page === 'history' && profileTab === 'uploads' ? 'Your uploads · mumoo' : PAGE_TITLES[page];
  }, [page, profileTab]);
  /** Pressing Create Smart Link opens the editor anew, so an edit in progress gives way to the new-link draft. */
  const [linksOpened, setLinksOpened] = useState(0);
  /** The creatives are shown only after the song is analysed and every poster is painted. */
  const [stage, setStage] = useState<'analyzing' | 'prepared' | 'revealed'>('analyzing');
  const [paint, setPaint] = useState<PaintProgress | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  // A new page, step or tab starts at its top, where its news is (a render in progress shows first in the media); coming back to
  // the work returns to where the person was in it.
  const workScroll = useRef(0);
  const pageNow = useRef(page);
  pageNow.current = page;
  useEffect(() => {
    if (page !== 'create') return;
    // Leaving shrinks the page, and the browser's scroll back up must not be kept.
    const keep = () => { if (pageNow.current === 'create') workScroll.current = window.scrollY; };
    window.addEventListener('scroll', keep, { passive: true });
    return () => window.removeEventListener('scroll', keep);
  }, [page]);
  useEffect(() => { workScroll.current = 0; window.scrollTo({ top: 0 }); }, [profileTab, step, inCreatives]);
  useEffect(() => { window.scrollTo({ top: page === 'create' ? workScroll.current : 0 }); }, [page]);
  // Nothing is kept between visits except the cart: a refresh starts over, so what an earlier version left in this browser goes.
  useEffect(() => { forgetSession(); }, []);
  // Every part the work needs later is fetched in the background as the page opens. After a deploy the files of the version this tab
  // runs are gone, so a part first asked for then could not load, and the song open in the tab would be lost.
  useEffect(() => {
    void loadProfilePage();
    const warm = () => {
      void loadStudio().catch(() => undefined);
      void import('fflate').catch(() => undefined);
      void import('./ad-fonts').then(fonts => fonts.warmFontFiles()).catch(() => undefined);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 });
    else setTimeout(warm, 1500);
  }, []);
  const [songName, setSongName] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [tooMany, setTooMany] = useState<TooMany | null>(null);
  const [chosenLimit, setChosenLimit] = useState<ChosenLimit | null>(null);
  useEffect(() => {
    const ask = (event: Event) => setTooMany((event as CustomEvent<TooMany>).detail);
    window.addEventListener(TOO_MANY_CHOSEN, ask);
    return () => window.removeEventListener(TOO_MANY_CHOSEN, ask);
  }, []);
  // The limit holds while the chosen videos page is open; pressing Make again asks again.
  useEffect(() => { if (!cartOpen) setChosenLimit(null); }, [cartOpen]);
  // The chosen videos page covers the shelf: the card playing there stops with its sound.
  useEffect(() => { if (cartOpen) stop(); }, [cartOpen]);
  const [askingStartOver, setAskingStartOver] = useState(false);
  const downloadRef = useRef<(() => Promise<boolean>) | null>(null);
  /** The person's Media, where the videos show up and their progress shows as they are made. */
  const toMedia = () => { setCartOpen(false); setProfileTab('creatives'); setPage('history'); };
  // Paid for the videos a download was short of: they start straight away, in the person's Media.
  useEffect(() => {
    const resume = () => { toMedia(); void downloadRef.current?.(); };
    window.addEventListener(CREDITS_BOUGHT, resume);
    return () => window.removeEventListener(CREDITS_BOUGHT, resume);
  }, []);
  /** What kind of music it is: a style of the directory by the name it was picked as, or (`genreUnknown`) the creator does not know. */
  const [picked, setPicked] = useState<StyleMatch | null>(null);
  const style = picked?.style;
  const [genreUnknown, setGenreUnknown] = useState(false);
  // The directory is large: it loads beside the page, and the box searches once it is here.
  const [searchStyles, setSearchStyles] = useState<((typed: string) => StyleMatch[]) | null>(null);
  useEffect(() => { void import('./style-search').then(module => setSearchStyles(() => module.searchStyleFamilies)); }, []);
  const found = useRef<StyleMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [composition, setComposition] = useState(INITIAL);
  const [musicAnalysis, setMusicAnalysis] = useState<MusicAnalysisState>(NO_ANALYSIS);
  const currentClip = useRef<ClipIdentity | null>(null);
  const genreValid = Boolean(picked) || genreUnknown;
  const [songTags, setSongTags] = useState<SongTags>();
  /** The song a smart link handed over ("Make my first video free"), until the creator dismisses it. */
  const [handed, setHanded] = useState<HandedSong | null>(null);
  /** Until it is made, the first Continue says the video is free, without advertising it anywhere else. */
  const freeVideo = useFreeVideo() === true;
  useEffect(() => {
    if (page !== 'create') return;
    const song = takeHandedSong();
    if (song) setHanded(song);
  }, [page]);
  const [songCover, setSongCover] = useState<CoverRead | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer>();
  useEffect(() => { holdWork(Boolean(buffer)); }, [buffer]);
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

  const clipMs = buffer ? chosenClipMs(composition, buffer.duration * 1000) : FULL_CLIP_MS;
  const clipValid = Boolean(buffer && buffer.duration * 1000 >= MIN_SONG_MS && clipMs === fitClipMs(clipMs, buffer.duration * 1000) && Number.isSafeInteger(composition.clipStartMs) &&
    composition.clipStartMs >= 0 && composition.clipStartMs <= buffer.duration * 1000 - clipMs);
  const clip: ClipIdentity = { sourceSha256: composition.sourceSha256, offsetMs: composition.clipStartMs, durationMs: clipMs };
  // The cart belongs to the song and clip being worked on, and is the same on every page.
  const cart = useCart(clipValid ? songKeyOf(composition.sourceSha256, composition.clipStartMs, clipMs) : '');
  /** Cart items whose library pictures were removed, as the creatives page last found them (comma-separated ids). */
  const [goneFromLibrary, setGoneFromLibrary] = useState('');
  const uploads = useUploads();
  const [delivered, setDelivered] = useState(0);
  const download = useCartDownload({ token: accessToken, cart, onDelivered: () => { setCartOpen(false); setDelivered(count => count + 1); } });
  // However videos start while the chosen videos page is open, the person watches them being made in Media, not there.
  const making = download.progress !== null;
  useEffect(() => { if (making && cartOpen) toMedia(); }, [making, cartOpen]);
  // The words are read the moment they are final (synced and not being edited), so the answer is ready by the creatives screen.
  const lyricMeaning = useLyricMeaning(accessToken, composition.cues, lyricsInfo.language,
    IS_ALIGNMENT_STAGING && clipValid && !lyricsState.busy && !lyricsState.dirty);
  // Once the window is settled the brain listens: "I don't know" gets its guess, and a picked style is checked against how it sounds.
  const [styleGuess, answerGuess] = useStyleGuess(accessToken, buffer, clip,
    IS_ALIGNMENT_STAGING && (genreUnknown || Boolean(style)) && clipValid && (composition.cues.length > 0 || noLyrics || inCreatives), style);
  const clipAnalysis = analysisForClip(musicAnalysis, clip);
  useClipTempo(IS_ALIGNMENT_STAGING && clipValid ? accessToken : '', clip, clipAnalysis.status === 'ready' ? clipAnalysis.result : null);
  const guessTaken = styleGuess.status === 'answered' && styleGuess.answer === 'yes';
  const known = guessTaken ? { style: styleGuess.style, label: capitalised(styleGuess.style.name), source: style ? 'corrected' as const : 'confirmed' as const }
    : style ? { style, label: picked!.label, source: 'creator' as const }
    : null;
    const profile: CreativeProfileV1 | null = clipValid && genreValid ? {
    version: 1,
    clip,
    creator: {
      // Not known: no genre, and the brain goes by the sound and the words.
      primaryGenre: { value: known?.style.genre ?? '', source: known?.source ?? 'creator' },
      ...(known && { subGenre: { value: known.style.subGenre, source: known.source }, style: { value: known.label, name: known.style.name, source: known.source } }),
      ...(songTags?.title ? { title: { value: songTags.title, source: 'embedded_metadata' as const } }
        : handed?.title ? { title: { value: handed.title, source: 'creator' as const } } : {}),
      ...(songTags?.artist ? { artist: { value: songTags.artist, source: 'embedded_metadata' as const } }
        : handed?.artist ? { artist: { value: handed.artist, source: 'creator' as const } } : {}),
      ...(songCover && { cover: { value: songCover, source: 'embedded_metadata' as const } }),
    },
    musicAnalysis: analysisForClip(musicAnalysis, clip),
    ...(lyricMeaning && { lyricMeaning }),
    ...(noLyrics && { noLyrics: true as const }),
    ...(inCreatives && !noLyrics && { approvedLyrics: { cues: composition.cues, source: 'creator_reviewed' as const, ...lyricsInfo } }),
  } : null;
  // A guess still being made or asked holds the posters too: a yes changes the genre they are painted for.
  const analysisSettled = profile !== null && profile.musicAnalysis.status !== 'pending' && profile.lyricMeaning?.status !== 'pending'
    && styleGuess.status !== 'listening' && styleGuess.status !== 'asking';
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
    cart.clearAll();
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
      const [probedMs, bytes] = await Promise.all([probeDurationMs(file), file.arrayBuffer()]);
      // Everything read from the original bytes starts before decoding detaches the buffer: the hash and the cover copy them as they start.
      const format = sniffAudioFormat(bytes);
      const tags = readSongTags(bytes, format);
      const [sourceSha256, cover, audio] = await Promise.all([
        hashAudio(bytes), describeCover(readSongCover(bytes, format)), decodeAudio(bytes, probedMs),
      ]);
      validate({ ...INITIAL, sourceSha256 }, audio.duration * 1000);
      if (request !== upload.current) return;
      const nextClip: ClipIdentity = { sourceSha256, offsetMs: 0, durationMs: clipLengthMs(audio.duration * 1000) };
      const unchanged = sameClip(previousClip, nextClip);
      if (!unchanged) setMusicAnalysis(NO_ANALYSIS);
      setComposition(current => ({ ...current, sourceSha256, clipStartMs: 0, clipMs: undefined, cues: unchanged ? current.cues : [] }));
      setLyricWords(current => unchanged ? current : []);
      currentClip.current = nextClip;
      setBuffer(audio);
      void loadStudio().catch(() => undefined);
      setSongTags(tags);
      setSongCover(cover);
    } catch (cause) {
      if (request === upload.current) {
        setMusicAnalysis(NO_ANALYSIS);
        setError(friendlyError(cause, 'That song couldn’t be opened. Try an MP3, WAV or M4A file.'));
      }
    } finally {
      if (request === upload.current) setLoading(false);
    }
  }

  /** The style picked from what the search last found (an empty value clears it). */
  function chooseStyle(value: string) {
    setPicked(found.current.find(match => match.label === value) ?? null);
  }

  function searchOptions(typed: string): ComboboxOption[] {
    found.current = searchStyles?.(typed) ?? [];
    return found.current.map(styleOption);
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
    void choose(undefined);
    uploads.clear();
    setPicked(null);
    setGenreUnknown(false);
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
      const from = fromStart || position >= clipMs ? 0 : position;
      const start = audio.currentTime;
      node.start(start, (composition.clipStartMs + from) / 1000, (clipMs - from) / 1000);
      source.current = node;
      setPlaying(true);
      function tick() {
        const next = Math.min(clipMs, from + (audio.currentTime - start) * 1000);
        // Always advance the live playhead; throttle React seek-bar updates so canvas
        // studios can paint on audio time without waiting on heavy re-renders.
        const now = performance.now();
        seekTo(next, next >= clipMs || now - positionUiAt.current >= 50);
        if (next < clipMs) animation.current = requestAnimationFrame(tick);
        else {
          source.current = null;
          setPlaying(false);
        }
      }
      tick();
    } catch (cause) {
      setError(friendlyError(cause, 'Playback couldn’t start. Press play again.'));
    }
  }

  function selectClip(clipStartMs: number, length = clipMs) {
    stop();
    seekTo(0);
    const next: ClipIdentity = { sourceSha256: composition.sourceSha256, offsetMs: clipStartMs, durationMs: length };
    if (!sameClip(currentClip.current, next)) {
      currentClip.current = next;
      setMusicAnalysis(NO_ANALYSIS);
    }
    const moved = composition.clipStartMs !== clipStartMs || clipMs !== length;
    setComposition(current => ({ ...current, clipStartMs, clipMs: length, cues: moved ? [] : current.cues }));
    if (moved) setLyricWords([]);
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
  const checkingPictures = cart.items.some(item => ownIdsOf(item).length > 0) && (uploads.pending || (uploads.signedIn && uploads.list === null));
  const gone = new Set(goneFromLibrary.split(',').filter(Boolean));
  const lines: CartLine[] = cart.items.map(item => {
    const own = ownIdsOf(item);
    return {
      item,
      title: `${SHELF_ROWS.find(row => row.id === item.row)?.title ?? ''} · ${!own.length ? item.slot.label : own.length > 1 ? 'Your pictures' : 'Your picture'}`,
      // Every one of its own pictures must still be there: the cloud is not given a reel with one missing.
      available: own.length ? checkingPictures || own.every(id => (uploads.list ?? []).some(candidate => candidate.id === id && candidate.status === 'ready' && candidate.url))
        : !gone.has(item.id),
    };
  });
  // Videos are made from the creatives page, which has the music analysis and the pictures; elsewhere the chosen videos page leads there.
  const cartAction: CartAction = (() => {
    if (!inCreatives) {
      if (canContinue) return { kind: 'go', run: () => { setCartOpen(false); openCreatives(true); } };
      // The chosen videos outlive a refresh, the song's details do not: they are made from the creatives, which need the song finished first.
      const backTo = (target: 1 | 2) => () => { setCartOpen(false); setPage('create'); stop(); setStep(target); };
      return !genreValid
        ? { kind: 'blocked', reason: 'Pick your track’s vibe first so we can cut to the mood.', fix: { label: 'Set vibe', run: backTo(1) } }
        : !noLyrics && composition.cues.length === 0
          ? { kind: 'blocked', reason: 'Add and sync your lyrics, or mark this track as instrumental.', fix: { label: 'Add lyrics', run: backTo(2) } }
          : { kind: 'blocked', reason: 'Finish syncing your lyrics first.', fix: { label: 'Finish your lyrics', run: backTo(2) } };
    }
    if (profile?.musicAnalysis.status === 'pending' || profile?.lyricMeaning?.status === 'pending') {
      return { kind: 'blocked', reason: 'Wrapping up track analysis. Your videos will be ready in a second.' };
    }
    if (checkingPictures) return { kind: 'blocked', reason: 'Prepping your visuals…' };
    // Making videos needs an account (the free first video is theirs, and it is kept in Media): signed out, it asks first and then carries on.
    // Pressing Create takes the person to their Media at once, where the videos show up as they are made; nothing downloads by itself.
    // Too few credits: the popup that asks opens over Media, and choosing fewer opens the chosen videos page again.
    if (uploads.pending) return { kind: 'blocked', reason: 'Checking credits…' };
    if (!uploads.signedIn) return { kind: 'download', run: () => {
      void askSignIn(DOWNLOAD_SIGN_IN).then(signedIn => { if (signedIn) { toMedia(); void downloadRef.current?.(); } });
    } };
    return { kind: 'download', run: () => { toMedia(); void downloadRef.current?.(); } };
  })();

  return <>
    <header className="masthead">
      {page === 'create'
        ? <img className="masthead-logo" src="/brand/mumoo-logo.png" alt="mumoo" />
        : <button type="button" className="masthead-logo" aria-label="Back to Create" onClick={() => setPage('create')}><img src="/brand/mumoo-logo.png" alt="" /></button>}
      {page === 'create' && <StepNav current={currentStep} onSelect={goToStep} />}
      {page === 'history' && <ProfileNav current={profileTab} onSelect={setProfileTab} />}
      {(page === 'links' || page === 'my-links') && <LinksNav current={page} onSelect={tab => { if (tab === 'links') setLinksOpened(count => count + 1); setPage(tab); }} />}
      <div className="masthead-actions">
        {page === 'create' && buffer && <Button variant="secondary" onClick={() => setAskingStartOver(true)}><RotateCcwIcon aria-hidden="true" className="size-4" />Start over</Button>}
        {page === 'create' && <Button variant="secondary" onClick={() => setPage('links')}><Link2Icon aria-hidden="true" className="size-4" />Free Smart Links</Button>}
        {page !== 'create' && <Button variant="secondary" onClick={() => setPage('create')}><ArrowLeftIcon aria-hidden="true" className="size-4" />Create</Button>}
        <Suspense fallback={<AccountPlaceholder />}><AccountBar page={page} onNavigate={setPage} /></Suspense>
      </div>
    </header>
    <ActionDialog open={askingStartOver} onClose={() => setAskingStartOver(false)} title="Start over with another song?"
      description="Your song, lyrics and chosen videos get cleared. Your uploads stay in Media."
      cancelLabel="Keep this song" confirmLabel="Start over" onConfirm={async () => startOver()} />
    {/* A guess is asked wherever the creator is when it arrives, until the creatives are shown; closing it is "not sure". */}
    <Modal open={page === 'create' && styleGuess.status === 'asking' && stage !== 'revealed' && !style} onClose={() => answerGuess('unsure')}
      title={styleGuess.status === 'asking' ? <>Sounds like {capitalised(styleGuess.style.name)}</> : ''}
      closeLabel="Maybe">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => answerGuess('unsure')}>Maybe</Button>
        <Button variant="secondary" onClick={() => answerGuess('no')}>No</Button>
        <Button onClick={() => answerGuess('yes')}>Yes</Button>
      </div>
    </Modal>
    {/* A check of the creator's own pick is asked on the analysis page, before anything is painted for the wrong genre; closing it keeps the pick. */}
    <Modal open={page === 'create' && styleGuess.status === 'asking' && inCreatives && stage !== 'revealed' && Boolean(style)} onClose={() => answerGuess('unsure')}
      title={styleGuess.status === 'asking' ? <>Sounds more like {capitalised(styleGuess.style.name)}</> : ''}
      description={`You picked ${picked?.label ?? ''}. Your videos are tailored to the genre, so it’s worth getting right.`}
      closeLabel={`Keep ${picked?.label ?? ''}`}>
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => answerGuess('no')}>Keep {picked?.label}</Button>
        <Button onClick={() => answerGuess('yes')}>Switch to {styleGuess.status === 'asking' ? capitalised(styleGuess.style.name) : ''}</Button>
      </div>
    </Modal>
    {!cartOpen && <ChosenBar count={cart.items.length} progress={download.progress} onOpen={() => setCartOpen(true)}
      onClear={page === 'create' && inCreatives && stage === 'revealed' ? cart.clear : undefined} onCancel={download.cancel} />}
    {cartOpen && <CartPanel lines={lines} progress={download.progress} action={cartAction} limit={chosenLimit} onClose={() => setCartOpen(false)} onRemove={cart.remove} />}
    <ChooseFewer tooMany={tooMany} onClose={() => setTooMany(null)}
      onBuy={() => { if (tooMany) askToBuyCredits(tooMany); setTooMany(null); }}
      onFewer={() => { if (tooMany) setChosenLimit({ have: tooMany.have, free: tooMany.free }); setTooMany(null); setCartOpen(true); }} />
    {download.message && <DownloadNotice message={download.message} onDismiss={download.dismiss} />}
    {IS_ALIGNMENT_STAGING && !accessToken && <StagingAccess onAccess={setAccessToken} />}
    {page !== 'create' && <Suspense fallback={page === 'links' ? <LinksSkeleton /> : null}><ProfilePage key={page === 'links' ? `links-${linksOpened}` : page} page={page} tab={profileTab} delivered={delivered} onNavigate={setPage} /></Suspense>}
    {/* The work stays exactly as it was while a page of the account is open: hidden, but still laid out, so its drawings are not cleared and redrawn. */}
    <div className={page === 'create' ? 'contents' : 'invisible fixed inset-0 overflow-hidden'} inert={page !== 'create'}>
    {!inCreatives ? <main className={step === 1 ? 'desktop trim flex-1 grid-cols-[minmax(320px,900px)] content-center py-8' : 'desktop trim'}>
      <section>
        <p className="eyebrow mb-6">0{step} / {step === 1 ? 'MUSIC' : 'YOUR CLIP'}</p>
        {step === 2 && <h1>{clipMs < FULL_CLIP_MS ? 'Your clip' : 'Pick your clip'}</h1>}
        {step === 1 && <>
        <div className="grid items-start gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-[var(--radius-panel)] bg-background p-5">
            {handed && !buffer && <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-card p-3">
              {handed.cover ? <img src={handed.cover} alt="" className="size-11 shrink-0 rounded-[6px] object-cover" /> : <span className="size-11 shrink-0 rounded-[6px] bg-muted" />}
              <p className="m-0 min-w-0 flex-1 text-sm">
                <span className="block truncate font-semibold">{handed.title}{handed.artist ? ` · ${handed.artist}` : ''}</span>
                <span className="block text-muted-foreground">Drop the song file to start.{freeVideo && ' Your first video is free.'}</span>
              </p>
              <button type="button" aria-label="Not this song" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setHanded(null)}><XIcon aria-hidden="true" className="size-4" /></button>
            </div>}
            <FileDropzone accept={ACCEPTED_AUDIO} icon={Music2Icon} title="Drop your song here" hint={ACCEPTED_LABEL} buttonLabel="Select song" inputLabel="Song file" removeLabel="Remove song" fileName={songName || undefined}
              onSelect={file => void choose(file)} onRemove={() => void choose(undefined)} />
            {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
            {!loading && !buffer && <p className="hint">Needs to be at least 10 seconds. No song file? A video with the song playing works too (saved TikTok/Reel, screen recording, voice memo).</p>}
            {IS_ALIGNMENT_STAGING && !loading && !buffer && <PhoneUpload token={accessToken} kind="song" onFiles={([file]) => void choose(file)} />}
          </div>
          <div className="flex flex-col gap-5 rounded-[var(--radius-panel)] bg-background p-5">
            <Combobox label="What kind of music is it?" placeholder={genreUnknown ? 'Not sure' : 'Type a style: afrobeats, slap house, drill…'}
              disabled={genreUnknown} search={searchOptions} emptyMessage={searchStyles ? 'Type a style, or just say you don’t know.' : 'Loading styles…'}
              options={picked ? [styleOption(picked)] : []} value={picked?.label ?? ''} onValueChange={chooseStyle} />
            <Button variant={genreUnknown ? 'default' : 'secondary'} aria-pressed={genreUnknown} className="h-[var(--control-height-md)] w-full"
              onClick={() => { setGenreUnknown(unknown => !unknown); setPicked(null); }}>
              {genreUnknown && <CheckIcon aria-hidden />}I don’t know
            </Button>
            {genreUnknown && <p className="hint m-0">We’ll go by the sound and the lyrics.</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button disabled={!buffer || !genreValid || loading} onClick={() => setStep(2)}>{freeVideo ? 'Get my free video' : 'Continue'}</Button>
        </div></>}
        {buffer && step === 2 && <>
          <ClipPicker audio={buffer} start={composition.clipStartMs} clipMs={clipMs} valid={clipValid} position={position}
            playing={playing} onPlay={() => playing ? stop() : void play(true)} onSelect={selectClip} />
          {clipValid && noLyrics && <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] bg-background p-5">
            <p className="m-0 flex-1">Changed your mind?</p>
            <Button variant="secondary" onClick={() => chooseNoLyrics(false)}>Add lyrics instead</Button>
          </div>}
          {clipValid && !noLyrics && <LyricsStudio key={`${composition.clipStartMs}:${clipMs}`} audio={buffer} clipStartMs={composition.clipStartMs} clipMs={clipMs}
            token={accessToken} position={position} playing={playing}
            initial={lyricWords.length ? { words: lyricWords, ...lyricsInfo } : undefined}
            onPlay={() => playing ? stop() : void play(true)}
            onSeek={ms => { stop(); seekTo(ms); }}
            onLyrics={({ words, ...info }) => { setLyricsInfo(info); setLyricWords(words); setComposition(current => ({ ...current, cues: cuesOf(words) })); }}
            onState={setLyricsState} />}
          <div className="step-actions mt-6 flex items-center gap-3">
            <Button variant="secondary" onClick={() => { stop(); setStep(1); }}>Back</Button>
            {lyricsState.dirty && <span className="hint">Sync your edits first.</span>}
            {!noLyrics && <Button variant="secondary" className="ml-auto" onClick={() => chooseNoLyrics(true)}>My song has no lyrics (Instrumental)</Button>}
            <Button className={noLyrics ? 'ml-auto' : undefined} disabled={!canContinue} onClick={() => openCreatives(true)}>Continue</Button>
          </div>
        </>}
        {step === 2 && (error || (buffer && !clipValid)) && <p role="alert">{error || 'Pick a valid range inside the song.'}</p>}
      </section>
    </main> : profile && buffer && (
      <div className="relative flex flex-1 flex-col">
        {stage !== 'revealed' && <AnalyzingScreen profile={profile} progress={paint} ready={stage === 'prepared'} onDone={() => setStage('revealed')} />}
        {/* The posters are painted from the final analysis, so the studio starts only once the song has been read. It stays out of sight until they are done. */}
        {analysisSettled && (
          <div className={stage === 'revealed' ? 'contents' : 'invisible absolute inset-0 overflow-hidden'} inert={stage !== 'revealed'}>
            <Suspense fallback={null}><CreativesPackStudio
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
              onGone={setGoneFromLibrary}
              onPlay={() => void play(true)}
              onStop={stop}
              onBack={() => openCreatives(false)}
              onProgress={(done, total) => {
                setPaint({ done, total });
                if (done === total) setStage(current => (current === 'analyzing' ? 'prepared' : current));
              }}
            /></Suspense>
          </div>
        )}
      </div>
    )}
    </div>
    {buffer && clipValid && IS_ALIGNMENT_STAGING && (composition.cues.length > 0 || noLyrics || inCreatives) && <MusicAnalysisRunner key={`${composition.sourceSha256}:${composition.clipStartMs}:${clipMs}`}
      audio={buffer} clip={clip} analysis={analysisForClip(musicAnalysis, clip)} accessToken={accessToken} onChange={state => { if (acceptsAnalysis(currentClip.current, state)) setMusicAnalysis(state); }} />}
    {buffer && clipValid && IS_ALIGNMENT_STAGING && inCreatives && genreUnknown && <StylePrintRunner key={`${composition.sourceSha256}:${composition.clipStartMs}:${clipMs}`}
      clip={clip} accessToken={accessToken} />}

    {page === 'create' && <main className="mobile"><h1>Open mumoo on desktop</h1><p>Use desktop to time lyrics and preview.</p></main>}
    <LegalCorner />
  </>;
}

/** Phones get their own small app (a notice, then their Media); making videos needs a computer. Same width as the CSS's `.mobile`. */
const PHONE = '(max-width: 740px)';
const MobileApp = lazy(() => import('./mobile-app'));

/** Chosen once, as the page opens: a computer window made narrow later keeps the work it has open. */
function Root() {
  const [phone] = useState(() => window.matchMedia(PHONE).matches);
  return phone ? <Suspense fallback={null}><MobileApp /></Suspense> : <App />;
}

reportUncaughtErrors();
// The Google sign-in popup, back on our site: starting the auth SDK is all it needs (it hands the session to the page that opened it, and closes).
const googlePopup = Boolean(window.opener) && new URLSearchParams(location.search).has('neon_popup');
if (googlePopup) void import('./account');
// Polar's checkout window, back on our site after paying: it tells the page that opened it, and closes.
else if (!handOverCheckout()) {
  keepReferral();
  arrive();
  createRoot(document.getElementById('root')!).render(<CrashGuard><Root /></CrashGuard>);
}
