import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RefreshIcon } from '@/components/icons';

/** How long the word, then the icon, stays before the other takes its turn. */
const TURN_MS = 2600;
const SWAP = { initial: { opacity: 0, scale: 0.6, rotate: -90 }, animate: { opacity: 1, scale: 1, rotate: 0 }, exit: { opacity: 0, scale: 0.6, rotate: 90 }, transition: { duration: 0.28, ease: 'easeOut' } } as const;

/**
 * The shelf's one Refresh, floating at the right edge half-way down so it stays in reach however far the cards are scrolled. It takes
 * turns showing its word and its icon: the word says what it does, the icon says it is a button. With reduced motion, the word stays.
 */
export function RefreshFloat({ disabled, onRefresh }: { disabled: boolean; onRefresh: () => void }) {
  const still = useReducedMotion();
  const [word, setWord] = useState(true);
  useEffect(() => {
    if (still) return;
    const timer = window.setInterval(() => setWord(current => !current), TURN_MS);
    return () => window.clearInterval(timer);
  }, [still]);
  const showWord = word || still;
  return <div className="fixed right-5 top-1/2 z-30 -translate-y-1/2 md:right-8">
    <button type="button" aria-label="Refresh all videos" title="Refresh all videos" disabled={disabled} onClick={onRefresh}
      className="shimmer grid size-16 cursor-pointer place-items-center rounded-full border-0 bg-primary text-primary-foreground shadow-[0_12px_30px_-10px_rgba(0,0,0,0.85),0_0_0_4px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      <AnimatePresence mode="wait" initial={false}>
        {showWord
          ? <motion.span key="word" {...SWAP} className="text-[11px] font-semibold tracking-tight">Refresh</motion.span>
          : <motion.span key="icon" {...SWAP} className="grid place-items-center"><RefreshIcon aria-hidden="true" className="size-6" strokeWidth={2} /></motion.span>}
      </AnimatePresence>
    </button>
  </div>;
}
