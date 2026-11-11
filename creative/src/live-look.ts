/**
 * Live looks, drawn: a shader on the picture behind the lyric type (never on the type), one per look in live-look-deal.ts.
 * The preview and the cloud render run this same code. Each look reads the beat and the song's energy, so it moves with the music.
 */
import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { AsciiLookId, DepthLookId, DitherLookId, GlowLookId, HalftoneLookId, HeatLookId, LiveLookId, StreaksLookId } from './live-look-deal';
import { ASCII_STYLES, DEPTH_STYLES, DITHER_STYLES, GLOW_STYLES, HALFTONE_STYLES, LOOK_ROUGHNESS, LOOK_STOPS, MIN_SPREAD, STREAKS_STYLES } from './live-look-ramp';
import { ASCII_GLYPHS, ASCII_RAMPS } from './ascii-styles';

/** What a look needs to know about this moment. `range`: how cold and how hot the picture reads (0-1), which a look stretches over its ramp. */
export type LiveLookInput = { beat: number; energy: number; ms: number; range: readonly [number, number] };

/** `nearFilter` is set for Depth: the far layer uses `filter`, the cut-out subject uses `nearFilter`. */
export type LiveLook = { filter: Filter; nearFilter?: Filter; update(input: LiveLookInput): void };

// The same vertex stage Pixi's own filters use.
const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const f = (n: number) => n.toFixed(3);

/** The ramp function of the shader, written from the same stops the palette reader uses (live-look-ramp.ts). */
function rampSource(id: HeatLookId): string {
  const stops = LOOK_STOPS[id];
  return `
vec3 ramp(float t) {
${stops.map(([r, g, b], i) => `  const vec3 c${i} = vec3(${f(r)}, ${f(g)}, ${f(b)});`).join('\n')}
  float x = clamp(t, 0.0, 1.0) * ${f(stops.length - 1)};
${stops.slice(0, -1).map((_, i) => `  ${i ? 'else ' : ''}if (x < ${f(i + 1)}) return mix(c${i}, c${i + 1}, x - ${f(i)});`).join('\n')}
  return c${stops.length - 1};
}
`;
}

/**
 * A heat camera, in a ramp of colours. It reads the picture as heat, not as light: brightness and warmth (skin, red cloth and fire run hot; sky, shade and
 * steel run cold). Its picture is soft, as a heat camera's is (each point is the mean of the ring around it), and the heat falls into bands of colour.
 * The picture's own coldest-to-hottest range (uLow, uHigh) is spread over the whole ramp, so a pale or a dark picture still shows cold and hot.
 * The beat lifts everything toward the hot end, more when the song is loud, and settles. Grain and darker edges differ for each look.
 */
const heatSource = (id: HeatLookId) => `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;
uniform float uTime;
uniform float uLow;
uniform float uHigh;
uniform float uGrain;
uniform float uVignette;
${rampSource(id)}
float grain(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float reading(vec2 uv) {
  vec4 source = texture(uTexture, uv);
  vec3 rgb = source.a > 0.0 ? source.rgb / source.a : source.rgb;
  float light = dot(rgb, vec3(0.299, 0.587, 0.114));
  float warmth = clamp(0.5 + 1.5 * (rgb.r - rgb.b), 0.0, 1.0);
  return 0.35 * light + 0.65 * warmth;
}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  vec2 reach = uInputSize.zw * 8.0;
  float heat = reading(vTextureCoord) * 0.12;
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.7853982;
    vec2 way = vec2(cos(angle), sin(angle)) * reach;
    heat += reading(vTextureCoord + way) * 0.055;
    heat += reading(vTextureCoord + way * 2.0) * 0.055;
  }
  heat = smoothstep(uLow, uHigh, heat);
    heat = mix(heat, floor(heat * 12.0 + 0.5) / 12.0, 0.5);
  heat += uBeat * (0.06 + 0.16 * uEnergy);
  heat += (grain(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * uGrain;
  vec2 away = vTextureCoord - 0.5;
  heat -= uVignette * dot(away, away) * 1.6;
  finalColor = vec4(ramp(heat), 1.0) * centre.a;
}
`;

/** A filter from a fragment shader and its float uniforms; `set` changes them for the next draw. */
function make(fragment: string, name: string, initial: Record<string, number>) {
  const group = new UniformGroup(Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, { value, type: 'f32' as const }])));
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment, name }),
    resources: { lookUniforms: group },
  });
  return { filter, set: (values: Record<string, number>) => { Object.assign(group.uniforms, values); } };
}

function heatLook(id: HeatLookId): LiveLook {
  const { grain, vignette } = LOOK_ROUGHNESS[id];
  const { filter, set } = make(heatSource(id), `live-look-${id}`, { uBeat: 0, uEnergy: 0, uTime: 0, uLow: 0, uHigh: 1, uGrain: grain, uVignette: vignette });
  return {
    filter,
    update: ({ beat, energy, ms, range }) => set({ uBeat: beat, uEnergy: energy, uTime: ms / 1000, uLow: range[0], uHigh: Math.max(range[1], range[0] + MIN_SPREAD) }),
  };
}

/**
 * Halftone: the picture printed the way a newspaper, a comic or a zine is. Each print (halftone-styles.ts) is a paper and one or more screens; a screen is a grid
 * of marks at its own angle, in its own ink, and each mark is as big as its part of the picture asks (shade becomes size). Inks lie on each other as in a press.
 * The beat swells every mark, more when the song is loud. The marks are sized by the picture's height (rows of marks), so a small preview and the full render
 * show the same print. The paper's grain, its wear and the missing specks of ink are here only; live-look-ramp.ts has the colours without them.
 */
