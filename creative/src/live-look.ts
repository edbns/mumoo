/**
 * Live looks, drawn: a shader on the picture behind the lyric type (never on the type), one per look in live-look-deal.ts.
 * The preview and the cloud render run this same code. Each look reads the beat and the song's energy, so it moves with the music.
 */
import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { LiveLookId } from './live-look-deal';
import { MIN_SPREAD, THERMAL_STOPS } from './live-look-ramp';

/** What a look needs to know about this moment. */
/** `range`: the brightness (0-1) of the picture's darkest and lightest parts, which a look stretches. */
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

/** The ramp function of the shader, written from the same stops the palette reader uses (live-look-ramp.ts). */
const f = (n: number) => n.toFixed(3);
const RAMP = `
vec3 ramp(float t) {
${THERMAL_STOPS.map(([r, g, b], i) => `  const vec3 c${i} = vec3(${f(r)}, ${f(g)}, ${f(b)});`).join('\n')}
  float x = clamp(t, 0.0, 1.0) * ${f(THERMAL_STOPS.length - 1)};
${THERMAL_STOPS.slice(0, -1).map((_, i) => `  ${i ? 'else ' : ''}if (x < ${f(i + 1)}) return mix(c${i}, c${i + 1}, x - ${f(i)});`).join('\n')}
  return c${THERMAL_STOPS.length - 1};
}
`;

/**
 * Thermal: brightness picks the colour from a heat ramp. The picture's own darkest-to-lightest range (uLow, uHigh) is spread over the whole ramp,
 * so a pale or a dark picture still shows cold and hot; the beat lifts everything toward the hot end, more when the song is loud, and settles.
 * A little sensor grain keeps it from looking like a flat gradient map.
 */
const THERMAL = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uBeat;
uniform float uEnergy;
uniform float uTime;
uniform float uLow;
uniform float uHigh;
${RAMP}
float grain(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void) {
  vec4 source = texture(uTexture, vTextureCoord);
  vec3 rgb = source.a > 0.0 ? source.rgb / source.a : source.rgb;
  float light = dot(rgb, vec3(0.299, 0.587, 0.114));
  float heat = smoothstep(uLow, uHigh, light);
  heat = heat * heat * (3.0 - 2.0 * heat);
  heat += uBeat * (0.06 + 0.16 * uEnergy);
  heat += (grain(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.03;
  finalColor = vec4(ramp(heat), 1.0) * source.a;
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

const BUILDERS: Record<LiveLookId, () => LiveLook> = {
  thermal: () => {
    const { filter, set } = make(THERMAL, 'live-look-thermal', { uBeat: 0, uEnergy: 0, uTime: 0, uLow: 0, uHigh: 1 });
    return {
      filter,
      update: ({ beat, energy, ms, range }) => set({ uBeat: beat, uEnergy: energy, uTime: ms / 1000, uLow: range[0], uHigh: Math.max(range[1], range[0] + MIN_SPREAD) }),
    };
  },
};

export const createLiveLook = (id: LiveLookId): LiveLook => BUILDERS[id]();
