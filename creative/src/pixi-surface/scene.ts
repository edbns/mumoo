import { Application, Container, Filter, Rectangle, Sprite, Text, Texture, UniformGroup } from 'pixi.js';
import type { ReactiveTimeline } from '../assembly';
import { variation } from '../assembly';
import { evaluate, type Composition } from '../composition';
import { createMusicSignalAdapter } from '../visual-signals/adapter';

export interface SurfaceParameters { intensity: number; displacementStrength: number; ambientMotion: number; transientResponse: number; recoveryMs: number }
export const DEFAULT_SURFACE_PARAMETERS: Readonly<SurfaceParameters> = Object.freeze({ intensity: 0.8, displacementStrength: 0.6, ambientMotion: 0.6, transientResponse: 0.55, recoveryMs: 420 });
const clamp = (n: number, max = 1) => Math.max(0, Math.min(max, Number.isFinite(n) ? n : 0));
const vertex = `in vec2 aPosition; out vec2 vTextureCoord; uniform vec4 uInputSize; uniform vec4 uOutputFrame; uniform vec4 uOutputTexture;
void main(){ vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy; p.x=p.x*(2.0/uOutputTexture.x)-1.0; p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z; gl_Position=vec4(p,0.0,1.0); vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw); }`;
const fragment = `in vec2 vTextureCoord; out vec4 finalColor; uniform sampler2D uTexture; uniform vec4 uInputClamp; uniform float uPressure; uniform float uTransient; uniform float uPhase; uniform float uCenterX; uniform float uCenterY;
void main(){ vec2 uv=vTextureCoord; vec2 delta=uv-vec2(uCenterX,uCenterY); vec2 d=delta*vec2(1.0,1.3); float radius=length(d); float local=exp(-radius*radius*18.0); float ripple=sin(radius*22.0-uPhase*1.2); vec2 displaced=uv + normalize(d+vec2(0.00001))*local*ripple*uPressure*0.0035; displaced=clamp(displaced,uInputClamp.xy,uInputClamp.zw); vec4 c=texture(uTexture,displaced); float split=uTransient*0.0012*local; c.r=texture(uTexture,clamp(displaced+vec2(split,0.0),uInputClamp.xy,uInputClamp.zw)).r; c.b=texture(uTexture,clamp(displaced-vec2(split,0.0),uInputClamp.xy,uInputClamp.zw)).b; finalColor=c; }`;

/** Isolated image-surface experiment. The lyric layer is outside the image filter. */
export async function createSurfaceScene(canvas: HTMLCanvasElement, timeline: ReactiveTimeline | null, seed: number, lyrics: Composition, imageUrl: string, input: SurfaceParameters = DEFAULT_SURFACE_PARAMETERS) {
  if (!imageUrl || !Number.isSafeInteger(seed) || seed < 0) throw new Error('A valid image and seed are required.');
  const p = { intensity: clamp(input.intensity), displacementStrength: clamp(input.displacementStrength), ambientMotion: clamp(input.ambientMotion), transientResponse: clamp(input.transientResponse), recoveryMs: Math.max(80, Math.min(1600, Number.isFinite(input.recoveryMs) ? input.recoveryMs : 420)) };
  const image = new Image(); image.src = imageUrl; await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image could not be decoded.');
  const app = new Application();
  await app.init({ canvas, width: 1080, height: 1920, preference: 'webgl', autoStart: false, sharedTicker: false, antialias: false, background: '#101010' });
  app.ticker.stop();
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) { app.destroy(); throw new Error('WebGL is unavailable.'); }
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
  const compatibility = !renderer ? 'unknown' : /swiftshader|software|llvmpipe/i.test(renderer) ? 'software' : 'hardware';
  const imageTexture = Texture.from(image);
  const surface = new Container(); const sprite = new Sprite(imageTexture);
  sprite.anchor.set(0.5); sprite.position.set(540, 960); surface.addChild(sprite);
  surface.filterArea = new Rectangle(0, 0, 1080, 1920);
  const uniforms = new UniformGroup({ uPressure: { value: 0, type: 'f32' }, uTransient: { value: 0, type: 'f32' }, uPhase: { value: 0, type: 'f32' }, uCenterX: { value: 0.5, type: 'f32' }, uCenterY: { value: 0.5, type: 'f32' } });
  const filter = Filter.from({ gl: { vertex, fragment, name: 'mumoo-surface-v1' }, resources: { surfaceUniforms: uniforms } });
  surface.filters = [filter]; app.stage.addChild(surface);
  const text = new Text({ text: '', style: { fontFamily: 'Inter Variable', fontSize: 90, fontWeight: '800', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: 880, dropShadow: { color: '#000000', alpha: 0.75, blur: 8, distance: 3 } } });
  text.anchor.set(0.5); text.position.set(540, 1200); app.stage.addChild(text);
  const signals = createMusicSignalAdapter(timeline, { recoveryMs: p.recoveryMs });
  const phase = variation(seed, 1) * Math.PI * 2;
  const baseScale = Math.max(1080 / image.naturalWidth, 1920 / image.naturalHeight) * 1.025;
  uniforms.uniforms.uCenterX = 0.38 + 0.24 * variation(seed, 2);
  uniforms.uniforms.uCenterY = 0.38 + 0.24 * variation(seed, 3);
  return { compatibility, async render(frame: number) {
    if (gl.isContextLost()) throw new Error('Graphics context was lost.');
    const signal = signals(frame), t = frame / 30;
    const pressure = signal.beat * p.intensity;
    const zoom = baseScale * (1 + 0.004 * pressure + 0.002 * p.ambientMotion * Math.sin(t * 0.17 + phase));
    sprite.scale.set(zoom);
    sprite.position.set(540 + 4 * p.ambientMotion * Math.sin(t * 0.16 + phase), 960 + 5 * p.ambientMotion * Math.sin(t * 0.12 + phase * 0.7));
    uniforms.uniforms.uPressure = pressure * p.displacementStrength;
    uniforms.uniforms.uTransient = Math.max(0, (signal.transient - 0.55) / 0.45) * p.transientResponse * p.intensity;
    uniforms.uniforms.uPhase = t;
    text.text = evaluate(lyrics, frame).text;
    app.render();
  }, destroy() { app.destroy(false, { children: true }); filter.destroy(); imageTexture.destroy(true); } };
}