const halftoneSource = (id: HalftoneLookId) => {
  const { paper, screens, rows = 100, grain = 0, distress = 0, contrast = 1 } = HALFTONE_STYLES[id];
  const vec = (rgb: readonly number[]) => `vec3(${rgb.map(f).join(', ')})`;
  // Several screens look at the picture several times, so each looks fewer times at it.
  const blur = screens.length > 2 ? 3 : 5;
  const channel = {
    dark: '(1.0 - lc)', light: 'lc', mid: '(1.0 - abs(2.0 * lc - 1.0))',
    cyan: 'cmy.x', magenta: 'cmy.y', yellow: 'cmy.z', black: 'key',
  };
  const code = screens.map((screen, index) => {
    const { ink, angle = 15, shape = 'round', blend = 'cover', offset = [0, 0], from = 0, fixed, sat = 1.4, gain = 0.55 } = screen;
    const line = shape === 'line' || shape === 'wave';
    const inkCode = ink === 'own' ? `clamp((vec3(light) + (rgb - vec3(light)) * ${f(sat)}) * ${f(gain)}, 0.0, 1.0)`
      : ink === 'poster' ? 'step(vec3(0.5), clamp(vec3(light) + (rgb - vec3(light)) * 1.8, 0.0, 1.0))'
        : vec(ink);
    const lay = { cover: 'ink', multiply: 'colour * ink', screen: 'vec3(1.0) - (vec3(1.0) - colour) * (vec3(1.0) - ink)' }[blend];
    // Where the grid cell is, where the mark sits in it, and where in the picture to look to size it.
    const place = line ? `
    float warp = ${shape === 'wave' ? `0.2 * sin(grid.x * 0.9 + ${f(index)})` : '0.0'};
    float across = grid.y + warp;
    float row = floor(across) + 0.5;
    vec2 local = vec2(fract(grid.x) - 0.5, across - row);
    vec2 middle = (vec2(grid.x - ${f(offset[0])}, row - warp - ${f(offset[1])}) * cell) * turn;`
      : `
    vec2 id = floor(grid) + 0.5;
    vec2 local = grid - id;
    vec2 middle = ((id - vec2(${f(offset[0])}, ${f(offset[1])})) * cell) * turn;`;
    const shapeSize = fixed !== undefined
      ? `float size = ${f(fixed)} * (1.0 + uBeat * (0.1 + 0.2 * uEnergy));`
      : shape === 'round' ? 'float size = 0.5642 * sqrt(cover) + 0.2 * cover * cover * cover;'
        : shape === 'square' ? 'float size = 0.5 * sqrt(cover) + 0.03 * cover;'
          : 'float size = 0.5 * cover + 0.03 * cover * cover * cover;';
    const reach = shape === 'square' ? 'max(abs(local.x), abs(local.y))' : line ? 'abs(local.y)' : 'length(local)';
    const present = fixed !== undefined ? '1.0' : 'step(0.002, cover)';
    return `
  {
    float angle = ${f((angle * Math.PI) / 180)};
    mat2 turn = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
    vec2 grid = (turn * px) / cell + vec2(${f(offset[0])}, ${f(offset[1])});${place}
    float near = cell * 0.3;
    vec3 rgb = ${blur === 5
    ? 'seen(middle) * 0.4 + (seen(middle + vec2(near, 0.0)) + seen(middle - vec2(near, 0.0)) + seen(middle + vec2(0.0, near)) + seen(middle - vec2(0.0, near))) * 0.15'
    : 'seen(middle) * 0.5 + (seen(middle + vec2(near)) + seen(middle - vec2(near))) * 0.25'};
    float light = dot(rgb, vec3(0.299, 0.587, 0.114));
    float lc = clamp((light - 0.5) * ${f(contrast)} + 0.5, 0.0, 1.0);
    float key = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
    vec3 cmy = (vec3(1.0) - rgb - vec3(key)) / max(1.0 - key, 0.001);
    float cover = clamp(((${channel[screen.channel ?? 'dark']} - ${f(from)}) / ${f(1 - from)}) * 1.05, 0.0, 1.0);
    cover = clamp(cover + uBeat * (0.05 + 0.12 * uEnergy) * (0.4 + cover), 0.0, 1.0);
    ${shapeSize}
    float edge = 1.5 / cell;
    float mark = (1.0 - smoothstep(size - edge, size + edge, ${reach})) * ${present};
    ${distress ? `mark *= 1.0 - step(${f(1 - distress * 0.3)}, noise(floor(px / 2.5) + ${f(index * 17)}));` : ''}
    vec3 ink = ${inkCode};
    colour = mix(colour, ${lay}, mark);
  }`;
  }).join('\n');
  return `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;

vec3 seen(vec2 px) {
  vec4 source = texture(uTexture, px * uInputSize.zw);
  return source.a > 0.0 ? source.rgb / source.a : source.rgb;
}

float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float soft(vec2 p) {
  vec2 cell = floor(p);
  vec2 into = smoothstep(0.0, 1.0, fract(p));
  return mix(mix(noise(cell), noise(cell + vec2(1.0, 0.0)), into.x), mix(noise(cell + vec2(0.0, 1.0)), noise(cell + vec2(1.0, 1.0)), into.x), into.y);
}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  float cell = clamp(uInputSize.y / ${f(rows)}, 3.0, 24.0);
  vec2 px = vTextureCoord * uInputSize.xy;
  vec3 colour = ${vec(paper)};
  ${grain || distress ? `colour *= 1.0 + (noise(floor(px / 2.0)) - 0.5) * ${f(grain)} + (soft(px / 45.0) - 0.5) * ${f(distress * 0.3)};` : ''}
${code}
  finalColor = vec4(colour, 1.0) * centre.a;
}
`;
};

function halftoneLook(id: HalftoneLookId): LiveLook {
  const { filter, set } = make(halftoneSource(id), `live-look-${id}`, { uBeat: 0, uEnergy: 0 });
  return { filter, update: ({ beat, energy }) => set({ uBeat: beat, uEnergy: energy }) };
}

/**
 * Dither: the picture reduced to chunky square blocks and a flat palette, as old computers and receipt printers did. Each colouring
 * (dither-styles.ts) picks a palette and a threshold matrix. The beat nudges the threshold and grows the blocks by one step when the
 * song is loud. Block size is in rows of the picture's height, so a small preview and the full render show the same print.
 */
