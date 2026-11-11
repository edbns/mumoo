/**
 * Live looks, drawn: a shader on the picture behind the lyric type (never on the type), one per look in live-look-deal.ts.
 * The preview and the cloud render run this same code. Each look reads the beat and the song's energy, so it moves with the music.
 */
import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { HeatLookId, LiveLookId } from './live-look-deal';
import { HALFTONE_PAPER, LOOK_ROUGHNESS, LOOK_STOPS, MIN_SPREAD } from './live-look-ramp';

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
 * Halftone: the picture printed as a screen of round dots, the way a newspaper or a comic is. The screen is turned 15 degrees; each dot is the ink of its cell
 * (the picture's own colour, richer and darker) and as big as the cell is dark, so shade becomes size. The paper is cream. The beat swells every dot, more when
 * the song is loud. The dot size is set by the picture's height (about a hundred rows), so a small preview and the full render show the same print.
 * The numbers match live-look-ramp.ts, which the palette reader uses to choose type colour against the print.
 */
const halftoneSource = () => `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform float uBeat;
uniform float uEnergy;
const vec3 paper = vec3(${HALFTONE_PAPER.map(f).join(', ')});

vec3 seen(vec2 px) {
  vec4 source = texture(uTexture, px * uInputSize.zw);
  return source.a > 0.0 ? source.rgb / source.a : source.rgb;
}

void main(void) {
  vec4 centre = texture(uTexture, vTextureCoord);
  float cell = clamp(uInputSize.y / 100.0, 5.0, 18.0);
  float angle = 0.2617994;
  mat2 turn = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  vec2 grid = (turn * (vTextureCoord * uInputSize.xy)) / cell;
  vec2 id = floor(grid) + 0.5;
  vec2 local = grid - id;
  vec2 middle = ((id * cell) * turn);
  float near = cell * 0.3;
  vec3 rgb = seen(middle) * 0.4
    + (seen(middle + vec2(near, 0.0)) + seen(middle - vec2(near, 0.0)) + seen(middle + vec2(0.0, near)) + seen(middle - vec2(0.0, near))) * 0.15;
  float light = dot(rgb, vec3(0.299, 0.587, 0.114));
  float cover = clamp((1.0 - light) * 1.05, 0.0, 1.0);
  cover = clamp(cover + uBeat * (0.05 + 0.12 * uEnergy) * (0.4 + cover), 0.0, 1.0);
  float radius = 0.5642 * sqrt(cover) + 0.2 * cover * cover * cover;
  float edge = 1.5 / cell;
  float dotted = 1.0 - smoothstep(radius - edge, radius + edge, length(local));
  vec3 ink = clamp((vec3(light) + (rgb - vec3(light)) * 1.4) * 0.55, 0.0, 1.0);
  finalColor = vec4(mix(paper, ink, dotted), 1.0) * centre.a;
}
`;

function halftoneLook(): LiveLook {
  const { filter, set } = make(halftoneSource(), 'live-look-halftone', { uBeat: 0, uEnergy: 0 });
  return { filter, update: ({ beat, energy }) => set({ uBeat: beat, uEnergy: energy }) };
}

const BUILDERS: Record<LiveLookId, () => LiveLook> = {
  halftone: () => halftoneLook(),
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
