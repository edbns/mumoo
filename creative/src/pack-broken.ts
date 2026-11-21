/**
 * Broken Screen: the phone's glass cracks a part more on every downbeat while the video keeps playing under it. Each blow
 * lands somewhere (the variant decides where), its cracks run out from it in a few frames, and the shards between them
 * bend the picture only a little, so the video stays clear. Preview and cloud render share this code.
 */
import { FRAME_UV, NOISE } from './treatment-filter';

export const BROKEN = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uStage;
uniform float uAge;
uniform float uSeed;
uniform float uMode;
uniform float uAspect;
${FRAME_UV}
${NOISE}
const float PI = 3.14159265;
const float SPOKES = 11.0;
const float STEP = 2.0 * PI / 11.0;

vec2 hitAt(float i) {
  float s = uSeed;
  // Dead pixels' first blow, where its screen bleeds, is low by a side: off the face, which sits high and in the middle.
  if (uMode > 2.5 && i < 0.5) return vec2(hash(vec2(s, 19.0)) < 0.5 ? 0.16 : 0.84, 0.8 + 0.1 * hash(vec2(s, 23.0)));
  if (uMode > 1.5 && uMode < 2.5) return vec2(0.38 + 0.24 * hash(vec2(s, 3.0)), 0.34 + 0.2 * hash(vec2(s, 5.0)));
  if (uMode > 0.5 && uMode < 1.5) {
    vec2 corner = vec2(step(0.5, hash(vec2(s, 7.0))), step(0.5, hash(vec2(s, 9.0))));
    vec2 across = (vec2(0.5) - corner) * (0.2 + 0.36 * i / 4.0);
    vec2 wander = (vec2(hash(vec2(i, s + 11.0)), hash(vec2(i, s + 13.0))) - 0.5) * 0.28;
    return clamp(corner + across + wander, vec2(0.06), vec2(0.94));
  }
  return vec2(0.14 + 0.72 * hash(vec2(i, s + 1.0)), 0.12 + 0.76 * hash(vec2(i, s + 2.0)));
}

float spokeAt(float j, float i) { return (j + 0.7 * (hash(vec2(mod(j, SPOKES), i * 7.0 + uSeed)) - 0.5)) * STEP; }
float spokeReach(float j, float i) { return 0.5 + 0.5 * hash(vec2(mod(j, SPOKES) + 31.0, i * 5.0 + uSeed)); }
float ringAt(float j, float ring, float i) { return (0.16 + 0.2 * ring + 0.06 * ring * ring) * (0.85 + 0.3 * hash(vec2(mod(j, SPOKES) * 3.0 + ring, i + uSeed * 2.0))); }
float wiggle(float r, float j, float i) {
  float k = mod(j, SPOKES) * 7.0 + i * 13.0;
  return (noise(vec2(r * 7.0, k)) - 0.5) * 0.006 + (abs(fract(r * 38.0 + hash(vec2(k, 2.0))) - 0.5) - 0.25) * 0.0022;
}
float segment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float side(vec2 p, vec2 a, vec2 b) { vec2 ba = b - a; vec2 pa = p - a; return ba.x * pa.y - ba.y * pa.x; }

