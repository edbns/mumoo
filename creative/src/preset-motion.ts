/**
 * What an edit preset (`edit-presets.ts`) does to the picture at one moment: its colour and texture, how the camera moves, and the
 * flashes, whips, zooms and light leaks timed to the cuts and the drums. A pure function of the moment, the cuts and the music, so the
 * shelf preview and every cloud chunk draw the same frame. pack-preset.ts turns it into pixels.
 */
import type { PresetId } from './edit-presets';

/** The look: every number the preset shader takes (pack-preset.ts). Colours are offsets added in the shadows and in the highlights. */
export type PresetLook = {
  exposure: number;
  contrast: number;
  saturation: number;
  /** Blacks raised to this (faded film and tape), or pressed down by this (club light, gritty). */
  lift: number;
  crush: number;
  shadow: readonly [number, number, number];
  highlight: readonly [number, number, number];
  /** 1 is black and white. */
  mono: number;
  /** A soft glow around bright parts, in this colour. */
  halation: number;
  halationTint: readonly [number, number, number];
  grain: number;
  grainSize: number;
  /** Tape: the colours pulled apart (pixels), the rolling tracking band and scanlines. */
  chroma: number;
  tracking: number;
  scan: number;
  /** A tape picture is soft sideways; a gritty one is sharpened. */
  soften: number;
  sharpen: number;
  /** The early-digital wide lens. */
  barrel: number;
  vignette: number;
};

/** The camera and the moment's effects. Shift is in shares of the frame, rotation in radians, blur in shares of the frame. */
export type PresetFrame = {
  look: PresetLook;
  zoom: number;
  shiftX: number;
  shiftY: number;
  rotate: number;
  /** A whip-pan's sideways blur, and a zoom transition's blur towards the middle. */
  whipBlur: number;
  zoomBlur: number;
  /** Above 0 a white flash, below 0 a black one. */
  flash: number;
  /** A warm light leak (0..1) and where across the frame it burns (0..1). */
  leak: number;
  leakX: number;
  /** The tracking band jumping on a heavy hit (tape). */
  tear: number;
  /** A bass hit's lens pulse (0..1): the colours split outward from the middle and the picture blurs towards it. */
  pulse: number;
  /** The camcorder's REC display, or null. */
  rec: { blink: boolean; time: string; date: string } | null;
};

export type PresetMusic = {
  kicksMs?: readonly number[];
  heavyMs?: readonly number[];
  dropsMs?: readonly number[];
  downbeatsMs?: readonly number[];
  energy?: readonly { timeMs: number; rms: number }[];
};

export type PresetMoment = {
  ms: number;
  /** When the edit cuts, in ms of the song. */
  cutsMs: readonly number[];
  music: PresetMusic | null;
  /** How hard the music is now (0..1), as the renderer reads it. */
  energy: number;
  seed: number;
};

const FRAME_MS = 1000 / 30;

const look = (overrides: Partial<PresetLook>): PresetLook => ({
  exposure: 1, contrast: 1, saturation: 1, lift: 0, crush: 0,
  shadow: [0, 0, 0], highlight: [0, 0, 0], mono: 0,
  halation: 0, halationTint: [1, 0.55, 0.3],
  grain: 0, grainSize: 1.5, chroma: 0, tracking: 0, scan: 0, soften: 0, sharpen: 0, barrel: 0, vignette: 0.2,
  ...overrides,
});

