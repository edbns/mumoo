/**
 * The edit preset's pass (`edit-presets.ts`): the Directed picture drawn once more through the preset's camera, colour and texture
 * (`preset-motion.ts` says what, at each moment), with the camcorder's REC display on top for the take that has it. What comes out is
 * the picture Directed and every treatment are then made of, so the lyrics stay on top, untouched. Preview and cloud render share this code.
 */
import { Container, Filter, GlProgram, Graphics, RenderTexture, Sprite, Text, UniformGroup, type Renderer, type Texture } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { references } from './pack-palette';
import type { PresetFrame } from './preset-motion';

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

const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform float uTime;
uniform float uSeed;
uniform float uAspect;
uniform float uZoom;
uniform float uShiftX;
uniform float uShiftY;
uniform float uRotate;
uniform float uWhip;
uniform float uZoomBlur;
uniform float uBarrel;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uLift;
uniform float uCrush;
uniform float uShR;
uniform float uShG;
uniform float uShB;
uniform float uHiR;
uniform float uHiG;
uniform float uHiB;
uniform float uMono;
uniform float uHalation;
uniform float uHaR;
uniform float uHaG;
uniform float uHaB;
uniform float uGrain;
uniform float uGrainSize;
uniform float uChroma;
uniform float uTracking;
uniform float uScan;
uniform float uSoften;
uniform float uSharpen;
uniform float uVignette;
uniform float uFlash;
uniform float uLeak;
uniform float uLeakX;
uniform float uTear;
uniform float uPulse;