const ditherSource = (id: DitherLookId) => {
  const { palette, matrix, rows = 120, contrast = 1, levels } = DITHER_STYLES[id];
  const vec = (rgb: readonly number[]) => `vec3(${rgb.map(f).join(', ')})`;
  // Threshold matrices in float maths only (no bitwise ops): some WebGL paths reject `&` / `<<` in filter shaders.
  const matrixCode = matrix === 'bayer2'
    ? `float bx = mod(float(ix), 2.0); float by = mod(float(iy), 2.0); float b2 = by * 2.0 + bx; float threshold = ((b2 < 0.5 ? 0.0 : b2 < 1.5 ? 2.0 : b2 < 2.5 ? 3.0 : 1.0) + 0.5) / 4.0;`
    : matrix === 'bayer4'
      ? `float bx = mod(float(ix), 4.0); float by = mod(float(iy), 4.0); float b4 = 0.0
    + (mod(bx, 2.0) < 0.5 ? 0.0 : 8.0) + (mod(by, 2.0) < 0.5 ? 0.0 : 4.0)
    + (bx < 2.0 ? 0.0 : 2.0) + (by < 2.0 ? 0.0 : 1.0);
    float threshold = (b4 + 0.5) / 16.0;`
      : matrix === 'bayer8'
        ? `float bx = mod(float(ix), 8.0); float by = mod(float(iy), 8.0); float b8 = 0.0
    + (mod(bx, 2.0) < 0.5 ? 0.0 : 32.0) + (mod(by, 2.0) < 0.5 ? 0.0 : 16.0)
    + (mod(bx, 4.0) < 2.0 ? 0.0 : 8.0) + (mod(by, 4.0) < 2.0 ? 0.0 : 4.0)
    + (bx < 4.0 ? 0.0 : 2.0) + (by < 4.0 ? 0.0 : 1.0);
    float threshold = (b8 + 0.5) / 64.0;`
        : matrix === 'diagonal'
          ? `float threshold = fract((float(ix + iy) + 0.5) / 4.0);`
          : `float threshold = fract(sin(dot(vec2(float(ix), float(iy)), vec2(12.9898, 78.233))) * 43758.5453);`;

  const own = palette === 'own8' || palette === 'own16';
  const steps = palette === 'own8' ? 1 : 3;
  const colours = own ? null : palette;
  const paletteCode = own || !colours
    ? `
  float q = ${f(1 / steps)};
  vec3 shaped = clamp((rgb - 0.5) * ${f(contrast)} + 0.5, 0.0, 1.0);
  vec3 colour = clamp(floor(shaped / q + threshold) * q, 0.0, 1.0);`
    : `
  float span = ${f(colours.length - 1)};
  float x = tone * span;
  float base = floor(min(x, span - 0.001));
  float into = x - base;
  float gate = threshold + uBeat * 0.08 * uEnergy;
  int pick = int(clamp(base + step(gate, into), 0.0, span));
${colours.map((rgb, index) => `  vec3 p${index} = ${vec(rgb)};`).join('\n')}
  vec3 colour = p0;
${colours.map((_, index) => (index === 0 ? '' : `  if (pick == ${index}) colour = p${index};`)).filter(Boolean).join('\n')}`;

  return `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;

vec3 seen(vec2 uv) {
  vec4 source = texture(uTexture, uv);
  return source.a > 0.0 ? source.rgb / source.a : source.rgb;
}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  // One block larger on a strong beat.
  float rows = max(${f(rows)} - step(0.45, uBeat) * (0.5 + 0.5 * uEnergy), 24.0);
  float cell = max(uInputSize.y / rows, 2.0);
  vec2 px = vTextureCoord * uInputSize.xy;
  vec2 id = floor(px / cell);
  vec2 middle = (id + 0.5) * cell * uInputSize.zw;
  vec3 rgb = seen(middle);
  float light = dot(rgb, vec3(0.299, 0.587, 0.114));
  float tone = clamp((light - 0.5) * ${f(contrast)} + 0.5, 0.0, 1.0);
  ${levels && levels > 1 ? `tone = (floor(tone * ${f(levels)}) + fract(tone * ${f(levels)})) / ${f(levels)};` : ''}
  int ix = int(id.x);
  int iy = int(id.y);
  ${matrixCode}
  ${paletteCode}
  finalColor = vec4(colour, 1.0) * centre.a;
}
`;
};

function ditherLook(id: DitherLookId): LiveLook {
  const { filter, set } = make(ditherSource(id), `live-look-${id}`, { uBeat: 0, uEnergy: 0 });
  return { filter, update: ({ beat, energy }) => set({ uBeat: beat, uEnergy: energy }) };
}

/**
 * Glow: light bleeding from the bright parts of the picture. The picture is graded darker first so the bloom reads; the glow is a wide spiral blur of
 * what is above a threshold, tinted, then soft-clipped on top. Strength and radius swell with the beat. Radius is in rows of the picture's height.
 */