void main(void) {
  vec2 m = frameMax();
  vec2 n = vTextureCoord / m;
  float fresh = exp(-uAge / 140.0) * step(0.5, uStage);
  vec2 q = n + vec2(sin(uAge * 0.09), cos(uAge * 0.13)) * 0.006 * fresh;
  float spider = uMode > 1.5 && uMode < 2.5 ? 1.0 : 0.0;
  float count = spider > 0.5 ? min(uStage, 1.0) : uStage;
  float line = 0.0;
  float halo = 0.0;
  float crush = 0.0;
  vec2 bend = vec2(0.0);
  float shade = 0.0;
  for (int k = 0; k < 6; k++) {
    float i = float(k);
    if (i >= count) break;
    float grow = i >= count - 1.0 ? 1.0 - pow(1.0 - clamp(uAge / 260.0, 0.0, 1.0), 3.0) : 1.0;
    float reach = spider > 0.5 ? 0.12 + 0.16 * (uStage - 1.0 + grow) : (0.45 + 0.3 * hash(vec2(i, uSeed + 17.0))) * grow;
    vec2 d = (q - hitAt(i)) * vec2(1.0, uAspect);
    float r = length(d);
    float a = atan(d.y, d.x);
    if (a < 0.0) a += 2.0 * PI;
    float nominal = floor(a / STEP);
    float sector = nominal - 1.0;
    for (int o = -1; o <= 2; o++) {
      float j = nominal + float(o);
      float sa = spokeAt(j, i);
      float across = sin(a - sa) * r - wiggle(r, j, i);
      if (across > 0.0) sector = max(sector, j);
      if (cos(a - sa) > 0.0 && r < reach * spokeReach(j, i)) {
        float w = 0.0012 * (1.0 + 1.5 * exp(-r * 12.0));
        float dist = abs(across);
        float catchLight = 0.5 + 0.5 * noise(vec2(r * 24.0, j * 3.0 + i));
        line = max(line, (1.0 - smoothstep(w * 0.3, w, dist)) * catchLight);
        halo = max(halo, 1.0 - smoothstep(w, w * 3.0, dist));
      }
    }
    float sa0 = spokeAt(sector, i);
    float sa1 = spokeAt(sector + 1.0, i);
    float band = 0.0;
    float closed = 0.0;
    for (int ring = 0; ring < 3; ring++) {
      float g = float(ring);
      float r0 = ringAt(sector, g, i);
      float r1 = ringAt(sector + 1.0, g, i);
      bool there = hash(vec2(mod(sector, SPOKES) * 5.0 + g, i + uSeed * 3.0)) < 0.7 && max(r0, r1) < reach * min(spokeReach(sector, i), spokeReach(sector + 1.0, i));
      if (!there) continue;
      vec2 a0 = vec2(cos(sa0), sin(sa0)) * r0;
      vec2 a1 = vec2(cos(sa1), sin(sa1)) * r1;
      float dist = segment(d, a0, a1);
      float w = 0.0011;
      float catchLight = 0.45 + 0.55 * noise(vec2(dot(d, vec2(30.0, 17.0)), g + i * 5.0));
      line = max(line, (1.0 - smoothstep(w * 0.3, w, dist)) * catchLight);
      halo = max(halo, 1.0 - smoothstep(w, w * 3.0, dist));
      bool outside = side(d, a0, a1) < 0.0;
      if (outside) band = g + 1.0;
      closed = outside ? 0.0 : 1.0;
    }
    if (closed > 0.5) {
      float shard = hash(vec2(mod(sector, SPOKES) + band * 17.0, i + uSeed));
      bend += (vec2(shard, hash(vec2(shard, 3.0))) - 0.5) * 0.006 / vec2(1.0, uAspect);
      shade += (shard - 0.45) * 0.09;
    }
    crush = max(crush, (1.0 - smoothstep(0.012, 0.03 * grow + 0.001, r)) * (0.45 + 0.55 * step(0.55, noise(d * 900.0))));
  }
  vec4 colour = texture(uTexture, clamp(q + bend, 0.0, 1.0) * m);
  colour.rgb *= 1.0 + shade;
  colour.rgb *= 1.0 - halo * 0.3;
  colour.rgb = mix(colour.rgb, vec3(0.93, 0.96, 1.0), clamp(line * 0.9 + crush * 0.75, 0.0, 1.0));
  if (uMode > 2.5 && uStage > 0.5) {
    // Dead pixels: the screen behind the glass bleeds black from the first blow, rimmed with stray colour, and columns stick.
    vec2 d = (q - hitAt(0.0)) * vec2(1.0, uAspect);
    float rb = 0.04 + 0.014 * uStage + (noise(d * 12.0 + uSeed) - 0.5) * 0.05;
    float r = length(d);
    vec3 stray = 0.5 + 0.5 * cos(6.2832 * (fract((r - rb) * 40.0) + vec3(0.0, 0.33, 0.67)));
    colour.rgb = mix(colour.rgb, stray, (1.0 - smoothstep(rb, rb + 0.03, r)) * 0.8);
    colour.rgb = mix(colour.rgb, vec3(0.0), 1.0 - smoothstep(rb - 0.02, rb, r));
    for (int c = 0; c < 3; c++) {
      float fc = float(c);
      if (uStage < fc + 2.0) break;
      float x = 0.1 + 0.8 * hash(vec2(fc, uSeed + 41.0));
      vec3 stuck = c == 0 ? vec3(1.0, 0.1, 0.8) : c == 1 ? vec3(0.1, 1.0, 0.4) : vec3(0.95);
      colour.rgb = mix(colour.rgb, stuck, (1.0 - smoothstep(1.0, 2.2, abs(n.x - x) * 1080.0)) * 0.85);
    }
  }
  colour.rgb += fresh * 0.1;
  finalColor = vec4(colour.rgb, 1.0);
}
`;

/** Where each blow lands (`mode` in the shader) and how many blows the screen takes before it is left as it is. */
export const BROKEN_LOOK: Record<string, { mode: number; blows: number }> = {
  shatter: { mode: 0, blows: 6 },
  corner: { mode: 1, blows: 5 },
  spider: { mode: 2, blows: 6 },
  pixels: { mode: 3, blows: 5 },
};

/** The screen is whole for the opening moment, so the first crack is seen landing. */
const FIRST_BLOW_MS = 700;
const FALLBACK_EVERY_MS = 2000;

/** How many blows have landed by `ms` (one on every downbeat, at most `blows`), and how long ago the last one was. */
export function brokenBlows(ms: number, downbeatsMs: readonly number[], beatsMs: readonly number[], blows: number): { stage: number; ageMs: number } {
  const hits = (downbeatsMs.length >= 3 ? [...downbeatsMs]
    : beatsMs.length >= 8 ? beatsMs.filter((_, index) => index % 4 === 0)
      : Array.from({ length: 8 }, (_, index) => (index + 1) * FALLBACK_EVERY_MS)).filter(at => at >= FIRST_BLOW_MS).slice(0, blows);
  let stage = 0;
  while (stage < hits.length && hits[stage] <= ms) stage++;
  return { stage, ageMs: stage ? ms - hits[stage - 1] : 1e6 };
}
