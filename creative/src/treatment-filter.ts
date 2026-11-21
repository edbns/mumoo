/** The shader plumbing the video treatments share (pack-treatment.ts, pack-typewriter.ts). */
import { Filter, GlProgram, UniformGroup, type TextureSource } from 'pixi.js';

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

/** Filter textures can be larger than the frame: `n` is 0..1 over the frame, `back(n)` the coordinate to sample. */
export const FRAME_UV = `
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
vec2 frameMax() { return uOutputFrame.zw * uInputSize.zw; }
vec2 mirrored(vec2 n) { return 1.0 - abs(1.0 - mod(n, 2.0)); }
`;

/** Smooth value noise, 0-1. */
export const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** `textures`: further pictures the fragment samples, each by its uniform name (set again with `filter.resources[name] = …`). */
export function makeFilter(fragment: string, name: string, initial: Record<string, number>, textures: Record<string, TextureSource> = {}) {
  const group = new UniformGroup(Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, { value, type: 'f32' as const }])));
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment, name }),
    resources: { treatmentUniforms: group, ...textures },
  });
  return {
    filter,
    set: (values: Record<string, number>) => { Object.assign(group.uniforms, values); },
  };
}
