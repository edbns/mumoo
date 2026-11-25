/**
 * Stutter — the reel catches on the beat: it holds the frame the beat landed on for a moment, kicking (a jolt in, a
 * shake, on Flash one white flash) as if the clip were repeating, then plays on. The hold is a pure function of the
 * clock and the beats, so the cloud render finds the held frame by seeking to the beat (`stutterSourceMs`), and the
 * live preview keeps a copy of the frame it was on when the hold began: the same frame.
 */

export type StutterLook = {
  /** Which beats catch: the first of each bar, every beat, or every second one. */
  on: 'downbeat' | 'beat' | 'second';
  /** How long a hold lasts, in beats. */
  beats: number;
  /** How many kicks a hold has, evenly spaced; or a roll, each kick coming twice as soon as the last. */
  kicks: number | 'roll';
  /** How far a kick jolts the picture in (a share of its size) and shakes it (px). */
  zoom: number;
  shake: number;
  /** How white the first kick flashes. Only one flash a hold, so nothing flashes three times a second. */
  flash: number;
};

export const STUTTER_LOOK: Readonly<Record<string, StutterLook>> = {
  bar: { on: 'downbeat', beats: 0.5, kicks: 4, zoom: 0.06, shake: 10, flash: 0 },
  beat: { on: 'beat', beats: 0.25, kicks: 2, zoom: 0.04, shake: 6, flash: 0 },
  roll: { on: 'downbeat', beats: 1, kicks: 'roll', zoom: 0.08, shake: 8, flash: 0 },
  flash: { on: 'second', beats: 0.5, kicks: 3, zoom: 0.05, shake: 0, flash: 0.45 },
};

/** How fast a kick dies away. */
const KICK_MS = 70;
/** A song whose beats are not known holds on this beat length. */
const DEFAULT_BEAT_MS = 500;
/** A roll's kicks stop halving here, so they never blur into a buzz. */
const ROLL_SHORTEST_MS = 45;

export type StutterHold = {
  /** When the hold began: the moment of the song whose frame is held. */
  startMs: number;
  /** How hard the latest kick still is (1 the moment it lands, then dying away), and whether it is the first. */
  kick: number;
  first: boolean;
  /** When the latest kick landed, from the hold's start. */
  kickMs: number;
};

const lookOf = (variant: string | undefined) => STUTTER_LOOK[variant ?? ''] ?? STUTTER_LOOK.bar;

/** The hold under way at `ms`, or null while the reel plays on. */
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
  const into = ms - start;
  let kickAt = 0;
  if (look.kicks === 'roll') {
    for (let step = length / 2, next = step; next <= into && step >= ROLL_SHORTEST_MS; step /= 2, next += step) kickAt = next;
  } else {
    kickAt = Math.floor(into / (length / look.kicks)) * (length / look.kicks);
  }
  return { startMs: start, kick: Math.exp(-(into - kickAt) / KICK_MS), first: kickAt === 0, kickMs: kickAt };
}

/** The moment of the song whose frame shows at `ms`: the held beat during a hold, else `ms`. */
export function stutterSourceMs(ms: number, beatsMs: readonly number[], downbeatsMs: readonly number[], variant?: string): number {
  return stutterAt(ms, beatsMs, downbeatsMs, variant)?.startMs ?? ms;
}

/** How the held picture is pushed this frame: its scale, its shake (px) and how white it flashes. */
export function stutterKick(hold: StutterHold, variant: string | undefined, seed: number) {
  const look = lookOf(variant);
  // Each kick shakes another way.
  const wobble = Math.sin((hold.startMs + hold.kickMs) * 0.013 + seed) * look.shake * hold.kick;
  return { scale: 1 + look.zoom * hold.kick, x: wobble, y: -wobble * 0.6, flash: hold.first ? look.flash * hold.kick : 0 };
}
