/**
 * Broken Screen: a phone's LCD dying a block at a time, on the beat, while the video plays in what is left of it.
 *   1. The screen is horizontal bands of very mismatched heights, from a hairline to a thick strip, the full width and with no seam,
 *      the way a panel tears. A broken band either tears sideways with its colours split, smears one row of pixels down itself, holds
 *      the frame of the last hit (frozen), or dies into lines.
 *   2. A dead band is razor-thin vertical lines of pure cyan, magenta, lime, red and blue with thin black gaps.
 *   3. Pitch-black ink spills where the liquid crystal leaked: organic, growing on hits, edged inside with a thin silver crack.
 *   4. Hairline spiderweb cracks from two or three impact points, over everything.
 * The last hit, a second before the end, kills every band left: the video is gone for the closing second.
 * The variant decides where it starts. Preview and cloud render share this code.
 */
import { FRAME_UV, NOISE } from './treatment-filter';

const BANDS = 16;
/** One hit per band. */
export const BROKEN_HITS = BANDS;

const each = (count: number, line: (index: number) => string) => Array.from({ length: count }, (_, index) => line(index)).join('\n');
/** `name` + index from an if-chain (the shader language here has no arrays of uniforms). */
const pickOf = (fn: string, name: string, count: number) => `float ${fn}(float at) {
${each(count - 1, index => `  if (at < ${index}.5) return ${name}${index};`)}
  return ${name}${count - 1};
}`;

export const BROKEN = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uFrozen;
uniform float uStage;
uniform float uAge;
uniform float uSeed;
uniform float uMode;
uniform float uAspect;
uniform float uTime;
uniform float uHasFrozen;
${each(BANDS, index => `uniform float uO${index};`)}
${each(BANDS - 1, index => `uniform float uB${index};`)}
${FRAME_UV}
${NOISE}
const vec2 PX = vec2(1080.0, 1920.0);
const float HITS = ${BROKEN_HITS}.0;
${pickOf('orderOf', 'uO', BANDS)}
${pickOf('bandEdge', 'uB', BANDS - 1)}
float bandAt(float y) {
${each(BANDS - 1, index => `  if (y < uB${index}) return ${index}.0;`)}
  return ${BANDS - 1}.0;
}

float fbm(vec2 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.1 + 7.0) + 0.15 * noise(p * 4.3 + 13.0); }

/** Razor-thin lines of pure colour, a pixel or two each, with thin black gaps; each band's lines sit a little off its neighbour's. */
vec3 deadLines(vec2 n, float block) {
  float x = floor(n.x * PX.x) + block * 7.0;
  float h = hash(vec2(x, uSeed + block * 0.01));
  float run = hash(vec2(floor(x / 3.0), uSeed + 5.0));
  vec3 ink = h < 0.2 ? vec3(0.0, 1.0, 1.0) : h < 0.4 ? vec3(1.0, 0.0, 1.0) : h < 0.58 ? vec3(0.45, 1.0, 0.0) : h < 0.74 ? vec3(1.0, 0.05, 0.05) : vec3(0.1, 0.25, 1.0);
  ink = run > 0.97 ? vec3(1.0) : ink;
  float gap = step(hash(vec2(x, uSeed + 9.0)), 0.36);
  float level = 0.82 + 0.18 * hash(vec2(x, floor(uTime * 12.0)));
  return ink * level * (1.0 - gap);
}

/** How far inside an ink spill a point is (above 0 inside), the spill centred at at, of size r, its edge organic. */
float spill(vec2 q, vec2 at, float r, float salt) {
  vec2 d = (q - at) * vec2(1.0, uAspect);
  if (length(d) > r * 1.35) return -1.0;
  float edge = r * (0.7 + 0.6 * fbm(d * 5.0 / max(r, 0.05) + salt));
  return edge - length(d);
}

