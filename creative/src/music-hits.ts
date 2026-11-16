/**
 * Where the drums hit in the 15 seconds, read from the song analysis (`music_analysis.py`): every transient it heard, each frame's
 * loudness, onset strength and brightness (spectral centroid), the beats and bars, and the sections where the energy jumps.
 * There are no separate drum stems, so each kind of hit is told by what it sounds like and where it falls:
 *   kick    a strong transient on a beat whose sound is dark (low centroid): the bass drum.
 *   heavy   the loudest of those, for the moves that answer only a big hit (shake, jitter).
 *   snare   the backbeat (the second and fourth beat of a bar), where pop, hip-hop and dance music put the snare.
 *   hat     a bright transient (high centroid) that is not a kick: hi-hats, shakers, snare rolls.
 *   drop    the bar where the energy jumps up: a drop or a chorus coming in.
 * A pure function of the analysis, so the preview and the cloud render hear the same hits.
 */
export type MusicHits = {
  kicksMs: number[];
  heavyMs: number[];
  snaresMs: number[];
  hatsMs: number[];
  dropsMs: number[];
};

type Frame = { timeMs: number; rms: number; onsetStrength: number; centroidHz: number };
type Segment = { startMs: number; energyChange: number | null };

export type HitsInput = {
  beatsMs: readonly number[];
  downbeatsMs: readonly number[];
  transientsMs: readonly number[];
  frames: readonly Frame[];
  segments: readonly Segment[];
  durationMs: number;
};

/** A transient this close to a beat is on it. */
const ON_BEAT_MS = 70;
/** A bright transient this close to a kick is the kick's own click, not a hat. */
const KICK_CLICK_MS = 40;
/** How far around a transient its sound is read: the analysis marks a hit a frame or two before its peak. */
const READ_MS = 35;
/** A rise in energy at least this big (the share of the loudest second) is a drop. Matches the analysis's own threshold for a section change. */
const DROP_RISE = 0.22;
/** The analysis marks sections on whole seconds; the bar nearest is where the drop is heard. */
const DROP_BAR_MS = 600;
const MOST = 200;

const quantile = (values: readonly number[], share: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(share * sorted.length)))];
};

const near = (list: readonly number[], ms: number, within: number) => list.some(other => Math.abs(other - ms) <= within);

/** The frame around `ms` with the strongest onset: what the hit sounds like at its peak. */
function soundAt(frames: readonly Frame[], ms: number): Frame | null {
  let best: Frame | null = null;
  for (const frame of frames) {
    if (frame.timeMs < ms - READ_MS) continue;
    if (frame.timeMs > ms + READ_MS) break;
    if (!best || frame.onsetStrength > best.onsetStrength) best = frame;
  }
  return best;
}

const clean = (list: readonly number[], durationMs: number) =>
  [...new Set(list.map(Math.round))].filter(ms => ms >= 0 && ms < durationMs).sort((a, b) => a - b).slice(0, MOST);

export function musicHits(input: HitsInput): MusicHits {
  const { beatsMs, downbeatsMs, transientsMs, frames, segments, durationMs } = input;
  const heard = transientsMs.flatMap(ms => {
    const sound = soundAt(frames, ms);
    return sound ? [{ ms, ...sound }] : [];
  });
  const strong = quantile(heard.map(hit => hit.onsetStrength), 0.5);
  const dark = quantile(heard.map(hit => hit.centroidHz), 0.45);
  const bright = quantile(heard.map(hit => hit.centroidHz), 0.65);
  const loud = quantile(heard.map(hit => hit.rms), 0.6);

  let kicks = heard.filter(hit => hit.onsetStrength >= strong && hit.centroidHz <= dark && near(beatsMs, hit.ms, ON_BEAT_MS));
  // A mix whose kick is not darker than the rest (a busy master): its strong beats stand in for the kicks.
  if (kicks.length < beatsMs.length * 0.15) kicks = heard.filter(hit => hit.onsetStrength >= strong && near(beatsMs, hit.ms, ON_BEAT_MS));
  const kicksMs = kicks.map(hit => hit.ms);
  const heavyMs = kicks.filter(hit => hit.rms >= loud).map(hit => hit.ms);

  // The beat's place in its bar: counted from the bar it falls in, or (with no bars) from the first beat.
  const placeInBar = (index: number) => {
    const at = beatsMs[index];
    let bar = -1;
    for (let i = 0; i < downbeatsMs.length && downbeatsMs[i] <= at + ON_BEAT_MS; i += 1) bar = i;
    if (bar < 0) return index;
    return beatsMs.filter(ms => ms >= downbeatsMs[bar] - ON_BEAT_MS && ms < at - ON_BEAT_MS).length;
  };
  const snaresMs = beatsMs.filter((_, index) => placeInBar(index) % 2 === 1);

  const hatsMs = heard.filter(hit => hit.centroidHz >= bright && !near(kicksMs, hit.ms, KICK_CLICK_MS)).map(hit => hit.ms);

  const onBar = (ms: number) => {
    const bar = downbeatsMs.reduce((best, d) => (Math.abs(d - ms) < Math.abs(best - ms) ? d : best), Number.POSITIVE_INFINITY);
    return Math.abs(bar - ms) <= DROP_BAR_MS ? bar : ms;
  };
  const dropsMs = segments.filter(segment => segment.energyChange !== null && segment.energyChange >= DROP_RISE).map(segment => onBar(segment.startMs));

  return {
    kicksMs: clean(kicksMs, durationMs),
    heavyMs: clean(heavyMs, durationMs),
    snaresMs: clean(snaresMs, durationMs),
    hatsMs: clean(hatsMs, durationMs),
    dropsMs: clean(dropsMs, durationMs),
  };
}
