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
  /** A Super 8 gate: the picture inside a black frame with rounded corners. */
  gate: number;
  /** A tilt-shift: the top and bottom of the picture softened by this (a share of the frame), the middle sharp. */
  edgeBlur: number;
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
  /** Above 0 a flash of `flashTint` (white unless a take colours it), below 0 a black one. */
  flash: number;
  flashTint: readonly [number, number, number];
  /** A warm light leak (0..1) and where across the frame it burns (0..1). */
  leak: number;
  leakX: number;
  /** The tracking band jumping on a heavy hit (tape). */
  tear: number;
  /** A bass hit's lens pulse (0..1): the colours split outward from the middle and the picture blurs towards it. */
  pulse: number;
  /** The camcorder's REC display or a security camera's, or null. `dot` is the blinking red light. */
  rec: { label: string; dot: boolean; time: string; date: string } | null;
};

export type PresetMusic = {
  kicksMs?: readonly number[];
  heavyMs?: readonly number[];
  dropsMs?: readonly number[];
  downbeatsMs?: readonly number[];
  snaresMs?: readonly number[];
  energy?: readonly { timeMs: number; rms: number }[];
};

export type PresetMoment = {
  ms: number;
  /** When the edit cuts, in ms of the song, and where the clip ends (its last piece runs to it). */
  cutsMs: readonly number[];
  durationMs: number;
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
  grain: 0, grainSize: 1.5, chroma: 0, tracking: 0, scan: 0, soften: 0, sharpen: 0, barrel: 0, vignette: 0.2, gate: 0, edgeBlur: 0,
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
    // Harsher: blacks crushed hard, for drill and metal.
    punch: look({ exposure: 1.05, contrast: 1.7, saturation: 0, crush: 0.14, mono: 1, grain: 0.09, grainSize: 2, sharpen: 0.8, vignette: 0.45 }),
    // Moody: softer contrast under heavy grain, a pale glow.
    ghost: look({ exposure: 0.96, contrast: 1.3, saturation: 0, lift: 0.05, mono: 1, grain: 0.22, grainSize: 2.8, halation: 0.3, halationTint: [1, 1, 1], vignette: 0.55 }),
    // A security camera: a wide lens, scanlines, raw contrast.
    cctv: look({ exposure: 1.06, contrast: 1.35, saturation: 0, lift: 0.06, mono: 1, grain: 0.1, grainSize: 1.8, tracking: 0.12, scan: 0.42, sharpen: 0.3, barrel: 0.38, vignette: 0.5 }),
  },
  // A live session in warm 35mm light: amber and chocolate, glowing skin, a fine grain; the chorus brighter gold, the outro soft at the edges.
  golden: {
    amber: look({ exposure: 1.04, contrast: 0.95, saturation: 1.02, lift: 0.04, shadow: [0.035, 0.015, -0.025], highlight: [0.085, 0.045, -0.04], halation: 0.45, halationTint: [1, 0.68, 0.32], grain: 0.04, grainSize: 1.6, vignette: 0.26 }),
    bloom: look({ exposure: 1.09, contrast: 0.9, saturation: 1, lift: 0.05, shadow: [0.03, 0.014, -0.015], highlight: [0.1, 0.07, -0.02], halation: 0.8, halationTint: [1, 0.74, 0.4], grain: 0.035, grainSize: 1.6, vignette: 0.22 }),
    live: look({ exposure: 1.02, contrast: 1.06, saturation: 1.05, lift: 0.03, shadow: [0.02, 0.008, -0.02], highlight: [0.07, 0.035, -0.04], halation: 0.35, halationTint: [1, 0.62, 0.28], grain: 0.05, grainSize: 1.7, vignette: 0.48 }),
    haze: look({ exposure: 1.03, contrast: 0.9, saturation: 0.94, lift: 0.06, shadow: [0.035, 0.014, -0.02], highlight: [0.08, 0.042, -0.035], halation: 0.55, halationTint: [1, 0.66, 0.34], grain: 0.04, grainSize: 1.6, vignette: 0.32, edgeBlur: 0.012 }),
  },
  // The baile: colours turned right up, a wide fisheye; the street cam sharp, plain phone video.
  baile: {
    fisheye: look({ exposure: 1.05, contrast: 1.15, saturation: 1.38, shadow: [-0.01, 0, 0.04], highlight: [0.03, 0.02, 0.02], barrel: 0.6, vignette: 0.45 }),
    street: look({ exposure: 1.04, contrast: 1.12, saturation: 1.18, shadow: [0, 0, 0.02], sharpen: 0.55, vignette: 0.18 }),
    neon: look({ exposure: 1.04, contrast: 1.22, saturation: 1.45, crush: 0.04, shadow: [0.02, -0.02, 0.07], highlight: [0.06, -0.01, 0.06], barrel: 0.28, halation: 0.25, halationTint: [1, 0.4, 0.9], vignette: 0.38 }),
    whip: look({ exposure: 1.06, contrast: 1.12, saturation: 1.48, barrel: 0.22, vignette: 0.36 }),
  },
  // The Boiler Room: club light, crushed blacks, light that smears behind the kicks. The hypnotic groove is cyan and emerald, the
  // peak drop warm amber and red, the afterhours POV dark with colour fringes on the lights.
  afterhours: {
    cyan: look({ exposure: 1.02, contrast: 1.18, saturation: 1.05, crush: 0.06, shadow: [-0.045, 0.035, 0.05], highlight: [-0.02, 0.055, 0.04], halation: 0.32, halationTint: [0.35, 1, 0.8], vignette: 0.42 }),
    magenta: look({ exposure: 1.03, contrast: 1.22, saturation: 1.12, crush: 0.07, shadow: [0.06, -0.005, -0.03], highlight: [0.08, 0.025, -0.04], halation: 0.4, halationTint: [1, 0.45, 0.2], vignette: 0.42 }),
    drag: look({ exposure: 0.95, contrast: 1.2, saturation: 1.02, crush: 0.1, shadow: [0.01, -0.01, 0.06], highlight: [0.04, 0.02, 0.06], halation: 0.4, halationTint: [0.75, 0.6, 1], chroma: 3, barrel: 0.32, vignette: 0.55 }),
  },
  // Super 8: dusty warm sepia with a green cast in the shadows, coarse grain, in its rounded gate; the golden road borderless at sunset.
  super8: {
    porch: look({ exposure: 1.04, contrast: 0.92, saturation: 0.78, lift: 0.08, shadow: [0.0, 0.025, -0.01], highlight: [0.07, 0.04, -0.03], halation: 0.28, grain: 0.08, grainSize: 2.4, vignette: 0.45, gate: 1 }),
    road: look({ exposure: 1.06, contrast: 0.96, saturation: 0.92, lift: 0.06, shadow: [0.02, 0.012, -0.015], highlight: [0.1, 0.05, -0.045], halation: 0.4, halationTint: [1, 0.6, 0.3], grain: 0.07, grainSize: 2.2, vignette: 0.35 }),
    dust: look({ exposure: 1.02, contrast: 0.98, saturation: 0.5, lift: 0.1, shadow: [0.01, 0.03, -0.005], highlight: [0.06, 0.045, -0.02], halation: 0.2, grain: 0.11, grainSize: 2.6, vignette: 0.5, gate: 1 }),
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
function piece(cutsMs: readonly number[], ms: number, durationMs: number) {
  const before = last(cutsMs, ms);
  const start = before?.at ?? 0;
  const end = cutsMs.find(cut => cut > ms) ?? durationMs;
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
const BOUNCE_MS = 120;
const DRAG_MS = 160;
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
  return {
    label: 'REC',
    dot: Math.floor(ms / 500) % 2 === 0,
    time: `PM ${hour}:${two(minute + Math.floor(seconds / 60))}:${two(seconds % 60)}`,
    date: `${month}. ${two(day)} ${year}`,
  };
}

const two = (n: number) => String(n).padStart(2, '0');

/** A security camera's stamp: its number, a 24-hour clock running with the song, a recent date. */
function cctvDisplay(ms: number, seed: number) {
  const hour = Math.floor(chance(seed, 4) * 24);
  const minute = Math.floor(chance(seed, 5) * 50);
  const seconds = Math.floor(ms / 1000) + Math.floor(chance(seed, 6) * 30);
  return {
    label: `CAM ${two(1 + Math.floor(chance(seed, 7) * 9))}`,
    dot: false,
    time: `${two(hour)}:${two(minute + Math.floor(seconds / 60))}:${two(seconds % 60)}`,
    date: `${2023 + Math.floor(chance(seed, 1) * 4)}-${two(1 + Math.floor(chance(seed, 2) * 12))}-${two(1 + Math.floor(chance(seed, 3) * 28))}`,
  };
}

/** A take printed at a low frame rate (step-printing, home movie, a security camera): pack-reel.ts holds each frame this long. */
const STEP_FPS: Partial<Record<PresetId, Record<string, number>>> = {
  afterhours: { cyan: 12 },
  super8: { porch: 18 },
  mono: { cctv: 10 },
};
export const presetStepMs = (preset: PresetId, take: string) => {
  const fps = STEP_FPS[preset]?.[take];
  return fps ? 1000 / fps : 0;
};

/** A whip-pan: the picture leaving flies out one way, blurred, and the next flies in from the other side. */
function whipBetween(frame: PresetFrame, cutsMs: readonly number[], ms: number) {
  const side = (n: number) => (n % 2 === 0 ? 1 : -1);
  const ahead = cutsMs.find(cut => cut > ms);
  const behind = last(cutsMs, ms);
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

/** The cuts that land on a bar: Groove Lock whips only there, and cuts hard on the rest. */
const onBars = (cutsMs: readonly number[], bars: readonly number[] | undefined) =>
  cutsMs.filter(cut => (bars ?? []).some(bar => Math.abs(bar - cut) < 90));

/** Flash colours of the drop take: white, then red, green and blue frames in turn. */
const RGB: readonly (readonly [number, number, number])[] = [[1, 1, 1], [1, 0.12, 0.2], [0.15, 1, 0.45], [0.2, 0.45, 1]];
const AMBER: readonly [number, number, number] = [1, 0.55, 0.18];

export function presetFrame(preset: PresetId, take: string, moment: PresetMoment): PresetFrame {
  const { ms, cutsMs, durationMs, music, energy, seed } = moment;
  const t = ms / 1000;
  const frame: PresetFrame = {
    look: lookOf(preset, take), zoom: 1, shiftX: 0, shiftY: 0, rotate: 0, whipBlur: 0, zoomBlur: 0,
    flash: 0, flashTint: [1, 1, 1], leak: 0, leakX: 0.5, tear: 0, pulse: 0, rec: null,
  };
  const { along, index } = piece(cutsMs, ms, durationMs);
  const hit = (list: readonly number[] | undefined, within: number) => {
    const found = last(list, ms);
    return found && ms - found.at < within ? { since: ms - found.at, index: found.index } : null;
  };
  /** A slow drift and lean, so no picture ever stands still (the pattern interrupt: nothing static for three seconds). */
  const drift = (amount: number, lean = 0) => {
    frame.shiftX += amount * wobble(t * 0.4, seed);
    frame.shiftY += amount * 0.75 * wobble(t * 0.35, seed + 1);
    frame.rotate += lean * wobble(t * 0.3, seed + 2);
  };
  /** A micro zoom in on each kick, harder when the music is: every take moves with the bass. */
  const kickZoom = (amount: number) => {
    const kick = hit(music?.kicksMs, PUNCH_MS * 3);
    if (kick) frame.zoom += amount * Math.exp(-kick.since / PUNCH_MS) * (0.45 + 0.55 * energy);
  };
  /** A flash on the snares while the music is hard, never more than three a second. */
  const snareFlash = (amount: number, tint?: (n: number) => readonly [number, number, number]) => {
    if (energy < 0.5 || music?.dropsMs?.some(drop => Math.abs(drop - ms) < PULSE_GAP_MS)) return;
    const snare = hit(spaced(music?.snaresMs, PULSE_GAP_MS), FLASH_MS);
    if (!snare) return;
    frame.flash = amount;
    if (tint) frame.flashTint = tint(snare.index);
  };
  const leakOn = (moments: readonly number[], strength: number, lengthMs = LEAK_MS) => {
    const leak = moments.map(at => ms - at).find(since => since >= 0 && since < lengthMs);
    if (leak === undefined) return;
    frame.leak = Math.max(frame.leak, Math.sin(Math.PI * (leak / lengthMs)) ** 1.5 * strength);
    frame.leakX = 0.15 + 0.7 * (leak / lengthMs);
  };

  if (preset === 'kodak') {
    if (take.endsWith('push')) {
      // A slow push in over each piece, as if the camera crept towards them.
      frame.zoom = 1.03 + 0.07 * along;
      drift(0.003);
    } else {
      // Handheld: a gentle drift and lean.
      frame.zoom = 1.06;
      drift(0.011, 0.006);
    }
    kickZoom(0.012);
    leakOn(leakMoments(music), 1);
  } else if (preset === 'vhs') {
    frame.zoom = 1.03;
    drift(0.004);
    kickZoom(0.012);
    // A heavy bass hit shakes the tape for two frames.
    const jolt = hit(music?.heavyMs, JITTER_MS);
    if (jolt) {
      frame.shiftX += (chance(seed, jolt.index * 2) - 0.5) * 0.012;
      frame.shiftY += (chance(seed, jolt.index * 2 + 1) - 0.5) * 0.008;
      frame.tear = 1;
    }
    if (take === 'rec') frame.rec = recDisplay(ms, seed);
  } else if (preset === 'strobe') {
    // A punch in on each kick, harder when the music is.
    frame.zoom = 1.03;
    drift(0.004);
    kickZoom(0.075);
    // A two-frame flash on each drop, and on the bars while the music is hard.
    const drop = hit(music?.dropsMs, FLASH_MS);
    const bar = energy >= 0.6 ? hit(music?.downbeatsMs, FLASH_MS) : null;
    if (drop || bar) frame.flash = (take.endsWith('black') ? -1 : 1) * (drop ? 1 : 0.85);
  } else if (preset === 'y2k') {
    frame.zoom = 1.03;
    drift(0.004);
    kickZoom(0.02);
    const behind = last(cutsMs, ms);
    if (take === 'zoom') {
      // Each new picture starts close and pulls back, blurred towards the middle.
      if (behind && ms - behind.at < ZOOM_MS) {
        const k = 1 - ease((ms - behind.at) / ZOOM_MS);
        frame.zoom += 0.3 * k;
        frame.zoomBlur = 0.05 * k;
      }
    } else {
      whipBetween(frame, cutsMs, ms);
    }
  } else if (preset === 'golden') {
    if (take === 'live') {
      // Handheld at the session, breathing in and out.
      frame.zoom = 1.05 + 0.008 * Math.sin(t * 1.6 + seed);
      drift(0.008, 0.004);
    } else if (take === 'haze') {
      // Lingering: the slowest push, the edges soft.
      frame.zoom = 1.04 + 0.03 * along;
      drift(0.004);
    } else {
      // The verse pushes in 2% over each piece; the chorus lift flares on each bar while the music is up.
      frame.zoom = 1.03 + 0.02 * along;
      drift(0.003);
      if (take === 'bloom' && energy >= 0.45) leakOn(music?.downbeatsMs ?? [], 0.35, 700);
    }
    kickZoom(take === 'bloom' ? 0.014 : 0.006);
    leakOn(leakMoments(music), 0.7);
  } else if (preset === 'baile') {
    // The lens bounces on every kick.
    const kick = hit(music?.kicksMs, BOUNCE_MS * 3);
    const bounce = kick ? Math.exp(-kick.since / BOUNCE_MS) : 0;
    frame.zoom = 1.04 + 0.09 * bounce * (0.5 + 0.5 * energy);
    frame.shiftY = -0.012 * bounce;
    if (take === 'fisheye') {
      // From low down, looking up, the lens tilted.
      frame.shiftY += 0.035;
      frame.rotate = 0.025 + 0.01 * wobble(t * 0.5, seed);
      drift(0.006);
    } else if (take === 'street') {
      // A phone in a hand in the crowd: fast shake, and each jump-cut reframed closer or wider on the same shot.
      frame.zoom += index % 2 === 0 ? 0 : 0.09;
      frame.shiftX += 0.012 * wobble(t * 3.2, seed);
      frame.shiftY += 0.009 * wobble(t * 2.8, seed + 1);
      frame.rotate = 0.008 * wobble(t * 2.5, seed + 2);
    } else {
      drift(0.005);
      if (take === 'whip') whipBetween(frame, onBars(cutsMs, music?.downbeatsMs), ms);
      if (take === 'neon') snareFlash(0.6, n => RGB[n % RGB.length]);
    }
  } else if (preset === 'afterhours') {
    frame.zoom = take === 'drag' ? 1.06 : 1.05;
    drift(take === 'drag' ? 0.01 : 0.006, take === 'drag' ? 0.005 : 0);
    // On each kick the light drags sideways behind it, as on a long shutter.
    const kick = hit(music?.kicksMs, DRAG_MS * 3);
    const drag = take === 'magenta' ? 0.02 : 0.04;
    frame.whipBlur = (kick ? drag * Math.exp(-kick.since / DRAG_MS) : 0) + (take === 'cyan' ? 0.01 : 0);
    if (take === 'magenta') {
      // The peak drop: a zoom pulse on every kick and warm flash bursts while the music is hard.
      kickZoom(0.06);
      if (energy >= 0.55 && hit(spaced(music?.kicksMs, PULSE_GAP_MS), FLASH_MS)) {
        frame.flash = 0.45;
        frame.flashTint = AMBER;
      }
    } else {
      kickZoom(0.015);
    }
  } else if (preset === 'super8') {
    // Handheld at a stroll; the acoustic take sways gently; in the gate the film weaves a little every frame.
    frame.zoom = 1.04;
    if (take === 'dust') {
      drift(0.006);
      frame.rotate = 0.008 * Math.sin(t * 0.7 + seed);
    } else {
      drift(0.01, 0.005);
    }
    if (frame.look.gate) frame.shiftY += (chance(seed, Math.floor(ms / FRAME_MS)) - 0.5) * 0.004;
    kickZoom(0.008);
    leakOn(leakMoments(music), 1);
    // The golden road burns a warm leak through every cut.
    if (take === 'road') leakOn(cutsMs.map(cut => cut - 250), 0.55, 700);
  } else if (preset === 'dreamy') {
    // A slow Ken Burns drift over each piece, each piece another way.
    const angle = chance(seed, index) * Math.PI * 2;
    frame.zoom = 1.05 + 0.06 * along;
    frame.shiftX = Math.cos(angle) * 0.018 * (along - 0.5);
    frame.shiftY = Math.sin(angle) * 0.018 * (along - 0.5);
    kickZoom(0.006);
  } else if (preset === 'mono') {
    frame.zoom = 1.05;
    // The camera shakes on each bass hit.
    const jolt = take === 'cctv' ? null : hit(music?.heavyMs, SHAKE_MS);
    if (jolt) {
      const k = 1 - jolt.since / SHAKE_MS;
      const wiggle = Math.sin(jolt.since / 18);
      frame.shiftX = (chance(seed, jolt.index * 3) - 0.5) * 0.028 * k * wiggle;
      frame.shiftY = (chance(seed, jolt.index * 3 + 1) - 0.5) * 0.022 * k * wiggle;
      frame.rotate = (chance(seed, jolt.index * 3 + 2) - 0.5) * 0.02 * k * wiggle;
    }
    if (take === 'punch') {
      // The drill and metal drop: a micro punch in on each kick, white strobe frames on the snare, and on each drop.
      kickZoom(0.06);
      drift(0.003);
      snareFlash(0.9);
      if (hit(music?.dropsMs, FLASH_MS)) frame.flash = 1;
    } else if (take === 'ghost') {
      // The warehouse: a hypnotic slow zoom, light trailing behind the kicks as on a long shutter.
      frame.zoom = 1.04 + 0.06 * along;
      drift(0.004);
      const kick = hit(music?.kicksMs, DRAG_MS * 3);
      frame.zoomBlur = 0.012 + 0.012 * energy + (kick ? 0.02 * Math.exp(-kick.since / DRAG_MS) : 0);
      frame.whipBlur = kick ? 0.025 * Math.exp(-kick.since / DRAG_MS) : 0;
      kickZoom(0.01);
    } else if (take === 'cctv') {
      // A camera on the wall, panning slowly across the room.
      frame.zoom = 1.08;
      frame.shiftX = 0.025 * Math.sin(t * 0.22 + seed);
      kickZoom(0.008);
      frame.rec = cctvDisplay(ms, seed);
    } else {
      // Baseline noir: a slow push over each piece.
      frame.zoom += 0.02 * along;
      drift(0.004);
      kickZoom(0.012);
    }
  }
  if (preset === 'strobe' || preset === 'y2k' || preset === 'baile') {
    // The club and party cuts: the lens pulses on each heavy bass hit, harder when the music is.
    const bass = hit(spaced(music?.heavyMs, PULSE_GAP_MS), PULSE_MS);
    if (bass) frame.pulse = (1 - bass.since / PULSE_MS) ** 2 * (0.5 + 0.5 * energy);
  }
  return frame;
}

/** Treatments that cut the picture into panels or set it in a frame of their own: a Super 8 gate would be drawn inside every panel. */
const FRAMED_TREATMENTS = ['triptych', 'collage', 'bento', 'frame', 'sideways', 'typewriter', 'screenshot'];

/** The preset's frame under a treatment: no second fisheye on Fisheye, and no gate where the treatment frames the picture itself. */
export function fitTreatment(frame: PresetFrame, treatment: string | undefined): PresetFrame {
  const barrel = treatment === 'fisheye' ? 0 : frame.look.barrel;
  const gate = treatment && FRAMED_TREATMENTS.includes(treatment) ? 0 : frame.look.gate;
  return barrel === frame.look.barrel && gate === frame.look.gate ? frame : { ...frame, look: { ...frame.look, barrel, gate } };
}