/** Hairline cracks from one impact point, in pixels: jagged spokes, the odd branch, and broken rings between spokes near the hit. */
float cracks(vec2 q, vec2 at, float reach, float salt) {
  vec2 d = (q - at) * PX;
  float r = length(d);
  if (r > reach) return 0.0;
  float a = atan(d.y, d.x) + 3.14159265;
  const float SPOKES = 17.0;
  float line = 0.0;
  float sector = floor(a / 6.2831853 * SPOKES);
  for (int o = 0; o <= 1; o++) {
    float s = sector + float(o);
    float centre = (s + 0.5 * (hash(vec2(s, salt)) - 0.5)) / SPOKES * 6.2831853;
    float bend = (noise(vec2(r * 0.012, s * 3.0 + salt)) - 0.5) * 0.18 + (noise(vec2(r * 0.06, s + salt)) - 0.5) * 0.03;
    float span = reach * (0.35 + 0.65 * hash(vec2(s + 3.0, salt)));
    float across = abs(sin(a - centre - bend)) * r;
    float width = 0.55 + 1.2 * exp(-r / 40.0);
    line = max(line, (1.0 - smoothstep(width * 0.4, width, across)) * step(r, span) * (0.6 + 0.4 * noise(vec2(r * 0.05, s))));
    // A branch leaves some spokes partway out.
    float from = span * (0.3 + 0.3 * hash(vec2(s, salt + 1.0)));
    float turn = (hash(vec2(s, salt + 2.0)) - 0.5) * 0.9;
    vec2 dir = vec2(cos(centre + turn), sin(centre + turn));
    vec2 start = vec2(cos(centre), sin(centre)) * from;
    vec2 rel = vec2(cos(a), sin(a)) * r - start;
    float along = dot(rel, dir);
    float side = abs(rel.x * dir.y - rel.y * dir.x) + (noise(vec2(along * 0.03, s + salt)) - 0.5) * 3.0;
    line = max(line, (1.0 - smoothstep(0.25, 0.7, side)) * step(0.0, along) * step(along, span * 0.4) * step(0.5, hash(vec2(s, salt + 4.0))) * 0.8);
  }
  // Broken rings between spokes, close to the hit.
  for (int g = 0; g < 3; g++) {
    float ring = 30.0 + 45.0 * float(g) + 25.0 * float(g * g);
    float wob = ring * (0.9 + 0.2 * hash(vec2(sector, salt + float(g))));
    float on = step(0.4, hash(vec2(sector * 3.0 + float(g), salt + 6.0)));
    line = max(line, (1.0 - smoothstep(0.3, 0.8, abs(r - wob))) * on * 0.75);
  }
  // The crushed glass where it was hit.
  line = max(line, (1.0 - smoothstep(3.0, 9.0, r)) * (0.5 + 0.5 * step(0.5, noise(d * 0.8))));
  return line;
}