/** Each preset's colour and texture, by take. */
export const LOOKS: Record<PresetId, Record<string, PresetLook>> = {
  // Kodak Portra (warm daylight) and Vision3 (tungsten cinema): warm, lifted shadows, a fine 16mm grain, a little halation.
  kodak: {
    portra: look({ exposure: 1.03, contrast: 0.94, saturation: 0.9, lift: 0.07, shadow: [0.025, 0.012, -0.01], highlight: [0.045, 0.02, -0.035], halation: 0.12, grain: 0.05, grainSize: 1.7, vignette: 0.28 }),
    vision: look({ exposure: 1, contrast: 1.04, saturation: 0.88, lift: 0.05, shadow: [-0.015, 0.01, 0.03], highlight: [0.055, 0.025, -0.03], halation: 0.18, grain: 0.055, grainSize: 1.7, vignette: 0.32 }),
  },
  // Camcorder tape: faded blacks, low contrast, colours pulled apart, a rolling tracking band and soft scanlines.
  vhs: {
    tape: look({ exposure: 1.04, contrast: 0.84, saturation: 0.82, lift: 0.09, shadow: [0.01, 0.02, 0.03], highlight: [0.03, 0.01, -0.02], grain: 0.04, grainSize: 2, chroma: 3.5, tracking: 1, scan: 0.22, soften: 0.0035, vignette: 0.3 }),
  },
  // Club light: crushed blacks and high contrast, in a cool neon tint or crisp black and white.
  strobe: {
    neon: look({ exposure: 1.02, contrast: 1.32, saturation: 1.15, crush: 0.07, shadow: [-0.03, 0, 0.07], highlight: [0.06, -0.02, 0.06], vignette: 0.35 }),
    mono: look({ exposure: 1.04, contrast: 1.45, saturation: 0, crush: 0.09, mono: 1, sharpen: 0.35, vignette: 0.35 }),
  },
  // Early-2000s digicam with the flash on: bright highlights, punchy colour, cool shadows; a straight lens (Fisheye is its own template).
  y2k: {
    digicam: look({ exposure: 1.08, contrast: 1.1, saturation: 1.3, shadow: [-0.02, 0, 0.05], highlight: [0.02, 0.02, 0.03], halation: 0.28, halationTint: [1, 1, 1], vignette: 0.3 }),
  },
  // Soft and glowing: pastel or golden hour, low contrast.
  dreamy: {
    pastel: look({ exposure: 1.04, contrast: 0.84, saturation: 0.78, lift: 0.08, shadow: [0.015, 0, 0.04], highlight: [0.04, 0.005, 0.03], halation: 0.5, halationTint: [1, 0.82, 0.9], vignette: 0.18 }),
    golden: look({ exposure: 1.03, contrast: 0.88, saturation: 0.95, lift: 0.05, shadow: [0.03, 0.012, -0.02], highlight: [0.075, 0.035, -0.035], halation: 0.55, halationTint: [1, 0.7, 0.4], vignette: 0.22 }),
  },
  // Gritty black and white: high contrast, heavy grain, sharp.
  mono: {
    grit: look({ exposure: 1.02, contrast: 1.5, saturation: 0, crush: 0.06, mono: 1, grain: 0.12, grainSize: 2.2, sharpen: 0.6, vignette: 0.4 }),
  },
};

/** Which look a take draws (a take may also name a move, as Raw 16mm's "portra-drift"). */
function lookOf(preset: PresetId, take: string): PresetLook {
  const looks = LOOKS[preset];
  const named = Object.keys(looks).find(name => take.split('-').includes(name));
  return looks[named ?? Object.keys(looks)[0]];
}

/** A smooth wobble in -1..1 (sums of slow sines, a different one per `salt`). */
const wobble = (t: number, salt: number) =>
  (Math.sin(t * 1.7 + salt * 12.9) * 0.5 + Math.sin(t * 0.73 + salt * 4.1) * 0.35 + Math.sin(t * 2.9 + salt * 7.3) * 0.15);

