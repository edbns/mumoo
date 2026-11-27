import { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRightIcon, Link2Icon, PlayIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { checkSignInCode, sendSignInCode, signInWithGoogle } from './account';
import { PAGE_PATHS } from './account-pages';
import { LegalCorner } from './legal-corner';
import { keepReferral } from './referral';
import { SignInDialog } from './sign-in-dialog';
import { START_COOKIE } from './site-paths';
import '@fontsource-variable/inter';
import './styles/index.css';

/** Into the studio. `/` shows this page to anyone signed out (netlify.toml) unless this browser session has chosen to start. */
function start() {
  document.cookie = `${START_COOKIE}=1; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  location.assign('/');
}

const SIGN_IN = { title: 'Sign in to mumoo', lead: 'Your videos and credits are waiting.' };

function ShowVideo() {
  const still = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(!still);
  return <div className="relative mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[var(--radius-panel)] bg-muted shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] lg:h-[min(600px,calc(100svh-13rem))] lg:w-auto lg:max-w-none">
    <video ref={video} className="block size-full object-cover" src="/home/welcome.mp4" poster="/home/welcome.jpg"
      autoPlay={!still} muted loop playsInline preload="auto" aria-label="A video made with mumoo"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    {!playing && <button type="button" onClick={() => void video.current?.play()} aria-label="Play"
      className="absolute inset-0 grid cursor-pointer place-items-center border-0 bg-black/20 text-white">
      <span className="grid size-14 place-items-center rounded-full bg-black/50 backdrop-blur-sm"><PlayIcon aria-hidden="true" className="size-6 fill-current" /></span>
    </button>}
  </div>;
}

/** The home page for anyone signed out: what mumoo does, a video made with it, and the way in. */
function WelcomePage() {
  const still = useReducedMotion();
  const [signingIn, setSigningIn] = useState(false);
  const signedIn = useRef(false);
  const address = useRef('');
  const closeSignIn = useCallback(() => {
    setSigningIn(false);
    if (signedIn.current) location.assign('/');
  }, []);
  const rise = (delay: number) => still ? {} : {
    initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay, ease: 'easeOut' as const },
  };
  return <div className="flex flex-1 flex-col text-foreground">
    <header className="masthead">
      <a className="masthead-logo" href="/" aria-label="mumoo"><img src="/brand/mumoo-logo.png" alt="" /></a>
      <div className="masthead-actions">
        <Button variant="secondary" onClick={() => location.assign(PAGE_PATHS.links ?? '/')}><Link2Icon aria-hidden="true" className="size-4" />Free Smart Links</Button>
      </div>
    </header>
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-6 pt-16 pb-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16 lg:pt-6 lg:pb-0">
      <div className="flex flex-col items-start gap-6">
        <motion.h1 {...rise(0)} className="m-0 text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
          Your song, directed to the beat.
        </motion.h1>
        <motion.p {...rise(0.08)} className="m-0 max-w-xl text-lg text-pretty text-muted-foreground">
          Drop a track, pick 10 to 15 seconds, and get ready-to-post Reels, TikToks, and Shorts—matched to your sound, with optional beat-synced lyrics. No editing.
        </motion.p>
        <motion.div {...rise(0.16)} className="flex flex-wrap items-center gap-3">
          <Button className="h-11 px-6 text-base" onClick={start}>Make your first video free<ArrowRightIcon aria-hidden="true" className="size-4" /></Button>
          <Button className="h-11 px-6 text-base" variant="secondary" onClick={() => { signedIn.current = false; setSigningIn(true); }}>Sign in</Button>
        </motion.div>
        <motion.p {...rise(0.24)} className="m-0 rounded-2xl bg-primary/10 px-4 py-2 text-sm text-foreground">
          First video free, no watermark · Then from 25¢ a video · No subscription
        </motion.p>
      </div>
      <motion.div {...rise(0.12)} className="w-full">
        <ShowVideo />
      </motion.div>
    </main>
    <LegalCorner />
    <SignInDialog open={signingIn} onClose={closeSignIn} reason={SIGN_IN}
      onSendCode={async email => { await sendSignInCode(email); address.current = email; }}
      onCheckCode={async code => { await checkSignInCode(address.current, code); signedIn.current = true; return true; }}
      onGoogle={async () => { await signInWithGoogle(); signedIn.current = true; }} />
  </div>;
}

keepReferral();
createRoot(document.getElementById('root')!).render(<WelcomePage />);