const glowSource = (id: GlowLookId) => {
  const style = GLOW_STYLES[id];
  const threshold = style.threshold ?? 0.55;
  const radius = style.radius ?? 36;
  const strength = style.strength ?? 0.85;
  const chroma = style.chroma ?? 0;
  const { shadows, contrast = 1.2, mid = 0.25 } = style.grade;
  const vec = (rgb: readonly number[]) => `vec3(${rgb.map(f).join(', ')})`;
  const dual = typeof style.tint[0] !== 'number';
  const tintPair = dual ? style.tint as readonly [readonly [number, number, number], readonly [number, number, number]] : null;
  const tintOne = dual ? null : style.tint as readonly [number, number, number];
  const tintCode = tintPair
    ? `vec3 tintA = ${vec(tintPair[0])}; vec3 tintB = ${vec(tintPair[1])}; vec3 tintOf(float t) { return mix(tintA, tintB, clamp(t, 0.0, 1.0)); }`
    : `vec3 tintOf(float t) { return ${vec(tintOne!)}; }`;
  const clubCode = style.club
    ? `float club = step(0.5, fract((vTextureCoord.x + vTextureCoord.y * 0.35) * 2.5));
  glowColour = mix(vec3(1.0, 0.2, 0.7), vec3(0.2, 0.55, 1.0), club);`
    : '';

  return `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;

vec3 seen(vec2 uv) {
  vec4 source = texture(uTexture, uv);
  return source.a > 0.0 ? source.rgb / source.a : source.rgb;
}

float bright(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

${tintCode}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  vec3 rgb = centre.a > 0.0 ? centre.rgb / centre.a : centre.rgb;
  // Grade hard: crush midtones and lift shadows into a cast so the bloom is what you notice, not the photo.
  vec3 graded = clamp((rgb - 0.5) * ${f(contrast)} + 0.5, 0.0, 1.0);
  float light = bright(graded);
  vec3 shadows = ${vec(shadows)};
  graded = graded * (0.35 + 0.45 * light) + shadows * (1.0 - light) * 0.7;
  graded *= 1.0 - ${f(mid)} * (0.55 + 0.45 * (1.0 - abs(2.0 * light - 1.0)));
  graded *= 0.72;

  float rows = ${f(radius)};
  float cell = max(uInputSize.y / rows, 1.0);
  // Beat grows the haze and the strength so the flare is obvious on the hit.
  float swell = 1.0 + uBeat * (0.7 + 0.9 * uEnergy);
  float reach = cell * swell;
  float gate = ${f(threshold)} - uBeat * 0.08 * uEnergy - uEnergy * 0.04;
  float glow = 0.0;
  float weight = 0.0;
  vec3 glowColour = vec3(0.0);
  // Centre hotspot + two rings of eight taps on a golden-angle spiral (~18 reads).
  {
    float amount = pow(smoothstep(gate, 1.0, bright(rgb)), 0.75);
    glow += amount * 1.6;
    weight += 1.6;
    glowColour += tintOf(bright(rgb)) * amount * 1.6;
  }
  for (int i = 0; i < 16; i++) {
    float n = float(i);
    float ring = 0.4 + 0.7 * floor(n / 8.0);
    float angle = n * 2.399963;
    vec2 way = vec2(cos(angle), sin(angle)) * reach * ring * uInputSize.zw;
    vec3 sampleColour = seen(vTextureCoord + way);
    float amount = pow(smoothstep(gate, 1.0, bright(sampleColour)), 0.75);
    float w = 1.0 - 0.25 * floor(n / 8.0);
    glow += amount * w;
    weight += w;
    glowColour += tintOf(bright(sampleColour)) * amount * w;
  }
  glow /= max(weight, 0.001);
  glowColour = glow > 0.001 ? glowColour / max(glow * weight, 0.001) : tintOf(1.0);
  ${clubCode}
  ${chroma > 0 ? `
  float split = reach * ${f(chroma)} * uInputSize.z;
  float left = pow(smoothstep(gate, 1.0, bright(seen(vTextureCoord - vec2(split, 0.0)))), 0.75);
  float right = pow(smoothstep(gate, 1.0, bright(seen(vTextureCoord + vec2(split, 0.0)))), 0.75);
  glowColour = vec3(glowColour.r * (0.55 + 0.9 * left), glowColour.g, glowColour.b * (0.55 + 0.9 * right));
  glow = max(glow, max(left, right) * 0.65);
  ` : ''}
  float power = (${f(strength)} + uEnergy * 0.45) * (1.0 + uBeat * (0.7 + 0.85 * uEnergy));
  // Screen the tinted bloom over the dark grade so bright parts flare instead of washing flat.
  vec3 bloom = glowColour * glow * power;
  vec3 colour = 1.0 - (1.0 - graded) * (1.0 - clamp(bloom, 0.0, 1.0));
  colour = mix(graded + bloom * 0.85, colour, 0.65);
  // Soft clip: keep lyrics readable, but let the flare stay hot.
  colour = colour / (1.0 + max(colour - vec3(0.92), vec3(0.0)) * 0.9);
  finalColor = vec4(clamp(colour, 0.0, 1.0), 1.0) * centre.a;
}
`;
};

function glowLook(id: GlowLookId): LiveLook {
  const { filter, set } = make(glowSource(id), `live-look-${id}`, { uBeat: 0, uEnergy: 0 });
  return { filter, update: ({ beat, energy }) => set({ uBeat: beat, uEnergy: energy }) };
}

/**
 * Streaks: light dragged into lines. The picture is graded, then its bright parts (or the edges, for film burn) are blurred along a direction with
 * exponential fall-off and added back tinted. Length stretches on the beat; the angle drifts slowly with time. Uses `range` so a flat picture still streaks.
 */
