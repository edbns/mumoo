import { useEffect, useRef, useState } from 'react';
import { LoadingMask } from './loading-mask';
import { cn } from '@/lib/utils';

const AHEAD = '500px';

/**
 * A picture or video that is fetched only when it is about to come into view, under the loading mask, and fades in once it
 * has arrived. Fills its (relative) card.
 */
export function LazyMedia({ picture, video }: { picture?: string; video?: string }) {
  const place = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = place.current;
    if (!node) return;
    const watcher = new IntersectionObserver(([seen]) => {
      if (seen.isIntersecting) { setNear(true); watcher.disconnect(); }
    }, { rootMargin: AHEAD });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const media = cn('absolute inset-0 size-full object-cover transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0');
  return <div ref={place} className="absolute inset-0">
    <LoadingMask loading={!ready} />
    {near && video && <video className={media} src={video} preload="metadata" muted playsInline onLoadedData={() => setReady(true)} onError={() => setReady(true)} />}
    {near && picture && <img className={media} src={picture} alt="" onLoad={() => setReady(true)} onError={() => setReady(true)} />}
  </div>;
}
