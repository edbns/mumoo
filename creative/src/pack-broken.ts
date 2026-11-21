/**
 * Broken Screen: the phone's screen breaks a part more on every hit, on the beat, while the video keeps playing in what is left of it.
 * The screen is cut into patches (a jittered grid, each patch overhanging its neighbours); each hit kills one patch: dead columns of
 * colour, black bleed, a torn copy of the picture, or a washed-out panel, with cracks running from where it was hit. The last patch
 * dies a second before the end, so the video is gone for the closing second. The variant decides where the damage starts.
 * Preview and cloud render share this code.
 */
import { FRAME_UV, NOISE } from './treatment-filter';

export const BROKEN_COLS = 3;
export const BROKEN_ROWS = 5;
/** One hit per patch. */
export const BROKEN_HITS = BROKEN_COLS * BROKEN_ROWS;

export const BROKEN = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uStage;
uniform float uAge;
uniform float uSeed;
uniform float uMode;
uniform float uAspect;
uniform float uTime;
${Array.from({ length: BROKEN_HITS }, (_, index) => `uniform float uO${index};`).join('\n')}
${FRAME_UV}
${NOISE}
const float COLS = ${BROKEN_COLS}.0;
const float ROWS = ${BROKEN_ROWS}.0;
const vec2 PX = vec2(1080.0, 1920.0);

/** The patch's place in the order the screen dies (see \`brokenOrder\`): 0 dies on the first hit. */
float orderOf(vec2 c) {
  float at = c.x + c.y * COLS;
${Array.from({ length: BROKEN_HITS - 1 }, (_, index) => `  if (at < ${index}.5) return uO${index};`).join('\n')}
  return uO${BROKEN_HITS - 1};
}

/** A patch's rectangle (min.xy, max.xy): its cell, overhanging its neighbours by a random amount on each side. */
vec4 rectOf(vec2 c) {
  vec2 lo = c / vec2(COLS, ROWS);
  vec2 hi = (c + 1.0) / vec2(COLS, ROWS);
  vec4 over = vec4(hash(c + 3.1 + uSeed), hash(c + 5.3 + uSeed), hash(c + 7.7 + uSeed), hash(c + 9.9 + uSeed));
  return vec4(lo - over.xy * vec2(0.13, 0.07), hi + over.zw * vec2(0.13, 0.07));
}

/** A screen colour a dead column sticks at. */
vec3 deadColour(float h) {
  if (h < 0.16) return vec3(1.0, 0.12, 0.2);
  if (h < 0.32) return vec3(0.1, 0.95, 0.35);
  if (h < 0.48) return vec3(0.2, 0.35, 1.0);
  if (h < 0.6) return vec3(0.95, 0.2, 0.95);
  if (h < 0.72) return vec3(0.15, 0.95, 1.0);
  if (h < 0.8) return vec3(1.0, 0.9, 0.25);
  if (h < 0.9) return vec3(0.95);
  return vec3(0.0);
}

/** Dense dead columns of colour, a few pixels each, flickering, torn sideways in a few bands. show lets some of the picture through. */
vec3 columns(vec2 n, float ps, vec3 picture, float show) {
  vec2 p = n * PX;
  float band = floor(p.y / (60.0 + 140.0 * hash(vec2(ps, 2.0))));
  float tear = step(0.8, hash(vec2(band, ps))) * floor(hash(vec2(band, ps + 1.0)) * 40.0);
  // Columns one to four pixels wide, now and then a wide bright one.
  float x = p.x + tear * 3.0;
  float col = floor(x / (1.0 + floor(hash(vec2(floor(x / 9.0), ps + 4.0)) * 4.0)));
  float h = hash(vec2(col, ps));
  vec3 ink = deadColour(fract(h * 7.31 + ps));
  float wide = step(0.94, hash(vec2(floor(x / 16.0), ps + 6.0)));
  ink = mix(ink, vec3(0.75, 0.95, 1.0), wide * 0.8);
  float glow = (0.7 + 0.3 * noise(vec2(col * 0.37, n.y * 3.0 + ps * 9.0))) * (0.88 + 0.12 * sin(uTime * 23.0 + h * 40.0));
  // Many columns are dark: the black gaps between the lit ones show a little of the dying picture.
  float lit = max(step(0.42, hash(vec2(col, ps + 3.0))), wide);
  return mix(picture * show, ink * glow * 1.15, lit);
}