const streaksSource = (id: StreaksLookId) => {
  const style = STREAKS_STYLES[id];
  const length = style.length ?? 0.38;
  const threshold = style.threshold ?? 0.55;
  const strength = style.strength ?? 1.15;
  const falloff = style.falloff ?? 0.82;
  const { shadows, contrast = 1.25, mid = 0.32 } = style.grade;
  const vec = (rgb: readonly number[]) => `vec3(${rgb.map(f).join(', ')})`;
  const dual = typeof style.tint[0] !== 'number';
  const tintPair = dual ? style.tint as readonly [readonly [number, number, number], readonly [number, number, number]] : null;
  const tintOne = dual ? null : style.tint as readonly [number, number, number];
  const tintCode = tintPair
    ? `vec3 tintA = ${vec(tintPair[0])}; vec3 tintB = ${vec(tintPair[1])}; vec3 tintOf(float t) { return mix(tintA, tintB, clamp(t, 0.0, 1.0)); }`
    : `vec3 tintOf(float t) { return ${vec(tintOne!)}; }`;
  const radial = style.direction === 'radial';
  const angle0 = typeof style.direction === 'number' ? (style.direction * Math.PI) / 180 : 0;
  const second = style.second !== undefined ? (style.second * Math.PI) / 180 : null;
  // Dense bidirectional taps for a continuous beam (not ghosted copies). Stay under ~24 reads.
  const tapsMain = second === null ? 11 : 7;
  const tapsSecond = second === null ? 0 : 4;

  // Peak-weighted directional bleed: a bright speck paints a continuous tinted beam, not discrete ghosts.
  const streakAlong = (label: string, taps: number, angleExpr: string, bothWays: boolean) => `
  {
    vec2 dir = ${angleExpr};
    float streak = 0.0;
    vec3 colour = vec3(0.0);
    float wsum = 0.0;
    for (int i = 1; i <= ${taps}; i++) {
      float t = float(i) / float(${taps});
      float w = exp(-2.4 * t) * ${f(falloff)};
      for (int side = 0; side < ${bothWays ? 2 : 1}; side++) {
        float sign = side == 0 ? 1.0 : -1.0;
        vec2 way = dir * span * t * sign;
        vec3 sampleColour = seen(vTextureCoord + way);
        float amount = max(smoothstep(gate, 1.0, bright(sampleColour)), smoothstep(hot, 1.0, bright(sampleColour)));
        ${style.edge ? `
        // Edge leak adds on top of normal highlight streaks — never replaces them (or the middle goes black).
        float edgeHere = max(max(1.0 - vTextureCoord.x * 3.2, 1.0 - vTextureCoord.y * 3.2), 0.0);
        amount = amount + edgeHere * (0.55 + 0.45 * amount);
        ` : ''}
        vec3 tint = tintOf(bright(sampleColour));
        ${style.prism ? `
        float shift = (t - 0.5) * 0.9 * sign;
        tint = vec3(tint.r * (1.0 + shift), tint.g, tint.b * (1.0 - shift));
        ` : ''}
        colour += tint * amount * w;
        streak = max(streak, amount * w);
        wsum += amount * w;
      }
    }
    {
      float amount = max(smoothstep(gate, 1.0, bright(rgb)), smoothstep(hot, 1.0, bright(rgb)));
      ${style.edge ? `
      float edgeHere = max(max(1.0 - vTextureCoord.x * 3.2, 1.0 - vTextureCoord.y * 3.2), 0.0);
      amount = amount + edgeHere * (0.6 + 0.4 * amount);
      ` : ''}
      colour += tintOf(bright(rgb)) * amount * 2.2;
      streak = max(streak, amount * 2.2);
      wsum += amount * 2.2;
    }
    ${label} = max(streak, wsum * 0.35);
    ${label}Colour = wsum > 0.001 ? colour / max(wsum, 0.001) : tintOf(1.0);
  }`;

  const dirExpr = radial
    ? `normalize(vTextureCoord - vec2(0.5) + vec2(0.0001))`
    : `vec2(cos(${f(angle0)} + drift), sin(${f(angle0)} + drift))`;
  const secondDir = second === null ? '' : `vec2(cos(${f(second)} + drift * 0.6), sin(${f(second)} + drift * 0.6))`;

  return `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;
uniform float uTime;
uniform float uLow;
uniform float uHigh;

vec3 seen(vec2 uv) {
  vec4 source = texture(uTexture, clamp(uv, 0.0, 1.0));
  return source.a > 0.0 ? source.rgb / source.a : source.rgb;
}

float bright(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

${tintCode}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  vec3 rgb = centre.a > 0.0 ? centre.rgb / centre.a : centre.rgb;
  // Crush the photo so the tinted trails are the look, not a light filter on the original.
  vec3 graded = clamp((rgb - 0.5) * ${f(contrast)} + 0.5, 0.0, 1.0);
  float light = bright(graded);
  vec3 shadows = ${vec(shadows)};
  graded = graded * (0.28 + 0.35 * light) + shadows * (1.0 - light) * 0.75;
  graded *= 1.0 - ${f(mid)} * (0.55 + 0.45 * (1.0 - abs(2.0 * light - 1.0)));
  graded *= 0.55;

  float span = ${f(length)} * uInputSize.x * (1.0 + uBeat * (0.85 + 1.0 * uEnergy)) * uInputSize.z;
  float drift = sin(uTime * 0.4) * 0.0523599 * (0.35 + 0.65 * uEnergy);
  // Gate off the picture's own range so a bright photo still has dark body and hot trails, not a white wash.
  float gate = mix(uLow, uHigh, clamp(${f(threshold)} + 0.25, 0.4, 0.78));
  gate = max(mix(uLow, uHigh, 0.38), gate - uBeat * 0.12 * uEnergy - uEnergy * 0.05);
  float hot = mix(uLow, uHigh, 0.84);

  float mainStreak = 0.0;
  vec3 mainStreakColour = tintOf(1.0);
  ${streakAlong('mainStreak', tapsMain, dirExpr, true)}
  ${second === null ? '' : `
  float sideStreak = 0.0;
  vec3 sideStreakColour = tintOf(1.0);
  ${streakAlong('sideStreak', tapsSecond, secondDir, true)}
  mainStreak = mainStreak + sideStreak * 0.95;
  mainStreakColour = mix(mainStreakColour, sideStreakColour, clamp(sideStreak / max(mainStreak, 0.001), 0.0, 0.75));
  `}

  // Accumulated streak can be >> 1; keep power hot so trails read as the filter.
  float power = (${f(strength)} + uEnergy * 0.7) * (1.0 + uBeat * (0.9 + 1.1 * uEnergy));
  vec3 bloom = mainStreakColour * clamp(mainStreak, 0.0, 3.8) * power * 0.7;
  // Soft-clip bloom while keeping the tint (so blue stays blue, not white wash).
  bloom = bloom / (1.0 + bloom * 0.45);
  float lyricSafe = 1.0 - smoothstep(0.34, 0.48, abs(vTextureCoord.y - 0.42)) * 0.12;
  bloom *= lyricSafe;
  vec3 screened = 1.0 - (1.0 - graded) * (1.0 - clamp(bloom, 0.0, 1.0));
  vec3 colour = mix(graded + bloom, screened, 0.8);
  colour = colour / (1.0 + max(colour - vec3(0.9), vec3(0.0)) * 0.75);
  finalColor = vec4(clamp(colour, 0.0, 1.0), 1.0) * centre.a;
}
`;
};

function streaksLook(id: StreaksLookId): LiveLook {
  const { filter, set } = make(streaksSource(id), `live-look-${id}`, { uBeat: 0, uEnergy: 0, uTime: 0, uLow: 0, uHigh: 1 });
  return {
    filter,
    update: ({ beat, energy, ms, range }) => set({
      uBeat: beat, uEnergy: energy, uTime: ms / 1000,
      uLow: range[0], uHigh: Math.max(range[1], range[0] + MIN_SPREAD),
    }),
  };
}

