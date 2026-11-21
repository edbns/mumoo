import { createRoot } from 'react-dom/client';
import { motion, useReducedMotion } from 'motion/react';
import { Link2Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { PAGE_PATHS, type AccountPage } from './account-pages';
import { CookieBanner } from './legal-corner';
import '@fontsource-variable/inter';
import './styles/index.css';

/** One loop of the cursor's wander around the icon, ending in a click on it. */
const LOOP_S = 7;
/** Where the cursor's tip is through the loop, from the icon's centre (px), and when (0–1). It rests on the icon from TIMES[4]. */
const PATH_X = [130, 72, -95, -88, 6, 6, 6, 6, 130];
const PATH_Y = [-90, 64, 54, -72, 3, 3, 3, 3, -90];
const TIMES = [0, 0.18, 0.36, 0.52, 0.66, 0.7, 0.74, 0.86, 1];
const PRESS = [1, 1, 1, 1, 1, 0.86, 1, 1, 1];
const ICON_PRESS = [1, 1, 1, 1, 1, 0.94, 1, 1, 1];
const go = (page: AccountPage) => location.assign(PAGE_PATHS[page] ?? '/');

/** The macOS arrow, drawn larger than life so it reads as "click here". Its tip is the top-left corner. */
function Arrow() {
  return <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.6)]">
    <path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 3-1.3-2.9-6.5h6.3L4 2.5Z" fill="#000" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>;
}

/**
 * /welcome: the home page as an empty desktop. Its logo, its notch (empty) and Smart links at the top, and one app icon left a little off centre as on a desktop nobody tidied, with a cursor that keeps wandering round it and
 * clicking it. Clicking the icon opens Create.
 */
function WelcomePage() {
  const still = useReducedMotion();
  const loop = { duration: LOOP_S, times: TIMES, repeat: Infinity, ease: 'easeInOut' } as const;
  return <>
    <header className="masthead">
      <a className="masthead-logo" href="/" aria-label="MUMOO"><img src="/brand/mumoo-logo.png" alt="" /></a>
      <div className="step-nav max-md:hidden" aria-hidden="true"><span className="block h-[29px] w-[420px]" /></div>
      <div className="masthead-actions">
        <Button variant="secondary" onClick={() => go('links')}><Link2Icon aria-hidden="true" className="size-4" />Smart links</Button>
      </div>
    </header>
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute left-[47%] top-[45%] -translate-x-1/2 -translate-y-1/2">
        <motion.button type="button" onClick={() => go('create')} aria-label="Open mumoo"
          animate={still ? undefined : { scale: ICON_PRESS }} transition={loop} whileHover={{ y: -2 }}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-[18px] border-0 bg-transparent p-2 outline-none focus-visible:ring-2 focus-visible:ring-white/60">
          <span className="relative block size-16 overflow-hidden rounded-[22.5%] shadow-[0_10px_22px_-8px_rgba(40,240,40,0.28),0_2px_5px_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.12)]">
            <img src="/brand/favicon.png" alt="" draggable={false} className="size-full select-none" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.04)_38%,transparent_55%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]" />
          </span>
          <span className="text-xs font-medium tracking-tight text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">mumoo</span>
        </motion.button>
        <motion.div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-10"
          initial={{ x: still ? 28 : PATH_X[0], y: still ? 24 : PATH_Y[0] }}
          animate={still ? undefined : { x: PATH_X, y: PATH_Y, scale: PRESS }} transition={loop} style={{ transformOrigin: '0 0' }}>
          <Arrow />
        </motion.div>
      </div>
    </main>
    <CookieBanner />
  </>;
}

createRoot(document.getElementById('root')!).render(<WelcomePage />);