void main(void) {
  vec2 m = frameMax();
  vec2 n = vTextureCoord / m;
  float fresh = exp(-uAge / 120.0) * step(0.5, uStage);
  vec2 q = clamp(n + vec2(sin(uAge * 0.11), cos(uAge * 0.17)) * 0.008 * fresh, 0.0, 1.0);
  vec3 picture = texture(uTexture, q * m).rgb;
  vec3 colour = picture;

  // The newest dead patch over this pixel (the latest hit wins where patches overlap).
  vec2 cell = clamp(floor(q * vec2(COLS, ROWS)), vec2(0.0), vec2(COLS - 1.0, ROWS - 1.0));
  float best = -1.0;
  vec2 bestCell = vec2(0.0);
  vec4 bestRect = vec4(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 c = cell + vec2(float(dx), float(dy));
      if (c.x < 0.0 || c.y < 0.0 || c.x > COLS - 1.0 || c.y > ROWS - 1.0) continue;
      float order = orderOf(c);
      if (order >= uStage || order <= best) continue;
      vec4 r = rectOf(c);
      if (q.x < r.x || q.y < r.y || q.x > r.z || q.y > r.w) continue;
      best = order;
      bestCell = c;
      bestRect = r;
    }
  }
  // The patch just hit flickers on before it stays.
  if (best >= 0.0 && best >= uStage - 1.0 && uAge < 200.0 && hash(vec2(floor(uAge / 35.0), best)) < 0.35) best = -1.0;

  if (best >= 0.0) {
    float ps = hash(bestCell + uSeed * 0.77) * 100.0;
    float kind = hash(vec2(ps, 11.0));
    bool pixels = uMode > 2.5;
    if (pixels ? kind < 0.72 : kind < 0.5) {
      colour = columns(q, ps, picture, 0.18);
    } else if (!pixels && kind < 0.75) {
      // A torn copy of the picture, shifted and enlarged, split into its colours, under sparse dead columns.
      vec2 shift = (vec2(hash(vec2(ps, 21.0)), hash(vec2(ps, 23.0))) - 0.5) * vec2(0.5, 0.3);
      vec2 torn = fract((q - 0.5) / 1.25 + 0.5 + shift);
      vec3 copy = vec3(texture(uTexture, torn * m).r, texture(uTexture, fract(torn + vec2(0.006, 0.0)) * m).g, texture(uTexture, fract(torn - vec2(0.006, 0.0)) * m).b);
      copy = mix(copy, copy * vec3(0.5, 1.1, 1.25), 0.5);
      vec3 lines = columns(q, ps + 50.0, copy, 0.6);
      colour = mix(copy, lines, step(0.55, hash(vec2(floor(q.x * PX.x / 3.0), ps + 9.0))));
    } else if (pixels || kind < 0.88) {
      // Black bleed, rimmed with stray colour, its edge ragged.
      float rim = (noise(q * vec2(7.0, 12.0) + ps) - 0.5) * 0.09 + (noise(q * vec2(40.0, 70.0) + ps) - 0.5) * 0.02;
      vec2 inner = min(q - bestRect.xy, bestRect.zw - q) * vec2(1.0, uAspect);
      float depth = min(inner.x, inner.y) - 0.03 + rim;
      vec3 stray = deadColour(hash(vec2(floor(q.x * PX.x / 3.0), ps + 8.0)));
      colour = mix(columns(q, ps, picture, 0.1), stray * 0.8, smoothstep(-0.004, 0.0, depth) * 0.6);
      colour = mix(colour, vec3(0.0), smoothstep(0.0, 0.004, depth));
    } else {
      // A washed-out panel, nearly white, with faint columns.
      colour = mix(vec3(0.9, 0.92, 0.95), columns(q, ps, picture, 0.5), 0.12);
    }
    // A hard black seam along the patch's top and bottom edge, as where a panel stops.
    float seam = min(abs(q.y - bestRect.y), abs(q.y - bestRect.w)) * PX.y;
    colour = mix(colour, vec3(0.0), (1.0 - smoothstep(2.0, 5.0, seam)) * step(0.4, hash(vec2(ps, 31.0))));
  }

  // Cracks, from where some of the patches were hit, over everything (the web keeps more of them).
  float crack = 0.0;
  float most = uMode > 1.5 && uMode < 2.5 ? 6.0 : 4.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= most) break;
    float hitOrder = floor(fi * ${BROKEN_HITS}.0 / most);
    if (hitOrder >= uStage) break;
    vec2 at = vec2(0.15 + 0.7 * hash(vec2(fi, uSeed + 1.0)), 0.1 + 0.8 * hash(vec2(fi, uSeed + 2.0)));
    if (uMode > 1.5 && uMode < 2.5 && i == 0) at = vec2(0.5, 0.45);
    float grow = hitOrder >= uStage - 1.0 ? 1.0 - pow(1.0 - clamp(uAge / 220.0, 0.0, 1.0), 3.0) : 1.0;
    vec2 d = (q - at) * vec2(1.0, uAspect);
    float r = length(d);
    float a = atan(d.y, d.x) + 3.14159265;
    float spokes = 14.0;
    float sector = floor(a / 6.2831853 * spokes);
    float reach = (0.2 + 0.4 * hash(vec2(sector, fi + uSeed))) * grow;
    float centreA = (sector + 0.5 + 0.7 * (hash(vec2(sector + 9.0, fi + uSeed)) - 0.5)) / spokes * 6.2831853;
    // A crack runs jagged, not straight.
    float bend = (noise(vec2(r * 14.0, sector * 3.0 + fi * 7.0)) - 0.5) * 0.22 + (noise(vec2(r * 60.0, sector + fi)) - 0.5) * 0.05;
    float across = abs(sin(a - centreA - bend)) * r;
    float width = 0.001 * (1.0 + 1.5 * exp(-r * 20.0));
    crack = max(crack, (1.0 - smoothstep(width * 0.3, width, across)) * step(r, reach) * (0.55 + 0.45 * noise(vec2(r * 40.0, sector))));
    // Rings between the spokes, near the hit.
    float ring = abs(r - (0.04 + 0.05 * hash(vec2(sector, fi + 3.0))));
    crack = max(crack, (1.0 - smoothstep(0.0004, 0.0012, ring)) * step(r, reach) * step(0.45, hash(vec2(sector, fi + 5.0))));
    crack = max(crack, (1.0 - smoothstep(0.003, 0.008 * grow + 0.001, r)) * 0.9);
  }
  colour = mix(colour, vec3(0.94, 0.97, 1.0), clamp(crack, 0.0, 1.0) * 0.9);
  colour += fresh * 0.12;
  finalColor = vec4(colour, 1.0);
}
`;

/** Where the damage starts (`mode` in the shader): all over, from a corner, from the middle, or a dying screen with no torn picture. */
export const BROKEN_LOOK: Record<string, { mode: number }> = {
  shatter: { mode: 0 },
  corner: { mode: 1 },
  spider: { mode: 2 },
  pixels: { mode: 3 },
};

/** A number from 0 to 1 that stays the same for the same inputs. */
const pick = (a: number, b: number) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The order the patches die in, as each patch's place (by cell, row after row): shattered and dead pixels at random, a corner hit from
 * one corner across, a spider web from the middle out. The same seed always gives the same order.
 */
export function brokenOrder(mode: number, seed: number, aspect: number): number[] {
  const corner = [pick(seed, 7) < 0.5 ? 0 : 1, pick(seed, 9) < 0.5 ? 0 : 1];
  const keys = Array.from({ length: BROKEN_HITS }, (_, index) => {
    const x = index % BROKEN_COLS;
    const y = Math.floor(index / BROKEN_COLS);
    const jitter = pick(x + seed * 1.7, y + seed * 0.3);
    const cx = (x + 0.5) / BROKEN_COLS;
    const cy = (y + 0.5) / BROKEN_ROWS;
    if (mode === 1) return Math.hypot(cx - corner[0], (cy - corner[1]) * aspect) + jitter * 0.35;
    if (mode === 2) return Math.hypot(cx - 0.5, (cy - 0.45) * aspect) + jitter * 0.3;
    return jitter;
  });
  const ranked = keys.map((key, index) => ({ key, index })).sort((a, b) => a.key - b.key || a.index - b.index);
  const order = new Array<number>(BROKEN_HITS);
  ranked.forEach(({ index }, place) => { order[index] = place; });
  return order;
}

/** The screen is whole for the opening moment, so the first hit is seen landing; the last patch dies a second before the end. */
const FIRST_HIT_MS = 700;
const LAST_HIT_MS = 14_000;
/** A hit moves to a beat this close to when it is due. */
const SNAP_MS = 350;
const CLOSEST_MS = 250;

/** When each of the screen's hits lands: spread evenly from the opening to a second before the end, each moved onto the nearest beat. */
export function brokenHitsMs(beatsMs: readonly number[]): number[] {
  const hits: number[] = [];
  for (let index = 0; index < BROKEN_HITS; index++) {
    const due = FIRST_HIT_MS + ((LAST_HIT_MS - FIRST_HIT_MS) * index) / (BROKEN_HITS - 1);
    const after = (hits.at(-1) ?? -Infinity) + CLOSEST_MS;
    let at = Math.max(due, after);
    let nearest = Infinity;
    for (const beat of beatsMs) {
      if (beat >= after && beat <= LAST_HIT_MS && Math.abs(beat - due) <= SNAP_MS && Math.abs(beat - due) < Math.abs(nearest - due)) nearest = beat;
    }
    if (Number.isFinite(nearest)) at = nearest;
    hits.push(Math.min(at, LAST_HIT_MS));
  }
  return hits;
}

/** How many patches have died by `ms`, and how long ago the last hit was. */
export function brokenStage(ms: number, hitsMs: readonly number[]): { stage: number; ageMs: number } {
  let stage = 0;
  while (stage < hitsMs.length && hitsMs[stage] <= ms) stage++;
  return { stage, ageMs: stage ? ms - hitsMs[stage - 1] : 1e6 };
}