vec2 frameMax() { return uOutputFrame.zw * uInputSize.zw; }
vec2 mirrored(vec2 n) { return 1.0 - abs(1.0 - mod(n, 2.0)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 pick(vec2 n) { return texture(uTexture, mirrored(n) * frameMax()).rgb; }

/** Where the camera looks for a point of the frame: the wide lens bends the edges, then the camera turns, closes in and moves. */
vec2 camera(vec2 n) {
  vec2 d = n - 0.5;
  if (uBarrel > 0.0) {
    vec2 a = d * vec2(1.0, uAspect);
    float r2 = dot(a, a) / (0.25 + 0.25 * uAspect * uAspect);
    d *= (1.0 + uBarrel * r2) / (1.0 + uBarrel);
  }
  vec2 p = d * vec2(1.0, uAspect);
  float c = cos(uRotate);
  float s = sin(uRotate);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / uZoom;
  return p / vec2(1.0, uAspect) + 0.5 - vec2(uShiftX, uShiftY);
}

void main(void) {
  vec2 n = vTextureCoord / frameMax();
  float frame = floor(uTime * 30.0);
  // Tape: a band rolls down the picture, and a heavy hit tears another; both drag the lines sideways.
  float band = (1.0 - smoothstep(0.0, 0.035, abs(n.y - fract(uTime * 0.09 + uSeed * 0.37)))) * uTracking;
  float tear = uTear * (1.0 - smoothstep(0.0, 0.07, abs(n.y - fract(uSeed * 0.71 + frame * 0.137))));
  float dx = (hash(vec2(floor(n.y * 270.0), frame)) - 0.5) * 0.03 * (band + tear) + sin(n.y * 90.0 + uTime * 5.0) * 0.0005 * uTracking;
  vec2 s = camera(n) + vec2(dx, 0.0);

  vec3 c;
  float zoomBlur = uZoomBlur + uPulse * 0.018;
  float moving = abs(uWhip) + zoomBlur;
  if (moving > 0.0005) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 9; i++) {
      float k = float(i) / 8.0 - 0.5;
      sum += pick(s + vec2(k * abs(uWhip), 0.0) + (s - 0.5) * k * zoomBlur);
    }
    c = sum / 9.0;
  } else if (uSoften > 0.0) {
    c = (pick(s - vec2(uSoften, 0.0)) + pick(s) * 2.0 + pick(s + vec2(uSoften, 0.0))) / 4.0;
  } else {
    c = pick(s);
  }
  if (uChroma > 0.0) {
    vec2 o = vec2(uChroma / 1080.0, 0.0);
    c.r = mix(c.r, pick(s + o).r, 0.85);
    c.b = mix(c.b, pick(s - o).b, 0.85);
  }
  if (uPulse > 0.0) {
    // Colours split outward from the middle, most at the edges, as a lens does.
    vec2 spread = (s - 0.5) * uPulse * 0.022;
    c.r = pick(s + spread).r;
    c.b = pick(s - spread).b;
  }
  if (uSharpen > 0.0) {
    vec2 px = vec2(1.5 / 1080.0, 1.5 / 1920.0);
    vec3 around = (pick(s + vec2(px.x, 0.0)) + pick(s - vec2(px.x, 0.0)) + pick(s + vec2(0.0, px.y)) + pick(s - vec2(0.0, px.y))) / 4.0;
    c += (c - around) * uSharpen * 2.0;
  }
  vec3 glow = vec3(0.0);
  if (uHalation > 0.0) {
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      glow += max(pick(s + vec2(cos(a), sin(a) / uAspect) * 0.014) - 0.6, 0.0);
    }
    glow /= 8.0;
  }

  c *= uExposure;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  c += vec3(uShR, uShG, uShB) * (1.0 - l) * (1.0 - l) * 1.6 + vec3(uHiR, uHiG, uHiB) * l * l * 1.6;
  c = (c - 0.5) * uContrast + 0.5;
  c = max(c - uCrush, 0.0) / (1.0 - uCrush);
  c = uLift + c * (1.0 - uLift);
  c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), uMono);
  c += glow * vec3(uHaR, uHaG, uHaB) * uHalation * 2.5;

  if (uLeak > 0.0) {
    vec2 q = (n - vec2(uLeakX, 0.38)) * vec2(1.0, 0.55);
    vec3 burn = vec3(1.0, 0.45, 0.14) * uLeak * (exp(-dot(q, q) * 7.0) * 0.95 + 0.22 * (1.0 - n.x));
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - clamp(burn, 0.0, 1.0));
  }
  if (uGrain > 0.0) {
    float g = hash(floor(gl_FragCoord.xy / uGrainSize) + frame * vec2(17.0, 31.0)) - 0.5;
    float mid = 1.0 - abs(dot(c, vec3(0.299, 0.587, 0.114)) - 0.5) * 1.2;
    c += g * uGrain * (0.6 + 0.6 * mid);
  }
  if (uTracking > 0.0) {
    c *= 1.0 - uScan * 0.5 * (1.0 + sin(gl_FragCoord.y * 1.5708));
    c += (band * 0.07 + tear * 0.14) * hash(vec2(floor(n.x * 400.0), frame + floor(n.y * 300.0)));
  }
  vec2 v = (n - 0.5) * vec2(1.0, 0.75);
  c *= 1.0 - smoothstep(0.25, 0.8, length(v)) * uVignette;
  c = mix(c, vec3(step(0.0, uFlash)), abs(uFlash));
  finalColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const NAMES = [
  'uTime', 'uSeed', 'uAspect', 'uZoom', 'uShiftX', 'uShiftY', 'uRotate', 'uWhip', 'uZoomBlur', 'uBarrel',
  'uExposure', 'uContrast', 'uSaturation', 'uLift', 'uCrush', 'uShR', 'uShG', 'uShB', 'uHiR', 'uHiG', 'uHiB', 'uMono',
  'uHalation', 'uHaR', 'uHaG', 'uHaB', 'uGrain', 'uGrainSize', 'uChroma', 'uTracking', 'uScan', 'uSoften', 'uSharpen',
  'uVignette', 'uFlash', 'uLeak', 'uLeakX', 'uTear', 'uPulse',
] as const;

/** The REC display's face: a pixel face of the catalogue, loaded with the card's own (pack-renderer.ts). */
export const REC_FONT = 'Silkscreen';
const REC_MARGIN = 72;

export type PresetPass = {
  /** The picture through the preset at this moment; the texture it returns is the pass's own, redrawn every call. */
  draw(picture: Texture, frame: PresetFrame, ms: number, seed: number, renderer: Renderer): Texture;
  destroy(): void;
};