/** A repeatable number in 0..1 for a hit (`n`) of a card (`seed`). */
const chance = (seed: number, n: number) => {
  const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** The last of `list` at or before `ms` (and its place), or null. */
function last(list: readonly number[] | undefined, ms: number): { at: number; index: number } | null {
  if (!list) return null;
  let found: { at: number; index: number } | null = null;
  for (let i = 0; i < list.length && list[i] <= ms; i += 1) found = { at: list[i], index: i };
  return found;
}

/** How far through its piece of the edit `ms` is (0..1), and which piece. */
function piece(cutsMs: readonly number[], ms: number) {
  const before = last(cutsMs, ms);
  const start = before?.at ?? 0;
  const end = cutsMs.find(cut => cut > ms) ?? 15_000;
  return { along: (ms - start) / Math.max(1, end - start), index: before ? before.index + 1 : 0 };
}

/** Where a warm leak burns: on each drop, or (a song with none) once, on the bar that opens its loudest two seconds. */
export function leakMoments(music: PresetMusic | null): number[] {
  if (music?.dropsMs?.length) return [...music.dropsMs];
  const bars = music?.downbeatsMs ?? [];
  const energy = music?.energy ?? [];
  if (!bars.length || !energy.length) return [];
  const loudness = (from: number) => {
    const inside = energy.filter(frame => frame.timeMs >= from && frame.timeMs < from + 2000);
    return inside.length ? inside.reduce((sum, frame) => sum + frame.rms, 0) / inside.length : 0;
  };
  const best = bars.filter(bar => bar > 1000 && bar < 13_000).reduce((top, bar) => (loudness(bar) > loudness(top) ? bar : top), bars[0]);
  return [best];
}

const LEAK_MS = 1400;
/** A flash holds two frames. */
const FLASH_MS = FRAME_MS * 2;
const PUNCH_MS = 140;
const SHAKE_MS = 170;
const JITTER_MS = FRAME_MS * 2;
const WHIP_MS = 110;
const ZOOM_MS = 220;
const PULSE_MS = 180;
/** A lens pulse starts at most three times a second, however fast the bass hits (the photosensitivity limit). */
const PULSE_GAP_MS = 1000 / 3;

/** The hits of `list` at least `gapMs` after the last one kept. */
export function spaced(list: readonly number[] | undefined, gapMs: number): number[] {
  const kept: number[] = [];
  for (const at of list ?? []) if (!kept.length || at - kept[kept.length - 1] >= gapMs) kept.push(at);
  return kept;
}

/** A camcorder's clock: the time of day runs with the song, the date is the card's own, in the late nineties. */
function recDisplay(ms: number, seed: number) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const year = 1994 + Math.floor(chance(seed, 1) * 6);
  const month = months[Math.floor(chance(seed, 2) * 12)];
  const day = 1 + Math.floor(chance(seed, 3) * 28);
  const hour = 1 + Math.floor(chance(seed, 4) * 12);
  const minute = Math.floor(chance(seed, 5) * 50);
  const seconds = Math.floor(ms / 1000) + Math.floor(chance(seed, 6) * 30);
  const two = (n: number) => String(n).padStart(2, '0');
  return {
    blink: Math.floor(ms / 500) % 2 === 0,
    time: `PM ${hour}:${two(minute + Math.floor(seconds / 60))}:${two(seconds % 60)}`,
    date: `${month}. ${two(day)} ${year}`,
  };
}

