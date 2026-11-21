import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import GalleryTunnel from '@/components/originkit/ui/gallery-tunnel-variant-2';
import { CookieBanner } from './legal-corner';
import { useFreeVideo } from './use-free-video';
import '@fontsource-variable/inter';
import './styles/index.css';

/** The tunnel's slabs: solid colours only, passed as one-colour images so no photo is ever drawn. */
const COLOURS = ['#FF6A00', '#AB54F7', '#EA3737', '#0072E3', '#00AA3C', '#FFB200'];
const SLABS = COLOURS.map(hex => ({ src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${hex}"/></svg>`)}` }));
/** The rush toward home after the press: fast, and over in under a second. */
const RUSH_MS = 800;
const RUSH_SPEED = 900;

/** /welcome: the Gallery Tunnel with one button inside it, for people whose free video is still to come. */
function WelcomePage() {
  const free = useFreeVideo();
  const [rushing, setRushing] = useState(false);
  const leaving = useRef(false);
  // Everyone who has had their free video goes straight to the home page.
  useEffect(() => { if (free === false) location.replace('/'); }, [free]);

  const go = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { location.assign('/'); return; }
    setRushing(true);
    setTimeout(() => location.assign('/'), RUSH_MS);
  };

  if (free !== true) return null;
  return <div className="fixed inset-0 bg-black text-foreground">
    <div className="absolute inset-0" onPointerDown={go}>
      <GalleryTunnel images={SLABS} label={false} {...(rushing ? { speed: RUSH_SPEED } : {})} />
    </div>
    <a href="/" aria-label="MUMOO" className="absolute top-6 left-6"><img src="/brand/mumoo-logo.png" alt="MUMOO" className="h-5" /></a>
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <Button className="pointer-events-auto bg-white text-black hover:bg-white/90" onClick={go}>try it for free, no watermark</Button>
    </div>
    <CookieBanner />
  </div>;
}

createRoot(document.getElementById('root')!).render(<WelcomePage />);