/** The palette (lyric colours) of a black-and-white picture is read from a grey copy of it, so the words do not pick a colour it no longer has. */
const greyCopies = new Map<string, HTMLCanvasElement>();
function greyOf(key: string, canvas: HTMLCanvasElement) {
  let grey = greyCopies.get(key);
  if (!grey) {
    grey = document.createElement('canvas');
    grey.width = canvas.width;
    grey.height = canvas.height;
    const context = grey.getContext('2d');
    if (context) {
      context.filter = 'grayscale(1) contrast(1.4)';
      context.drawImage(canvas, 0, 0);
    }
    greyCopies.set(key, grey);
    if (greyCopies.size > 64) greyCopies.delete(greyCopies.keys().next().value!);
  }
  return grey;
}

export function createPresetPass(): PresetPass {
  const group = new UniformGroup(Object.fromEntries(NAMES.map(name => [name, { value: 0, type: 'f32' as const }])));
  const filter = new Filter({ glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'edit-preset' }), resources: { presetUniforms: group } });
  const sprite = new Sprite();
  sprite.filters = [filter];
  const target = RenderTexture.create({ width: WIDTH, height: HEIGHT, resolution: 1 });

  const rec = new Container();
  const dot = new Graphics();
  const style = { fontFamily: `${REC_FONT}, monospace`, fontWeight: '700' as const, fontSize: 46, fill: '#f4f4f0', dropShadow: { color: '#000000', alpha: 0.6, distance: 3, blur: 0, angle: Math.PI / 4 } };
  const recLabel = new Text({ text: 'REC', style });
  const time = new Text({ text: '', style: { ...style, fontSize: 40 } });
  const date = new Text({ text: '', style: { ...style, fontSize: 40 } });
  recLabel.position.set(REC_MARGIN + 46, REC_MARGIN);
  time.anchor.set(1, 1);
  date.anchor.set(1, 1);
  time.position.set(WIDTH - REC_MARGIN, HEIGHT - REC_MARGIN - 52);
  date.position.set(WIDTH - REC_MARGIN, HEIGHT - REC_MARGIN);
  rec.addChild(dot, recLabel, time, date);

  return {
    draw(picture, frame, ms, seed, renderer) {
      const { look } = frame;
      Object.assign(group.uniforms, {
        uTime: ms / 1000, uSeed: (seed % 1000) / 1000, uAspect: HEIGHT / WIDTH,
        uZoom: frame.zoom, uShiftX: frame.shiftX, uShiftY: frame.shiftY, uRotate: frame.rotate,
        uWhip: frame.whipBlur, uZoomBlur: frame.zoomBlur, uBarrel: look.barrel,
        uExposure: look.exposure, uContrast: look.contrast, uSaturation: look.saturation, uLift: look.lift, uCrush: look.crush,
        uShR: look.shadow[0], uShG: look.shadow[1], uShB: look.shadow[2],
        uHiR: look.highlight[0], uHiG: look.highlight[1], uHiB: look.highlight[2], uMono: look.mono,
        uHalation: look.halation, uHaR: look.halationTint[0], uHaG: look.halationTint[1], uHaB: look.halationTint[2],
        uGrain: look.grain, uGrainSize: look.grainSize, uChroma: look.chroma, uTracking: look.tracking, uScan: look.scan,
        uSoften: look.soften, uSharpen: look.sharpen, uVignette: look.vignette,
        uFlash: frame.flash, uLeak: frame.leak, uLeakX: frame.leakX, uTear: frame.tear, uPulse: frame.pulse,
      });
      sprite.texture = picture;
      sprite.width = WIDTH;
      sprite.height = HEIGHT;
      renderer.render({ container: sprite, target, clear: true });
      if (frame.rec) {
        dot.clear();
        if (frame.rec.blink) {
          dot.circle(REC_MARGIN + 16, REC_MARGIN + 24, 15);
          dot.fill({ color: 0xe8202a });
        }
        time.text = frame.rec.time;
        date.text = frame.rec.date;
        renderer.render({ container: rec, target, clear: false });
      }
      // The lyric colours are read from the picture as it was (a grey copy for black and white): the pass itself cannot be read back.
      const reference = references.get(picture) ?? { key: `uid:${picture.uid}`, canvas: picture.source.resource as HTMLCanvasElement };
      references.set(target, look.mono >= 0.5 ? { key: `${reference.key}|grey`, canvas: greyOf(reference.key, reference.canvas) } : reference);
      return target;
    },
    destroy() {
      sprite.filters = [];
      filter.destroy();
      sprite.destroy();
      rec.destroy({ children: true });
      target.destroy(true);
    },
  };
}
