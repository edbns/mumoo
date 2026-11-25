/**
 * Stutter — on the beat the reel judders: for a moment it rocks back and forth over the last few frames before the
 * beat (a frame back, two back, one back, the beat, again…) while the picture snaps side to side (Roll: up and down)
 * a step every frame, then it plays on. Every frame is a pure function of the clock and the beats: the cloud render
 * finds each rocked frame by seeking to it (`stutterSourceMs`), and the live preview plays the same frames from the
 * few it has just drawn.
 */
import { WIDTH } from './composition';

export type StutterLook = {
  /** Which beats judder: the first of each bar, every beat, or every second one. */
  on: 'downbeat' | 'beat' | 'second';
  /** How long a judder lasts, in beats. */
  beats: number;
  /** How far the picture snaps each step (px), and which way. */
  shake: number;
  axis: 'x' | 'y';
  /** How many frames back the reel rocks. */
  rock: number;
  /** How white the first step flashes. Only the first, so nothing flashes three times a second. */
  flash: number;
};

export const STUTTER_LOOK: Readonly<Record<string, StutterLook>> = {
  bar: { on: 'downbeat', beats: 1, shake: 38, axis: 'x', rock: 3, flash: 0 },
  beat: { on: 'beat', beats: 0.4, shake: 26, axis: 'x', rock: 2, flash: 0 },
  roll: { on: 'downbeat', beats: 1, shake: 34, axis: 'y', rock: 4, flash: 0 },
  flash: { on: 'second', beats: 0.6, shake: 30, axis: 'x', rock: 3, flash: 0.4 },
};

/** One step of the judder: a frame of the cards' 30 fps. */
export const STEP_MS = 1000 / 30;
/** A song whose beats are not known judders on this beat length. */
const DEFAULT_BEAT_MS = 500;

export type StutterHold = {
  /** The beat the judder is on, and how far into it this frame is. */
  startMs: number;
  intoMs: number;
  lengthMs: number;
};

const lookOf = (variant: string | undefined) => STUTTER_LOOK[variant ?? ''] ?? STUTTER_LOOK.bar;

/** The judder under way at `ms`, or null while the reel plays on. */
export function stutterAt(ms: number, beatsMs: readonly number[], downbeatsMs: readonly number[], variant?: string): StutterHold | null {
  const look = lookOf(variant);
  const gap = (at: number) => {
    const next = beatsMs[at + 1];
    return next !== undefined && next > beatsMs[at] ? next - beatsMs[at] : at > 0 ? beatsMs[at] - beatsMs[at - 1] : DEFAULT_BEAT_MS;
  };
  let start = -1;
  let length = 0;
  for (let at = 0; at < beatsMs.length && beatsMs[at] <= ms; at++) {
    const catches = look.on === 'beat' || (look.on === 'second' && at % 2 === 0)
      || (look.on === 'downbeat' && (downbeatsMs.length ? downbeatsMs.includes(beatsMs[at]) : at % 4 === 0));
    if (catches) {
      start = beatsMs[at];
      length = gap(at) * look.beats;
    }
  }
  if (start < 0 || ms - start >= length) return null;
  return { startMs: start, intoMs: ms - start, lengthMs: length };
}

const stepOf = (hold: StutterHold) => Math.floor(hold.intoMs / STEP_MS);

/** How many frames before the beat a step shows: 0, 1 … `rock`, back to 0, and so on. */
function framesBack(step: number, rock: number) {
  const cycle = rock * 2;
  const at = step % cycle;
  return at <= rock ? at : cycle - at;
}

/** The moment of the song whose frame shows at `ms`: during a judder, one of the frames just before its beat. */
export function stutterSourceMs(ms: number, beatsMs: readonly number[], downbeatsMs: readonly number[], variant?: string): number {
  const hold = stutterAt(ms, beatsMs, downbeatsMs, variant);
  return hold ? Math.max(0, hold.startMs - framesBack(stepOf(hold), lookOf(variant).rock) * STEP_MS) : ms;
}

/** How the picture is pushed this frame: its scale (enough that a snap never shows an edge), its snap (px) and how white it flashes. */
export function stutterKick(hold: StutterHold, variant: string | undefined) {
  const look = lookOf(variant);
  const step = stepOf(hold);
  // The snaps ease off over the judder, so it lands back on the playing reel.
  const strength = look.shake * (1 - 0.5 * (hold.intoMs / hold.lengthMs));
  const snap = (step % 2 === 0 ? 1 : -1) * strength;
  return {
    scale: 1 + (2 * look.shake) / WIDTH + 0.02,
    x: look.axis === 'x' ? snap : 0,
    y: look.axis === 'y' ? snap : 0,
    flash: step === 0 ? look.flash : 0,
  };
}