/**
 * ASCII: the picture rebuilt from 5×7 bitmap characters (no font). A grid of cells reads brightness (3 taps), picks a glyph from the
 * colouring's ramp, and draws it in ink on paper. Beat steps bright cells up the ramp; optional rain scrolls columns.
 */
const asciiSource = (id: AsciiLookId) => {
  const style = ASCII_STYLES[id];
  const cols = style.cols ?? 80;
  const ramp = ASCII_RAMPS[style.ramp];
  const glyphs = ramp.map(name => ASCII_GLYPHS[name]);
  const vec = (rgb: readonly number[]) => `vec3(${rgb.map(f).join(', ')})`;
  const pictureInk = style.ink === 'picture';
  const inkExpr = pictureInk ? 'sampleRgb' : vec(style.ink as readonly [number, number, number]);
  const paperExpr = vec(style.paper);
  // No dynamic array indexing (some WebGL paths black out): pick the row with ifs, then the bit with ifs.
  const glyphSelect = glyphs.map((rows, index) => `
  if (gid == ${index}) {
    float row = 0.0;
    if (gy == 0) row = ${f(rows[0])};
    else if (gy == 1) row = ${f(rows[1])};
    else if (gy == 2) row = ${f(rows[2])};
    else if (gy == 3) row = ${f(rows[3])};
    else if (gy == 4) row = ${f(rows[4])};
    else if (gy == 5) row = ${f(rows[5])};
    else row = ${f(rows[6])};
    float bit = 0.0;
    if (gx == 0) bit = floor(mod(floor(row / 16.0), 2.0));
    else if (gx == 1) bit = floor(mod(floor(row / 8.0), 2.0));
    else if (gx == 2) bit = floor(mod(floor(row / 4.0), 2.0));
    else if (gx == 3) bit = floor(mod(floor(row / 2.0), 2.0));
    else bit = floor(mod(row, 2.0));
    return bit >= 1.0;
  }`).join('');

  return `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;
uniform float uTime;

vec3 seen(vec2 uv) {
  vec4 source = texture(uTexture, clamp(uv, 0.0, 1.0));
  return source.a > 0.0 ? source.rgb / source.a : source.rgb;
}

float bright(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

bool glyphOn(int gid, int gx, int gy) {
  ${glyphSelect}
  return false;
}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  float cols = ${f(cols)};
  float cellW = uInputSize.x / cols;
  float cellH = cellW * 2.0;
  vec2 px = vTextureCoord * uInputSize.xy;
  float col = floor(px.x / cellW);
  float row = floor(px.y / cellH);
  ${style.rain ? `
  float rain = floor(mod(uTime * (1.2 + 2.4 * fract(sin(col * 12.9898) * 43758.5453)) * (0.35 + 0.65 * uEnergy), 64.0));
  row = mod(row + rain, floor(uInputSize.y / cellH) + 1.0);
  ` : ''}
  vec2 middle = vec2((col + 0.5) * cellW, (floor(px.y / cellH) + 0.5) * cellH) * uInputSize.zw;
  vec2 reach = vec2(cellW, cellH) * 0.18 * uInputSize.zw;
  vec3 sampleRgb = seen(middle) * 0.5 + seen(middle + vec2(reach.x, 0.0)) * 0.25 + seen(middle - vec2(reach.x, 0.0)) * 0.25;
  float light = bright(sampleRgb);
  float tone = ${style.invert ? '1.0 - light' : 'light'};
  // Bright cells step up the ramp on the beat.
  float steps = ${f(glyphs.length - 1)};
  float x = clamp(tone, 0.0, 1.0) * steps + uBeat * (0.6 + 1.1 * uEnergy) * step(0.55, tone);
  int gid = int(clamp(floor(x + 0.5), 0.0, steps));
  vec2 local = vec2(fract(px.x / cellW), fract(px.y / cellH));
  // Slight letterboxing so glyphs do not touch cell edges.
  vec2 inset = (local - 0.08) / 0.84;
  vec3 paper = ${paperExpr};
  vec3 ink = ${inkExpr};
  if (inset.x < 0.0 || inset.y < 0.0 || inset.x > 1.0 || inset.y > 1.0) {
    finalColor = vec4(paper, 1.0) * centre.a;
    return;
  }
  int gx = int(clamp(floor(inset.x * 5.0), 0.0, 4.0));
  int gy = int(clamp(floor(inset.y * 7.0), 0.0, 6.0));
  float on = glyphOn(gid, gx, gy) ? 1.0 : 0.0;
  ${style.rain ? `
  // Fading rain trail: newer cells (near the head) stay brighter.
  float trail = 0.45 + 0.55 * fract(row * 0.17 + col * 0.09 + uTime * 0.3);
  on *= mix(0.35, 1.0, trail);
  ` : ''}
  vec3 colour = mix(paper, ink, on);
  finalColor = vec4(colour, 1.0) * centre.a;
}
`;
};

function asciiLook(id: AsciiLookId): LiveLook {
  const { filter, set } = make(asciiSource(id), `live-look-${id}`, { uBeat: 0, uEnergy: 0, uTime: 0 });
  return { filter, update: ({ beat, energy, ms }) => set({ uBeat: beat, uEnergy: energy, uTime: ms / 1000 }) };
}

/**
 * Depth far layer: grade, optional blur, fog and spotlight. The near cut-out is a separate sprite with `nearFilter`.
 * Blur stays under ~17 reads (centre + two rings of eight).
 */
