import { useEffect, useRef, useState } from 'react';
import { LoadingMask } from './loading-mask';
import { cn } from '@/lib/utils';

const AHEAD = '500px';
/** A video that said what it is but shows no frame by then (Safari reads only so much of a video it is not playing) is shown anyway. */
const FRAME_WAIT_MS = 2500;

/**
 * Stops a video's download for good. A video taken off the page goes on downloading until the browser collects it, and the
 * browser opens only a few connections to one host at a time: the next video then waits behind it and never starts.
 */
export function releaseVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.removeAttribute('src');
  video.load();
}

/**
 * A video card's still: the video's first frame, copied onto a canvas, after which the video is let go. A wall of cards
 * then holds no downloads open (see `releaseVideo`), and the player opened from it starts at once.
 */
function VideoStill({ src, className, onReady, onFailed }: { src: string; className: string; onReady: () => void; onFailed: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [kept, setKept] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    const player = video.current;
    return () => releaseVideo(player);
  }, [src]);

  function copy() {
    const player = video.current;
    const target = canvas.current;
    if (!player || !target || done.current || player.readyState < 2 || !player.videoWidth) return;
    done.current = true;
    target.width = player.videoWidth;
    target.height = player.videoHeight;
    target.getContext('2d')?.drawImage(player, 0, 0, target.width, target.height);
    setKept(true);
    releaseVideo(player);
    onReady();
  }

  return <>
    <canvas ref={canvas} className={cn(className, !kept && 'hidden')} />
    {/* `#t=0.1`: Safari draws a video's first frame only when it is asked for a moment of it. */}
    {!kept && <video ref={video} className={className} src={`${src}#t=0.1`} preload="metadata" muted playsInline
      onLoadedData={copy} onSeeked={copy} onLoadedMetadata={() => setTimeout(onReady, FRAME_WAIT_MS)} onError={() => { if (!done.current) onFailed(); }} />}
  </>;
}

/**
 * A picture or video that is fetched only when it is about to come into view, under the loading mask, and fades in once it
 * has arrived. Fills its (relative) card. A renewed link (the old one expires) is taken only when the one shown stops working,
 * so a card that is in never loads again.
 */
export function LazyMedia({ picture, video }: { picture?: string; video?: string }) {
  const place = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState({ picture, video });
  const latest = useRef({ picture, video });
  latest.current = { picture, video };

  useEffect(() => {
    const node = place.current;
    if (!node) return;
    const watcher = new IntersectionObserver(([seen]) => {
      if (seen.isIntersecting) { setShown(latest.current); setNear(true); watcher.disconnect(); }
    }, { rootMargin: AHEAD });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  /** The link stopped working: the newest one the page has, if it is another; otherwise the card shows what it can. */
  function failed(kind: 'picture' | 'video') {
    const fresh = latest.current[kind];
    if (fresh && fresh !== shown[kind]) setShown(current => ({ ...current, [kind]: fresh }));
    else setReady(true);
  }

  const media = cn('absolute inset-0 size-full object-cover transition-opacity duration-200', ready ? 'opacity-100' : 'opacity-0');
  return <div ref={place} className="absolute inset-0">
    <LoadingMask loading={!ready} />
    {near && shown.video && <VideoStill key={shown.video} src={shown.video} className={media} onReady={() => setReady(true)} onFailed={() => failed('video')} />}
    {near && shown.picture && <img key={shown.picture} className={media} src={shown.picture} alt="" onLoad={() => setReady(true)} onError={() => failed('picture')} />}
  </div>;
}
