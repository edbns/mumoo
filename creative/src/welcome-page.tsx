import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { FlipDiskMatrix } from '@/components/ui/flip-disk-matrix';
import { accountFetch, sessionToken } from './account';
import { CookieBanner } from './legal-corner';
import { useFreeVideo } from './use-free-video';
import '@fontsource-variable/inter';
import './styles/index.css';

/** Member numbers are shown with at least four digits: 0001, 0042, 12345. */
const padded = (n: number) => String(n).padStart(4, '0');
/** The board counts up to the number in this many flips, so it is seen arriving. */
const STEPS = 9;
const STEP_MS = 140;

type Known = { mine: boolean; number: number };

/** Whose number: the signed-in person's own member number, else the newest one (how many artists have joined). */
async function lookUp(): Promise<Known> {
  if (await sessionToken().catch(() => null)) {
    const account = await (await accountFetch('/api/account')).json() as { memberNo?: number | null };
    if (account.memberNo) return { mine: true, number: account.memberNo };
  }
  const { latest } = await (await fetch('/api/members')).json() as { latest: number };
  return { mine: false, number: latest };
}

/** /welcome: a flip-disc board showing the person's member number, counting up from 0000 as it arrives. */
function WelcomePage() {
  const free = useFreeVideo();
  const [known, setKnown] = useState<Known | null>(null);
  // Only for people whose free video is still to come; everyone else goes straight to the home page.
  useEffect(() => { if (free === false) location.replace('/'); }, [free]);
  const [shown, setShown] = useState(0);

  useEffect(() => { lookUp().then(setKnown, () => {}); }, []);

  useEffect(() => {
    if (!known) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(known.number); return; }
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      // Eased: quick at first, settling on the number.
      setShown(Math.round(known.number * (1 - (1 - step / STEPS) ** 3)));
      if (step >= STEPS) clearInterval(timer);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [known]);

  const digits = padded(shown);
  if (free !== true) return null;
  return <div className="flex flex-1 flex-col text-foreground">
    <header className="flex items-center justify-between px-6 pt-6 pb-4">
      <a href="/" aria-label="MUMOO"><img src="/brand/mumoo-logo.png" alt="MUMOO" className="h-5" /></a>
    </header>
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 pb-16">
      <FlipDiskMatrix text={known ? digits : ''} cols={Math.max(31, digits.length * 6 + 5)} label={known ? padded(known.number) : 'Loading'} />
      <Button className="bg-white text-black hover:bg-white/90" onClick={() => location.assign('/')}>try it for free, no watermark</Button>
    </main>
    <CookieBanner />
  </div>;
}

createRoot(document.getElementById('root')!).render(<WelcomePage />);