const depthFarSource = (id: DepthLookId) => {
  const style = DEPTH_STYLES[id];
  const { shadows, contrast = 1.15, mid = 0.25, grey = 0, fog, fogAmount = 0, blur = 0 } = style.far;
  const vec = (rgb: readonly number[]) => `vec3(${rgb.map(f).join(', ')})`;
  const fogCode = fog && fogAmount > 0
    ? `graded = mix(graded, ${vec(fog)}, ${f(fogAmount)} * (0.55 + 0.45 * (1.0 - light)));`
    : '';
  const greyCode = grey > 0
    ? `float greyL = bright(graded); graded = mix(graded, vec3(greyL), ${f(grey)});`
    : '';
  const spotCode = style.spot
    ? `float spot = exp(-dot(vTextureCoord - vec2(0.5), vTextureCoord - vec2(0.5)) * 6.5);
  graded += vec3(0.35, 0.32, 0.28) * spot * (0.35 + 0.45 * uEnergy);`
    : '';
  const blurCode = blur > 0
    ? `
  float rows = ${f(blur)};
  float cell = max(uInputSize.y / rows, 1.0);
  float reach = cell * (1.0 + uBeat * 0.25 * uEnergy);
  vec3 blur = rgb * 1.4;
  float weight = 1.4;
  for (int i = 0; i < 16; i++) {
    float n = float(i);
    float ring = 0.45 + 0.65 * floor(n / 8.0);
    float angle = n * 2.399963;
    vec2 way = vec2(cos(angle), sin(angle)) * reach * ring * uInputSize.zw;
    vec4 sample = texture(uTexture, clamp(vTextureCoord + way, 0.0, 1.0));
    vec3 sampleRgb = sample.a > 0.0 ? sample.rgb / sample.a : sample.rgb;
    float w = 1.0 - 0.2 * floor(n / 8.0);
    blur += sampleRgb * w;
    weight += w;
  }
  rgb = blur / max(weight, 0.001);
  `
    : '';

  return `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;

vec3 seen(vec2 uv) {
  vec4 source = texture(uTexture, clamp(uv, 0.0, 1.0));
  return source.a > 0.0 ? source.rgb / source.a : source.rgb;
}

float bright(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  vec3 rgb = centre.a > 0.0 ? centre.rgb / centre.a : centre.rgb;
  ${blurCode}
  vec3 graded = clamp((rgb - 0.5) * ${f(contrast)} + 0.5, 0.0, 1.0);
  float light = bright(graded);
  vec3 shadows = ${vec(shadows)};
  graded = graded * (0.4 + 0.6 * light) + shadows * (1.0 - light) * 0.7;
  graded *= 1.0 - ${f(mid)} * (0.5 + 0.5 * (1.0 - abs(2.0 * light - 1.0)));
  ${greyCode}
  ${fogCode}
  ${spotCode}
  finalColor = vec4(clamp(graded, 0.0, 1.0), 1.0) * centre.a;
}
`;
};

/** Depth near layer: grade the cut-out, optional flat silhouette and neon edge (feathered). */
const depthNearSource = (id: DepthLookId) => {
  const style = DEPTH_STYLES[id];
  const { shadows, contrast = 1.15, mid = 0.18, flat, outline } = style.near;
  const vec = (rgb: readonly number[]) => `vec3(${rgb.map(f).join(', ')})`;
  const body = flat
    ? `vec3 graded = ${vec(flat)};`
    : `
  vec3 graded = clamp((rgb - 0.5) * ${f(contrast)} + 0.5, 0.0, 1.0);
  float light = bright(graded);
  vec3 shadows = ${vec(shadows)};
  graded = graded * (0.45 + 0.55 * light) + shadows * (1.0 - light) * 0.65;
  graded *= 1.0 - ${f(mid)} * (0.5 + 0.5 * (1.0 - abs(2.0 * light - 1.0)));
  `;
  const outlineCode = outline
    ? `
  float edge = 0.0;
  vec2 px = uInputSize.zw * 2.0;
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.7853982;
    vec2 way = vec2(cos(angle), sin(angle)) * px;
    float around = texture(uTexture, clamp(vTextureCoord + way, 0.0, 1.0)).a;
    edge = max(edge, abs(centre.a - around));
  }
  graded = mix(graded, ${vec(outline)}, clamp(edge * (1.6 + uBeat * 0.9 * uEnergy), 0.0, 1.0));
  `
    : '';

  return `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;

float bright(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  if (centre.a < 0.004) { finalColor = vec4(0.0); return; }
  vec3 rgb = centre.rgb / max(centre.a, 0.001);
  ${body}
  ${outlineCode}
  // Feather hard cut-out edges a little so the subject sits in the far layer.
  float soft = smoothstep(0.02, 0.18, centre.a);
  finalColor = vec4(clamp(graded, 0.0, 1.0), 1.0) * soft;
}
`;
};

function depthLook(id: DepthLookId): LiveLook {
  const far = make(depthFarSource(id), `live-look-${id}-far`, { uBeat: 0, uEnergy: 0 });
  const near = make(depthNearSource(id), `live-look-${id}-near`, { uBeat: 0, uEnergy: 0 });
  return {
    filter: far.filter,
    nearFilter: near.filter,
    update: ({ beat, energy }) => {
      far.set({ uBeat: beat, uEnergy: energy });
      near.set({ uBeat: beat, uEnergy: energy });
    },
  };
}

