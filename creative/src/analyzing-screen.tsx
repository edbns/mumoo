import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ThinkingOrb } from '@/components/ui/thinking-orbs';
import type { CreativeProfileV1 } from './creative-profile';
import { languageName } from './lyrics-cloud';
import { deriveMusicIntent } from './music-intent';

/** How long one fact stays on screen. */
const FLASH_MS = 1800;
/** Once the last poster is painted, the bar is left full for a moment before the page opens. */
const HOLD_MS = 700;

export type PaintProgress = { done: number; total: number };

type Fact = { label: string; value: string };

function titleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Everything we know about the song so far. New facts join the loop the moment the analysis or the lyric reading delivers them. */
function factsOf(profile: CreativeProfileV1): Fact[] {
  const facts: Fact[] = [{ label: 'Genre', value: profile.creator.primaryGenre.value }];
  if (profile.creator.subGenre) facts.push({ label: 'Sub-genre', value: profile.creator.subGenre.value });
  const { approvedLyrics, musicAnalysis, lyricMeaning } = profile;
  if (profile.noLyrics) facts.push({ label: 'Lyrics', value: 'None' });
  if (approvedLyrics) {
    const words = approvedLyrics.cues.reduce((sum, cue) => sum + cue.text.trim().split(/\s+/).filter(Boolean).length, 0);
    facts.push({ label: 'Words', value: String(words) });
    if (approvedLyrics.language) facts.push({ label: 'Language', value: languageName(approvedLyrics.language) });
  }
  if (musicAnalysis.status === 'ready') {
    const { tempo, beatsMs } = musicAnalysis.result.rhythm;
    if (tempo.bpm !== null) facts.push({ label: 'BPM', value: String(Math.round(tempo.bpm)) });
    if (beatsMs.length) facts.push({ label: 'Beats', value: String(beatsMs.length) });
    const intent = deriveMusicIntent(musicAnalysis.result);
    if (intent) {
      facts.push({ label: 'Vibe', value: intent.vibe });
      if (intent.mode && intent.mode !== 'ambiguous') facts.push({ label: 'Key', value: titleCase(intent.mode) });
      facts.push({ label: 'Drive', value: `${Math.round(intent.drive * 100)}%` });
      facts.push({ label: 'Cut rate', value: titleCase(intent.cutRate) });
      facts.push({ label: 'Palette', value: titleCase(intent.palette.replace('-', ' ')) });
    }
  }
  if (lyricMeaning?.status === 'ready') {
    const { attitude, sadness, intensity } = lyricMeaning.meaning;
    facts.push({ label: 'Attitude', value: titleCase(attitude) });
    facts.push({ label: 'Sadness', value: `${sadness} / 3` });
    facts.push({ label: 'Intensity', value: `${intensity} / 5` });
  }
  return facts;
}

/** What is being done right now, in plain words. */
function stageText(profile: CreativeProfileV1, progress: PaintProgress | null) {
  if (profile.musicAnalysis.status === 'pending') return 'Listening to your song';
  if (profile.lyricMeaning?.status === 'pending') return 'Reading your lyrics';
  if (progress && progress.total > 0) return `Building your creatives · ${progress.done} of ${progress.total}`;
  return 'Getting your creatives ready';
}

/**
 * Its own step, from "Continue" until the creatives are painted. The bar follows the posters as they are really finished,
 * and the page opens when the last one is done.
 */
export function AnalyzingScreen({ profile, progress, ready, onDone }: { profile: CreativeProfileV1; progress: PaintProgress | null; ready: boolean; onDone: () => void }) {
  const calm = useReducedMotion();
  const facts = factsOf(profile);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(count => count + 1), FLASH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(onDone, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [ready, onDone]);

  const fact = facts[tick % facts.length];
  const enter = calm ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(6px)' };
  const leave = calm ? { opacity: 0 } : { opacity: 0, y: -10, filter: 'blur(6px)' };

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6" role="status" aria-label="Analysing your song and building your creatives">
      <div className="inline-flex h-[74px] items-center gap-3 rounded-full bg-muted/60 pl-[9px] pr-10">
        <span className="[&_canvas]:!size-14 [&_canvas]:bg-transparent">
          <ThinkingOrb state="composing" size={64} theme="dark" />
        </span>
        <div className="relative h-11 w-56 overflow-hidden" aria-hidden="true">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={`${fact.label}:${fact.value}`}
              className="absolute inset-0 flex flex-col justify-center whitespace-nowrap"
              initial={enter}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={leave}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{fact.label}</span>
              <span className="text-lg font-medium leading-6 text-foreground tabular-nums">{fact.value}</span>
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <div className="flex w-72 flex-col items-center gap-3">
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${percent}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
        </div>
        <p className="text-sm text-muted-foreground">{stageText(profile, progress)}</p>
      </div>
    </main>
  );
}
