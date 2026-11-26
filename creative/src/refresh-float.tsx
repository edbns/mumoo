import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RefreshIcon } from '@/components/icons';

/** How long the word, then the icon, stays before the other takes its turn. */
const TURN_MS = 1500;
/** Just outside the right edge of the cards (914px wide, centred, as `.trim`), or the screen's edge when there is no room. */
const BESIDE_CARDS = { right: 'max(1.25rem, calc((100vw - 914px) / 2 - 64px - 1.5rem))' };
const SWAP = { initial: { opacity: 0, scale: 0.6, rotate: -90 }, animate: { opacity: 1, scale: 1, rotate: 0 }, exit: { opacity: 0, scale: 0.6, rotate: 90 }, transition: { duration: 0.18, ease: 'easeOut' } } as const;

/**
 * The shelf's one Refresh, floating beside the cards half-way down so it stays in reach however far the cards are scrolled. It takes
 * turns showing its word and its icon: the word says what it does, the icon says it is a button. With reduced motion, the word stays.
 */
export function RefreshFloat({ disabled, onRefresh }: { disabled: boolean; onRefresh: () => void }) {
  const still = useReducedMotion();
  const [word, setWord] = useState(true);
  // Held still under the pointer: a press that starts on the word and ends on the icon would otherwise be lost.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (still || held) return;
    const timer = window.setInterval(() => setWord(current => !current), TURN_MS);
    return () => window.clearInterval(timer);
  }, [still, held]);
  const showWord = word || still;
  return <div className="fixed top-1/2 z-30 -translate-y-1/2" style={BESIDE_CARDS}>
    <button type="button" aria-label="Refresh all videos" title="Refresh all videos" disabled={disabled} onClick={onRefresh}
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      className="shimmer grid size-16 cursor-pointer place-items-center rounded-full border-0 bg-primary text-primary-foreground shadow-[0_12px_30px_-10px_rgba(0,0,0,0.85),0_0_0_4px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      <AnimatePresence mode="wait" initial={false}>
        {showWord
          ? <motion.span key="word" {...SWAP} className="pointer-events-none text-[11px] font-semibold tracking-tight">Refresh</motion.span>
          : <motion.span key="icon" {...SWAP} className="pointer-events-none grid place-items-center"><RefreshIcon aria-hidden="true" className="size-6" strokeWidth={2} /></motion.span>}
      </AnimatePresence>
    </button>
  </div>;
}
