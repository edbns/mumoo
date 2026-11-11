/**
 * Live looks, drawn: a shader on the picture behind the lyric type (never on the type), one per look in live-look-deal.ts.
 * The preview and the cloud render run this same code. Each look reads the beat and the song's energy, so it moves with the music.
 */
import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { HalftoneLookId, HeatLookId, LiveLookId } from './live-look-deal';
import { HALFTONE_STYLES, LOOK_ROUGHNESS, LOOK_STOPS, MIN_SPREAD } from './live-look-ramp';

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

const BUILDERS: Record<LiveLookId, () => LiveLook> = {
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
