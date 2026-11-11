/**
 * Live looks, drawn: a shader on the picture behind the lyric type (never on the type), one per look in live-look-deal.ts.
 * The preview and the cloud render run this same code. Each look reads the beat and the song's energy, so it moves with the music.
 */
import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { DitherLookId, GlowLookId, HalftoneLookId, HeatLookId, LiveLookId } from './live-look-deal';
import { DITHER_STYLES, GLOW_STYLES, HALFTONE_STYLES, LOOK_ROUGHNESS, LOOK_STOPS, MIN_SPREAD } from './live-look-ramp';

/** What a look needs to know about this moment. `range`: how cold and how hot the picture reads (0-1), which a look stretches over its ramp. */
export type LiveLookInput = { beat: number; energy: number; ms: number; range: readonly [number, number] };

export type LiveLook = { filter: Filter; update(input: LiveLookInput): void };

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
  // Grade: punch contrast, cast shadows, pull midtones down so the glow can read.
  vec3 graded = clamp((rgb - 0.5) * ${f(contrast)} + 0.5, 0.0, 1.0);
  float light = bright(graded);
  vec3 shadows = ${vec(shadows)};
  graded = mix(graded * (0.45 + 0.55 * light) + shadows * (1.0 - light) * 0.55, graded, 0.15);
  graded *= 1.0 - ${f(mid)} * (1.0 - abs(2.0 * light - 1.0) * 0.35);

  float rows = ${f(radius)};
  float cell = max(uInputSize.y / rows, 1.0);
  float swell = 1.0 + uBeat * (0.35 + 0.45 * uEnergy);
  float reach = cell * swell;
  float gate = ${f(threshold)} - uBeat * 0.04 * uEnergy;
  float glow = 0.0;
  vec3 glowColour = vec3(0.0);
  // Two rings of eight taps on a golden-angle spiral (~17 reads with the centre).
  for (int i = 0; i < 16; i++) {
    float n = float(i);
    float ring = 0.45 + 0.55 * floor(n / 8.0);
    float angle = n * 2.399963;
    vec2 way = vec2(cos(angle), sin(angle)) * reach * ring * uInputSize.zw;
    vec3 sampleColour = seen(vTextureCoord + way);
    float amount = smoothstep(gate, 1.0, bright(sampleColour));
    glow += amount;
    glowColour += tintOf(bright(sampleColour)) * amount;
  }
  glow /= 16.0;
  glowColour = glow > 0.001 ? glowColour / max(glow * 16.0, 0.001) : tintOf(1.0);
  ${clubCode}
  ${chroma > 0 ? `
  float split = reach * ${f(chroma)} * uInputSize.z;
  float left = smoothstep(gate, 1.0, bright(seen(vTextureCoord - vec2(split, 0.0))));
  float right = smoothstep(gate, 1.0, bright(seen(vTextureCoord + vec2(split, 0.0))));
  glowColour = vec3(glowColour.r * (0.65 + 0.7 * left), glowColour.g, glowColour.b * (0.65 + 0.7 * right));
  glow = max(glow, max(left, right) * 0.5);
  ` : ''}
  float power = (${f(strength)} + uEnergy * 0.25) * (1.0 + uBeat * (0.35 + 0.4 * uEnergy));
  vec3 colour = graded + glowColour * glow * power;
  // Soft clip so a bright picture does not wash the lyrics out.
  colour = colour / (1.0 + max(colour - vec3(0.85), vec3(0.0)) * 1.4);
  finalColor = vec4(clamp(colour, 0.0, 1.0), 1.0) * centre.a;
}
`;
};

function glowLook(id: GlowLookId): LiveLook {
  const { filter, set } = make(glowSource(id), `live-look-${id}`, { uBeat: 0, uEnergy: 0 });
  return { filter, update: ({ beat, energy }) => set({ uBeat: beat, uEnergy: energy }) };
}

const BUILDERS: Record<LiveLookId, () => LiveLook> = {
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
