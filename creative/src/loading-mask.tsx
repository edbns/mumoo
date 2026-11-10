import { useEffect, useState } from 'react';
import { ImageGeneration } from '@/components/ui/image-generation';
import { cn } from '@/lib/utils';

const FADE_MS = 500;

/**
 * What every creative shows while it is not there yet: the drifting field of dots, laid over its card. It fades away when
 * the creative is ready and is only then taken out, so a finished page holds no animation. The card must be `relative`.
 */
export function LoadingMask({ loading }: { loading: boolean }) {
  const [mounted, setMounted] = useState(loading);
  useEffect(() => {
    if (loading) { setMounted(true); return; }
    const gone = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(gone);
  }, [loading]);
  if (!mounted) return null;
  return <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 transition-opacity ease-out', loading ? 'opacity-100' : 'opacity-0')}
    style={{ transitionDuration: `${FADE_MS}ms` }}>
    <ImageGeneration compact label="Loading" />
  </div>;
}