void main(void) {
  vec2 m = frameMax();
  vec2 n = vTextureCoord / m;
  vec3 colour = texture(uTexture, n * m).rgb;

  // 1. Which band this is.
  float block = bandAt(n.y);
  float order = orderOf(block);
  float kind = hash(vec2(block, uSeed + 31.0));
  bool pixels = uMode > 2.5;
  // The band just hit flickers in for a few frames.
  bool flicker = order >= uStage - 1.0 && uAge < 160.0 && hash(vec2(floor(uAge / 40.0), block)) < 0.4;
  if (order < uStage && !flicker) {
    float top = block < 0.5 ? 0.0 : bandEdge(block - 1.0);
    float tall = (block > ${BANDS - 1.5} ? 1.0 : bandEdge(block)) - top;
    // Only thin strips die into lines, as on a real panel; a wide stretch keeps showing a torn picture until the last hit.
    bool dead = uStage >= HITS || (pixels ? tall < 0.07 && kind < 0.85 : tall < 0.035 && kind < 0.75);
    if (dead) {
      colour = deadLines(n, block);
    } else if (kind < 0.4 && tall < 0.09 && !pixels) {
      // One row of pixels smeared down the whole band, the way a stuck line drags.
      colour = texture(uTexture, vec2(n.x, top + 1.5 / PX.y) * m).rgb;
    } else if (kind < 0.85 || uHasFrozen < 0.5 || pixels) {
      // Torn sideways 15 to 70 pixels, its red and blue pulled a little apart.
      float amount = (15.0 + 55.0 * hash(vec2(block, uSeed + 41.0))) * (hash(vec2(block, uSeed + 43.0)) < 0.5 ? -1.0 : 1.0) / PX.x;
      float split = (2.0 + 4.0 * hash(vec2(block, uSeed + 47.0))) / PX.x;
      colour = vec3(
        texture(uTexture, vec2(fract(n.x + amount + split), n.y) * m).r,
        texture(uTexture, vec2(fract(n.x + amount), n.y) * m).g,
        texture(uTexture, vec2(fract(n.x + amount - split), n.y) * m).b);
    } else {
      // Frozen on the frame of the last hit.
      colour = texture(uFrozen, n).rgb;
    }
    if (order >= uStage - 1.0) colour += 0.15 * exp(-uAge / 90.0);
  }

  // 3. Ink spills: one from an early hit, one later, each growing on every hit after it; their edge cracked silver inside.
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float starts = pixels ? 1.0 + fi * 4.0 : 3.0 + fi * 5.0;
    if (uStage <= starts) continue;
    vec2 at = i == 0 ? vec2(0.22, 0.17) : vec2(0.5, 0.74);
    if (uMode > 0.5 && uMode < 1.5 && i == 0) at = vec2(0.15, 0.85);
    at += (vec2(hash(vec2(fi, uSeed + 51.0)), hash(vec2(fi, uSeed + 53.0))) - 0.5) * vec2(0.16, 0.08);
    float grown = uStage - starts - 1.0 + (1.0 - exp(-uAge / 180.0));
    float r = min(0.05 + 0.014 * grown, 0.17) * (pixels ? 1.2 : 1.0);
    float inside = spill(n, at, r, uSeed + fi * 17.0);
    float silver = (1.0 - smoothstep(0.0012, 0.0024, abs(inside - 0.004))) * step(0.42, noise(n * vec2(60.0, 106.0) + fi));
    colour = mix(colour, vec3(0.0), smoothstep(0.0, 0.0015, inside));
    colour = mix(colour, vec3(0.86, 0.9, 0.95), silver * 0.85);
  }

  // 4. Hairline cracks from the impact points, over everything.
  float crack = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float lands = fi == 0.0 ? 0.0 : fi == 1.0 ? 6.0 : 10.0;
    if (uStage <= lands || (fi > 1.5 && uMode < 1.5)) continue;
    vec2 at = i == 0 ? vec2(0.1, 0.07) : i == 1 ? vec2(0.86, 0.9) : vec2(0.5, 0.45);
    if (uMode > 1.5 && uMode < 2.5 && i == 0) at = vec2(0.5, 0.42);
    if (uMode > 1.5 && uMode < 2.5 && i == 2) at = vec2(0.12, 0.08);
    if (uMode > 0.5 && uMode < 1.5 && i == 0) at = vec2(0.1, 0.93);
    at += (vec2(hash(vec2(fi, uSeed + 61.0)), hash(vec2(fi, uSeed + 63.0))) - 0.5) * 0.06;
    float grow = uStage - 1.0 <= lands ? 1.0 - pow(1.0 - clamp(uAge / 200.0, 0.0, 1.0), 3.0) : 1.0;
    crack = max(crack, cracks(n, at, (520.0 + 260.0 * hash(vec2(fi, uSeed + 67.0))) * grow, uSeed + fi * 11.0));
  }
  colour = mix(colour, vec3(0.95, 0.97, 1.0), clamp(crack, 0.0, 1.0) * 0.92);
  finalColor = vec4(colour, 1.0);
}
`;

/** Where it starts (`mode` in the shader): all over, from a corner, from the middle, or a dying screen of lines and ink only. */
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

/** Edges that cut 0..1 into `count` bands of very mismatched heights: mostly thin, a few thick, none thinner than a few pixels. */
function cuts(count: number, salt: number): number[] {
  const sizes = Array.from({ length: count }, (_, index) => 0.05 + 2.4 * pick(index + salt, salt * 0.37 + 1) ** 3);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  let at = 0;
  return sizes.slice(0, -1).map((size) => (at += size / total));
}

/**
 * The screen's bands for this seed and variant, as the shader's uniforms: their edges from the top (uB*), and each band's place in
 * the order they break (uO*: 0 breaks on the first hit). Shattered and dead pixels break at random, a corner hit from the bottom up,
 * a spider web from the middle out.
 */
export function brokenBlocks(mode: number, seed: number): Record<string, number> {
  const edges = cuts(BANDS, seed + 0.5);
  const keys = Array.from({ length: BANDS }, (_, index) => {
    const middle = ((edges[index - 1] ?? 0) + (edges[index] ?? 1)) / 2;
    const jitter = pick(index + seed * 1.7, seed * 0.3 + 5);
    if (mode === 1) return 1 - middle + jitter * 0.3;
    if (mode === 2) return Math.abs(middle - 0.45) + jitter * 0.3;
    return jitter;
  });
  const ranked = keys.map((key, index) => ({ key, index })).sort((a, b) => a.key - b.key || a.index - b.index);
  const uniforms: Record<string, number> = {};
  ranked.forEach(({ index }, place) => { uniforms[`uO${index}`] = place; });
  edges.forEach((edge, index) => { uniforms[`uB${index}`] = edge; });
  return uniforms;
}

/** The screen is whole for the opening moment, so the first hit is seen landing; the last hit kills the screen a second before the end. */
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

/** How many hits have landed by `ms`, and how long ago the last one was. */
export function brokenStage(ms: number, hitsMs: readonly number[]): { stage: number; ageMs: number } {
  let stage = 0;
  while (stage < hitsMs.length && hitsMs[stage] <= ms) stage++;
  return { stage, ageMs: stage ? ms - hitsMs[stage - 1] : 1e6 };
}