const BUILDERS: Record<LiveLookId, () => LiveLook> = {
  depthfog: () => depthLook('depthfog'),
  depthtilt: () => depthLook('depthtilt'),
  depthwarm: () => depthLook('depthwarm'),
  depthsilhouette: () => depthLook('depthsilhouette'),
  depthneon: () => depthLook('depthneon'),
  depthecho: () => depthLook('depthecho'),
  depthzoom: () => depthLook('depthzoom'),
  depthdream: () => depthLook('depthdream'),
  depthgold: () => depthLook('depthgold'),
  depthnoir: () => depthLook('depthnoir'),
  depthspot: () => depthLook('depthspot'),
  depthdouble: () => depthLook('depthdouble'),
  depthice: () => depthLook('depthice'),
  depthember: () => depthLook('depthember'),
  asciigreen: () => asciiLook('asciigreen'),
  asciiamber: () => asciiLook('asciiamber'),
  asciiwhite: () => asciiLook('asciiwhite'),
  asciitype: () => asciiLook('asciitype'),
  asciicolour: () => asciiLook('asciicolour'),
  asciicyan: () => asciiLook('asciicyan'),
  asciipink: () => asciiLook('asciipink'),
  asciiblueprint: () => asciiLook('asciiblueprint'),
  asciimatrix: () => asciiLook('asciimatrix'),
  asciired: () => asciiLook('asciired'),
  asciigold: () => asciiLook('asciigold'),
  asciiice: () => asciiLook('asciiice'),
  asciinews: () => asciiLook('asciinews'),
  asciisunset: () => asciiLook('asciisunset'),
  asciibinary: () => asciiLook('asciibinary'),
  asciiblocks: () => asciiLook('asciiblocks'),
  asciislash: () => asciiLook('asciislash'),
  asciimumoo: () => asciiLook('asciimumoo'),
  streakblue: () => streaksLook('streakblue'),
  streakamber: () => streaksLook('streakamber'),
  streakteal: () => streaksLook('streakteal'),
  streakmagenta: () => streaksLook('streakmagenta'),
  streakwhite: () => streaksLook('streakwhite'),
  streakred: () => streaksLook('streakred'),
  streakgreen: () => streaksLook('streakgreen'),
  streakgold: () => streaksLook('streakgold'),
  streakcyan: () => streaksLook('streakcyan'),
  streakviolet: () => streaksLook('streakviolet'),
  streakprism: () => streaksLook('streakprism'),
  streaksunset: () => streaksLook('streaksunset'),
  streakice: () => streaksLook('streakice'),
  streakburn: () => streaksLook('streakburn'),
  streakrain: () => streaksLook('streakrain'),
  streakzoom: () => streaksLook('streakzoom'),
  streakspeed: () => streaksLook('streakspeed'),
  glowbloom: () => glowLook('glowbloom'),
  glowpink: () => glowLook('glowpink'),
  glowcyan: () => glowLook('glowcyan'),
  glowsplit: () => glowLook('glowsplit'),
  glowamber: () => glowLook('glowamber'),
  glowgold: () => glowLook('glowgold'),
  glowuv: () => glowLook('glowuv'),
  glowtoxic: () => glowLook('glowtoxic'),
  glowred: () => glowLook('glowred'),
  glowpeach: () => glowLook('glowpeach'),
  glowice: () => glowLook('glowice'),
  glowprism: () => glowLook('glowprism'),
  glowdream: () => glowLook('glowdream'),
  glownoir: () => glowLook('glownoir'),
  glowclub: () => glowLook('glowclub'),
  glowmist: () => glowLook('glowmist'),
  glowlilac: () => glowLook('glowlilac'),
  glowrose: () => glowLook('glowrose'),
  dithermac: () => ditherLook('dithermac'),
  ditherinvert: () => ditherLook('ditherinvert'),
  dithergameboy: () => ditherLook('dithergameboy'),
  dithercga: () => ditherLook('dithercga'),
  dithercgagreen: () => ditherLook('dithercgagreen'),
  ditherega: () => ditherLook('ditherega'),
  ditherc64: () => ditherLook('ditherc64'),
  ditherapple2: () => ditherLook('ditherapple2'),
  ditherpico8: () => ditherLook('ditherpico8'),
  ditheramiga: () => ditherLook('ditheramiga'),
  ditherreceipt: () => ditherLook('ditherreceipt'),
  ditherblueprint: () => ditherLook('ditherblueprint'),
  ditheramber: () => ditherLook('ditheramber'),
  dithersunset: () => ditherLook('dithersunset'),
  dithervapor: () => ditherLook('dithervapor'),
  ditherforest: () => ditherLook('ditherforest'),
  dithernews: () => ditherLook('dithernews'),
  ditherneon: () => ditherLook('ditherneon'),
  dithergold: () => ditherLook('dithergold'),
  ditherown: () => ditherLook('ditherown'),
  halftone: () => halftoneLook('halftone'),
  halftonebw: () => halftoneLook('halftonebw'),
  halftonenews: () => halftoneLook('halftonenews'),
  halftoneblue: () => halftoneLook('halftoneblue'),
  halftonered: () => halftoneLook('halftonered'),
  halftonepink: () => halftoneLook('halftonepink'),
  halftoneteal: () => halftoneLook('halftoneteal'),
  halftonepop: () => halftoneLook('halftonepop'),
  halftoneneon: () => halftoneLook('halftoneneon'),
  halftoneinvert: () => halftoneLook('halftoneinvert'),
  halftonegold: () => halftoneLook('halftonegold'),
  halftonecmyk: () => halftoneLook('halftonecmyk'),
  halftoneriso: () => halftoneLook('halftoneriso'),
  halftoneblueprint: () => halftoneLook('halftoneblueprint'),
  halftonesepia: () => halftoneLook('halftonesepia'),
  halftonemanga: () => halftoneLook('halftonemanga'),
  halftonesubway: () => halftoneLook('halftonesubway'),
  halftonesunset: () => halftoneLook('halftonesunset'),
  halftonematcha: () => halftoneLook('halftonematcha'),
  halftonecandy: () => halftoneLook('halftonecandy'),
  halftonetarot: () => halftoneLook('halftonetarot'),
  halftoneacid: () => halftoneLook('halftoneacid'),
  halftonesilver: () => halftoneLook('halftonesilver'),
  halftonephosphor: () => halftoneLook('halftonephosphor'),
  halftoneuv: () => halftoneLook('halftoneuv'),
  halftonecopper: () => halftoneLook('halftonecopper'),
  halftoneengrave: () => halftoneLook('halftoneengrave'),
  halftonehatch: () => halftoneLook('halftonehatch'),
  halftoneled: () => halftoneLook('halftoneled'),
  halftonebenday: () => halftoneLook('halftonebenday'),
  thermal: () => heatLook('thermal'),
  arctic: () => heatLook('arctic'),
  night: () => heatLook('night'),
  whitehot: () => heatLook('whitehot'),
  blackhot: () => heatLook('blackhot'),
  rainbow: () => heatLook('rainbow'),
  lava: () => heatLook('lava'),
  ultraviolet: () => heatLook('ultraviolet'),
  acid: () => heatLook('acid'),
  dusk: () => heatLook('dusk'),
  amber: () => heatLook('amber'),
  candy: () => heatLook('candy'),
  lagoon: () => heatLook('lagoon'),
  gold: () => heatLook('gold'),
  crimson: () => heatLook('crimson'),
  cyanotype: () => heatLook('cyanotype'),
  aurora: () => heatLook('aurora'),
  vapor: () => heatLook('vapor'),
};

export const createLiveLook = (id: LiveLookId): LiveLook => BUILDERS[id]();