export function presetFrame(preset: PresetId, take: string, moment: PresetMoment): PresetFrame {
  const { ms, cutsMs, music, energy, seed } = moment;
  const t = ms / 1000;
  const frame: PresetFrame = {
    look: lookOf(preset, take), zoom: 1, shiftX: 0, shiftY: 0, rotate: 0, whipBlur: 0, zoomBlur: 0,
    flash: 0, leak: 0, leakX: 0.5, tear: 0, pulse: 0, rec: null,
  };
  const { along, index } = piece(cutsMs, ms);
  const hit = (list: readonly number[] | undefined, within: number) => {
    const found = last(list, ms);
    return found && ms - found.at < within ? { since: ms - found.at, index: found.index } : null;
  };

  if (preset === 'kodak') {
    if (take.endsWith('push')) {
      // A slow push in over each piece, as if the camera crept towards them.
      frame.zoom = 1.03 + 0.07 * along;
      frame.shiftX = 0.003 * wobble(t * 0.4, seed);
      frame.shiftY = 0.003 * wobble(t * 0.4, seed + 1);
    } else {
      // Handheld: a gentle drift and lean.
      frame.zoom = 1.06;
      frame.shiftX = 0.011 * wobble(t * 0.45, seed);
      frame.shiftY = 0.008 * wobble(t * 0.4, seed + 1);
      frame.rotate = 0.006 * wobble(t * 0.3, seed + 2);
    }
    const leak = leakMoments(music).map(at => ms - at).find(since => since >= 0 && since < LEAK_MS);
    if (leak !== undefined) {
      frame.leak = Math.sin(Math.PI * (leak / LEAK_MS)) ** 1.5;
      frame.leakX = 0.15 + 0.7 * (leak / LEAK_MS);
    }
  } else if (preset === 'vhs') {
    frame.zoom = 1.02;
    // A heavy bass hit shakes the tape for two frames.
    const jolt = hit(music?.heavyMs, JITTER_MS);
    if (jolt) {
      frame.shiftX = (chance(seed, jolt.index * 2) - 0.5) * 0.012;
      frame.shiftY = (chance(seed, jolt.index * 2 + 1) - 0.5) * 0.008;
      frame.tear = 1;
    }
    if (take === 'rec') frame.rec = recDisplay(ms, seed);
  } else if (preset === 'strobe') {
    // A punch in on each kick, harder when the music is.
    const kick = hit(music?.kicksMs, PUNCH_MS * 3);
    frame.zoom = 1.02 + (kick ? 0.075 * Math.exp(-kick.since / PUNCH_MS) * (0.45 + 0.55 * energy) : 0);
    // A two-frame flash on each drop, and on the bars while the music is hard.
    const drop = hit(music?.dropsMs, FLASH_MS);
    const bar = energy >= 0.6 ? hit(music?.downbeatsMs, FLASH_MS) : null;
    if (drop || bar) frame.flash = (take.endsWith('black') ? -1 : 1) * (drop ? 1 : 0.85);
  } else if (preset === 'y2k') {
    frame.zoom = 1.02;
    const ahead = cutsMs.find(cut => cut > ms);
    const behind = last(cutsMs, ms);
    if (take === 'zoom') {
      // Each new picture starts close and pulls back, blurred towards the middle.
      if (behind && ms - behind.at < ZOOM_MS) {
        const k = 1 - ease((ms - behind.at) / ZOOM_MS);
        frame.zoom = 1.02 + 0.3 * k;
        frame.zoomBlur = 0.05 * k;
      }
    } else {
      // A whip-pan: the picture leaving flies out one way, blurred, and the next flies in from the other side.
      const side = (n: number) => (n % 2 === 0 ? 1 : -1);
      if (ahead !== undefined && ahead - ms < WHIP_MS) {
        const k = ease(1 - (ahead - ms) / WHIP_MS);
        const n = cutsMs.indexOf(ahead);
        frame.shiftX = -side(n) * 0.4 * k * k;
        frame.whipBlur = side(n) * 0.09 * k;
      } else if (behind && ms - behind.at < WHIP_MS) {
        const k = 1 - ease((ms - behind.at) / WHIP_MS);
        frame.shiftX = side(behind.index) * 0.4 * k * k;
        frame.whipBlur = side(behind.index) * 0.09 * k;
      }
    }
  } else if (preset === 'dreamy') {
    // A slow Ken Burns drift over each piece, each piece another way.
    const angle = chance(seed, index) * Math.PI * 2;
    frame.zoom = 1.05 + 0.06 * along;
    frame.shiftX = Math.cos(angle) * 0.018 * (along - 0.5);
    frame.shiftY = Math.sin(angle) * 0.018 * (along - 0.5);
  }
  if (preset === 'strobe' || preset === 'y2k') {
    // The club and party cuts: the lens pulses on each heavy bass hit, harder when the music is.
    const bass = hit(spaced(music?.heavyMs, PULSE_GAP_MS), PULSE_MS);
    if (bass) frame.pulse = (1 - bass.since / PULSE_MS) ** 2 * (0.5 + 0.5 * energy);
  } else if (preset === 'mono') {
    frame.zoom = 1.05;
    // The camera shakes on each bass hit.
    const jolt = hit(music?.heavyMs, SHAKE_MS);
    if (jolt) {
      const k = 1 - jolt.since / SHAKE_MS;
      const wiggle = Math.sin(jolt.since / 18);
      frame.shiftX = (chance(seed, jolt.index * 3) - 0.5) * 0.028 * k * wiggle;
      frame.shiftY = (chance(seed, jolt.index * 3 + 1) - 0.5) * 0.022 * k * wiggle;
      frame.rotate = (chance(seed, jolt.index * 3 + 2) - 0.5) * 0.02 * k * wiggle;
    }
  }
  return frame;
}
